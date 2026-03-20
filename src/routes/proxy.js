const express = require('express');
const axios = require('axios');
const zlib = require('zlib');
const http = require('http');
const https = require('https');
const logger = require('../core/logger');
const config = require('../config');
const logMask = require('../utils/log-mask');
const { wrapAsync } = require('../middleware/governance');

const router = express.Router();
const route = (method, path, handler) => router[method](path, wrapAsync(handler));

function apiFail(res, message, statusCode = 500, extra = {}) {
    if (typeof res.apiFail === 'function') return res.apiFail(message, statusCode, extra);
    return res.status(statusCode).json({ success: false, message, ...(extra || {}) });
}
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 200 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 200 });
const proxyTimeout = Math.max(1000, parseInt(String(process.env.PROXY_TIMEOUT || '10000'), 10) || 10000);
const proxyHlsTimeout = Math.max(1000, parseInt(String(process.env.PROXY_HLS_TIMEOUT || process.env.PROXY_TIMEOUT || '10000'), 10) || 10000);
const proxyConnection = String(process.env.PROXY_CONNECTION || 'keep-alive').trim() || 'keep-alive';

// 简单流代理（用于HLS播放跨域绕过）
route('get', '/proxy/stream', async (req, res) => {
    try {
        const url = String(req.query.url || '').trim();
        const metaTitle = String(req.query.title || req.query.tvgName || '').trim();
        const mode = String(req.query.mode || '').trim();
        const cast = String(req.query.cast || '').trim();
        const programTitle = String(req.query.programTitle || '').trim();
        const scope = String(req.query.scope || '').trim();
        const metaInfo = [
            metaTitle ? `频道: ${metaTitle}` : '',
            mode && cast ? `类型: ${mode}/${cast}` : (mode ? `类型: ${mode}` : (cast ? `类型: ${cast}` : '')),
            programTitle ? `节目: ${programTitle}` : '',
            scope ? `范围: ${scope}` : '',
            url ? `地址: ${logMask.maskUrlHost(url)}` : ''
        ].filter(Boolean).join(' | ');
        if (metaInfo) req.log.info(`播放代理(stream) -> ${metaInfo}`);
        else req.log.info(`播放代理(stream): ${logMask.maskUrlHost(url)}`);
        if (!/^https?:\/\//i.test(url)) {
            req.log.warn(`无效的URL格式: ${logMask.maskUrlHost(url)}`);
            return res.status(400).send('invalid url');
        }
        req.log.debug(`代理转发目标URL: ${logMask.maskUrlHost(url)}`);
        const hdrs = {};
        // 仅转发对流媒体有意义且兼容性最好的请求头，避免上游对 Referer/Origin/Cookie 的拦截
        ['range','user-agent','accept','accept-language'].forEach(h => {
            const v = req.headers[h];
            if (v) hdrs[h] = v;
        });
        const extra = String(process.env.PROXY_PASS_HEADERS || '').trim();
        if (extra) {
            extra.split(',').map(x => x.trim().toLowerCase()).filter(Boolean).forEach(h => {
                const v = req.headers[h];
                if (v && !hdrs[h]) hdrs[h] = v;
            });
        }
        if (process.env.PROXY_UA && !hdrs['user-agent']) hdrs['user-agent'] = process.env.PROXY_UA;
        // 默认添加一些常见的流媒体请求头
        if (!hdrs['user-agent']) {
            hdrs['user-agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36';
        }
        if (!hdrs['accept']) {
            hdrs['accept'] = '*/*';
        }
        hdrs['Connection'] = proxyConnection;
        req.log.debug(`代理请求头: ${JSON.stringify(hdrs)}`);
        const controller = new AbortController();
        req.on('close', () => controller.abort());
        const resp = await axios.get(url, {
            responseType: 'stream',
            headers: hdrs,
            maxRedirects: 5,
            timeout: proxyTimeout,
            validateStatus: () => true,
            httpAgent,
            httpsAgent,
            signal: controller.signal
        });
        req.log.debug(`上游响应状态: ${resp.status}`);
        if (resp.status >= 400) {
            req.log.warn(`代理上游返回错误: ${resp.status} ${logMask.maskUrlHost(url)}`);
        }
        // 记录响应头
        req.log.debug(`上游响应头: ${JSON.stringify(resp.headers)}`);
        res.status(resp.status);
        const ct = resp.headers && (resp.headers['content-type'] || resp.headers['Content-Type']);
        if (ct) res.set('Content-Type', ct);
        const ar = resp.headers && (resp.headers['accept-ranges'] || resp.headers['Accept-Ranges']);
        if (ar) res.set('Accept-Ranges', ar);
        // 透出上游调试信息（便于定位 502 等问题）
        res.set('X-Upstream-Status', String(resp.status));
        if (resp.headers && (resp.headers['server'] || resp.headers['Server'])) {
            res.set('X-Upstream-Server', String(resp.headers['server'] || resp.headers['Server']));
        }
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Access-Control-Expose-Headers', '*,X-Upstream-Status,X-Upstream-Server');
        res.on('close', () => {
            try { resp.data && resp.data.destroy && resp.data.destroy(); } catch (e) {}
        });
        resp.data.pipe(res);
    } catch (e) {
        req.log.error(`代理异常: ${e.message}`);
        if (e.code === 'ECONNREFUSED') {
            res.status(502).send('Upstream connection refused');
        } else if (e.code === 'ETIMEDOUT') {
            res.status(504).send('Upstream timeout');
        } else {
            res.status(502).send('proxy error');
        }
    }
});

function rewriteHlsPlaylist(content, baseUrl) {
    const lines = String(content || '').split(/\r?\n/);
    const toAbs = (p) => {
        try { return new URL(p, baseUrl).href; } catch(e) { return p; }
    };
    const rewriteAttrUri = (line) => {
        const m = line.match(/URI="([^"]+)"/i);
        if (!m) return line;
        const abs = toAbs(m[1]);
        const isM3u8 = /\.m3u8(\?|$)/i.test(abs);
        const prox = (isM3u8 ? '/api/proxy/hls?url=' : '/api/proxy/stream?url=') + encodeURIComponent(abs);
        return line.replace(/URI="([^"]+)"/i, 'URI="'+prox+'"');
    };
    const out = lines.map(l => {
        const t = l.trim();
        if (!t) return l;
        if (t.startsWith('#EXT-X-KEY') || t.startsWith('#EXT-X-MAP')) {
            return rewriteAttrUri(l);
        }
        if (t.startsWith('#')) return l;
        const abs = toAbs(t);
        const isM3u8 = /\.m3u8(\?|$)/i.test(abs);
        return (isM3u8 ? '/api/proxy/hls?url=' : '/api/proxy/stream?url=') + encodeURIComponent(abs);
    });
    return out.join('\n');
}

route('get', '/proxy/hls', async (req, res) => {
    try {
        const url = String(req.query.url || '').trim();
        const metaTitle = String(req.query.title || req.query.tvgName || '').trim();
        const mode = String(req.query.mode || '').trim();
        const cast = String(req.query.cast || '').trim();
        const programTitle = String(req.query.programTitle || '').trim();
        const scope = String(req.query.scope || '').trim();
        const metaInfo = [
            metaTitle ? `频道: ${metaTitle}` : '',
            mode && cast ? `类型: ${mode}/${cast}` : (mode ? `类型: ${mode}` : (cast ? `类型: ${cast}` : '')),
            programTitle ? `节目: ${programTitle}` : '',
            scope ? `范围: ${scope}` : '',
            url ? `地址: ${logMask.maskUrlHost(url)}` : ''
        ].filter(Boolean).join(' | ');
        if (metaInfo) req.log.info(`播放代理(hls) -> ${metaInfo}`);
        else req.log.info(`播放代理(hls): ${logMask.maskUrlHost(url)}`);
        if (!/^https?:\/\//i.test(url)) return res.status(400).send('invalid url');
        const hdrs = {};
        // 保持最小头部集合，减少上游基于来源校验导致的失败
        ['user-agent','accept','accept-language'].forEach(h => {
            const v = req.headers[h];
            if (v) hdrs[h] = v;
        });
        const extra = String(process.env.PROXY_PASS_HEADERS || '').trim();
        if (extra) {
            extra.split(',').map(x => x.trim().toLowerCase()).filter(Boolean).forEach(h => {
                const v = req.headers[h];
                if (v && !hdrs[h]) hdrs[h] = v;
            });
        }
        if (process.env.PROXY_UA && !hdrs['user-agent']) hdrs['user-agent'] = process.env.PROXY_UA;
        hdrs['Connection'] = proxyConnection;
        const controller = new AbortController();
        req.on('close', () => controller.abort());
        const resp = await axios.get(url, {
            responseType: 'arraybuffer',
            headers: hdrs,
            maxRedirects: 5,
            timeout: proxyHlsTimeout,
            validateStatus: () => true,
            httpAgent,
            httpsAgent,
            signal: controller.signal
        });
        if (resp.status < 200 || resp.status >= 300) {
            try { console.warn('proxy_hls_upstream_status', resp.status, logMask.maskUrlHost(url)); } catch(e){}
        }
        if (resp.status < 200 || resp.status >= 300) {
            res.status(resp.status).send(String(resp.data || ''));
            return;
        }
        let text = Buffer.from(resp.data).toString('utf-8');
        const enc = (resp.headers && (resp.headers['content-encoding'] || resp.headers['Content-Encoding'])) || '';
        if (/gzip/i.test(enc)) {
            try { text = zlib.gunzipSync(Buffer.from(resp.data)).toString('utf-8'); } catch(e) {}
        }
        const body = rewriteHlsPlaylist(text, url);
        res.set('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
        // 透出上游调试信息（便于定位 4xx/5xx）
        res.set('X-Upstream-Status', String(resp.status));
        if (resp.headers && (resp.headers['server'] || resp.headers['Server'])) {
            res.set('X-Upstream-Server', String(resp.headers['server'] || resp.headers['Server']));
        }
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Access-Control-Expose-Headers', '*,X-Upstream-Status,X-Upstream-Server');
        res.send(body);
    } catch (e) {
        req.log.error(`proxy hls error: ${e.message}`);
        return apiFail(res, 'proxy hls error', 502);
    }
});

module.exports = router;
