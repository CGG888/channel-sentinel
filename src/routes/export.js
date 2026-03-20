const express = require('express');
const crypto = require('crypto');
const exportService = require('../services/export');
const config = require('../config');
const logger = require('../core/logger');
const streamsReader = require('../storage/streams-reader');
const configReader = require('../storage/config-reader');
const { wrapAsync } = require('../middleware/governance');

const router = express.Router();
const route = (method, path, ...handlers) => {
    const wrapped = handlers.map((h, i) => (i === handlers.length - 1 ? wrapAsync(h) : h));
    router[method](path, ...wrapped);
};

function apiSuccess(res, payload = {}, statusCode = 200) {
    if (typeof res.apiSuccess === 'function') return res.apiSuccess(payload, statusCode);
    return res.status(statusCode).json({ success: true, ...(payload || {}) });
}

function apiFail(res, message, statusCode = 500, extra = {}) {
    if (typeof res.apiFail === 'function') return res.apiFail(message, statusCode, extra);
    return res.status(statusCode).json({ success: false, message, ...(extra || {}) });
}

function unwrapSecret(v) {
    let out = String(v || '');
    if (!out) return '';
    if (typeof config.decryptSecret !== 'function') return out;
    for (let i = 0; i < 64; i++) {
        if (!out.startsWith('enc:v1:')) return out;
        const next = config.decryptSecret(out);
        if (!next || next === out) return '';
        out = String(next);
    }
    return out.startsWith('enc:v1:') ? '' : out;
}

function normalizeScope(scope) {
    const v = String(scope || 'internal').toLowerCase();
    if (v === 'external' || v === 'internet' || v === '外网') return 'external';
    if (v === 'internal' || v === 'lan' || v === '内网') return 'internal';
    return 'internal';
}

function getAppSettingsForExport() {
    try {
        const runtime = { ...(config.getConfig('appSettings') || {}) };
        if (typeof runtime.securityToken === 'string') runtime.securityToken = unwrapSecret(runtime.securityToken);
        else runtime.securityToken = '';
        return runtime;
    } catch (e) {}
    return config.getConfig('appSettings') || {};
}

function getTokenFromRequest(req) {
    const q = req && req.query ? req.query : {};
    const h = req && req.headers ? req.headers : {};
    const fromQuery = String(q.token || q.access_token || '').trim();
    if (fromQuery) return fromQuery;
    const bearer = String(h.authorization || '').trim();
    if (/^Bearer\s+/i.test(bearer)) {
        return bearer.replace(/^Bearer\s+/i, '').trim();
    }
    const fromHeader = String(h['x-export-token'] || '').trim();
    if (fromHeader) return fromHeader;
    return '';
}

function safeEqual(a, b) {
    const sa = String(a || '');
    const sb = String(b || '');
    const ba = Buffer.from(sa, 'utf8');
    const bb = Buffer.from(sb, 'utf8');
    if (ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
}

function validateExportToken(req, res, next) {
    const scope = normalizeScope(req.query.scope);
    const appSettings = getAppSettingsForExport();
    if (scope === 'external' && appSettings.enableToken && appSettings.securityToken) {
        const token = getTokenFromRequest(req);
        if (!safeEqual(token, appSettings.securityToken)) {
            if (req.log && typeof req.log.warn === 'function') req.log.warn(`导出鉴权失败: scope=${scope}, path=${req.path}`);
            else logger.warn(`导出鉴权失败: scope=${scope}, path=${req.path}`, 'Export');
            return res.status(403).send('Access Denied: Invalid Token');
        }
    }
    next();
}

async function getStreamsForExport() {
    const streams = config.getConfig('streams').streams || [];
    return streamsReader.loadStreamsFallback(streams);
}

async function hydrateExportConfigs() {
    try {
        const appSettings = await configReader.loadAppSettingsFallback(config.getConfig('appSettings') || {});
        config.updateConfig('appSettings', appSettings || {});
    } catch (e) {}
    try {
        const proxyCfg = await configReader.loadProxyServersFallback(config.getConfig('proxyServers') || { list: [] });
        config.updateConfig('proxyServers', proxyCfg || { list: [] });
    } catch (e) {}
    try {
        const udpxyCfg = await configReader.loadUdpxyServersFallback(config.getConfig('udpxyServers') || { servers: [], currentId: '' });
        config.updateConfig('udpxyServers', udpxyCfg || { servers: [], currentId: '' });
    } catch (e) {}
    try {
        const logoCfg = await configReader.loadLogoTemplatesFallback(config.getConfig('logoTemplates') || { templates: [], currentId: '' });
        config.updateConfig('logoTemplates', logoCfg || { templates: [], currentId: '' });
    } catch (e) {}
    try {
        const epgCfg = await configReader.loadEpgSourcesFallback(config.getConfig('epgSources') || { sources: [] });
        config.updateConfig('epgSources', epgCfg || { sources: [] });
    } catch (e) {}
}

// TXT格式导出
route('get', '/export/txt', validateExportToken, async (req, res) => {
    try {
        await hydrateExportConfigs();
        const scope = normalizeScope(req.query.scope);
        const status = String(req.query.status || 'all').toLowerCase();
        const stripSuffix = String(req.query.stripSuffix || '').toLowerCase();
        const noSuffix = stripSuffix === '1' || stripSuffix === 'true' || stripSuffix === 'yes';
        
        const streams = await getStreamsForExport();
        const content = exportService.generateTxtExport(streams, {
            scope,
            status,
            stripSuffix: noSuffix
        });
        
        res.type('text/plain; charset=utf-8').send(content);
    } catch (error) {
        req.log.error(`TXT导出失败: ${error.message}`);
        return res.status(500).send('导出失败');
    }
});

// M3U格式导出
route('get', '/export/m3u', validateExportToken, async (req, res) => {
    try {
        await hydrateExportConfigs();
        const scope = normalizeScope(req.query.scope);
        const status = String(req.query.status || 'all').toLowerCase();
        const fmt = String(req.query.fmt || 'default').toLowerCase();
        const proto = String(req.query.proto || 'http').toLowerCase();
        const stripSuffix = String(req.query.stripSuffix || '').toLowerCase();
        const noSuffix = (fmt === 'default') || stripSuffix === '1' || stripSuffix === 'true' || stripSuffix === 'yes';
        
        const streams = await getStreamsForExport();
        const content = exportService.generateM3uExport(streams, {
            scope,
            status,
            fmt,
            proto,
            stripSuffix: noSuffix
        });
        
        res.type('text/plain; charset=utf-8').send(content);
    } catch (error) {
        req.log.error(`M3U导出失败: ${error.message}`);
        return res.status(500).send('导出失败');
    }
});

// JSON格式导出
route('get', '/export/json', validateExportToken, async (req, res) => {
    try {
        await hydrateExportConfigs();
        const scope = normalizeScope(req.query.scope);
        const status = String(req.query.status || 'all').toLowerCase();
        
        const streams = await getStreamsForExport();
        const filtered = exportService.generateJsonExport(streams, {
            scope,
            status
        });
        
        return apiSuccess(res, { count: filtered.length, streams: filtered });
    } catch (error) {
        req.log.error(`JSON导出失败: ${error.message}`);
        return apiFail(res, '导出失败', 500);
    }
});

// TVBOX格式导出（暂时保留原逻辑，稍后重构）
route('get', '/export/tvbox', validateExportToken, async (req, res) => {
    try {
        const scope = normalizeScope(req.query.scope);
        const status = String(req.query.status || 'all').toLowerCase();
        const fmt = String(req.query.catchupFmt || 'playseek').toLowerCase();
        
        // 临时实现，使用原index.js中的逻辑（简化版）
        const streams = await getStreamsForExport();
        const settings = config.getConfig('appSettings');
        const udpxyCfg = config.getConfig('udpxyServers');
        const udpxyServers = Array.isArray(udpxyCfg.servers) ? udpxyCfg.servers : [];
        const udpxyCurr = udpxyServers.find(x => x.id === udpxyCfg.currentId) || null;
        const udpxyCurrUrl = udpxyCurr ? (udpxyCurr.url || '') : '';
        
        const filtered = streams.filter(s => {
            if (status === 'online') return s.isAvailable;
            if (status === 'offline') return !s.isAvailable;
            return true;
        });
        
        // 简单转换逻辑
        const groupsMap = {};
        filtered.forEach(s => {
            const g = String(s.groupTitle || '').trim() || '未分类';
            if (!groupsMap[g]) groupsMap[g] = [];
            const name = s.tvgName || s.name || '';
            const logo = '/api/logo?name=' + encodeURIComponent(name) + '&scope=' + scope;
            groupsMap[g].push({
                name: name,
                logo: logo,
                urls: [s.multicastUrl || '']
            });
        });
        
        const lives = Object.keys(groupsMap).map(k => ({ group: k, channels: groupsMap[k] }));
        return apiSuccess(res, { lives });
    } catch (error) {
        req.log.error(`TVBOX导出失败: ${error.message}`);
        return apiFail(res, '导出失败', 500);
    }
});

// XTREAM格式导出（暂时保留原逻辑，稍后重构）
route('get', '/export/xtream', validateExportToken, async (req, res) => {
    try {
        const scope = normalizeScope(req.query.scope);
        const status = String(req.query.status || 'all').toLowerCase();
        const fmt = String(req.query.catchupFmt || 'ku9').toLowerCase();
        
        // 临时实现
        const streams = await getStreamsForExport();
        const filtered = streams.filter(s => {
            if (status === 'online') return s.isAvailable;
            if (status === 'offline') return !s.isAvailable;
            return true;
        });
        
        const live_streams = filtered.map((s, idx) => ({
            name: s.tvgName || s.name || '',
            stream_id: idx + 1,
            stream_icon: '/api/logo?name=' + encodeURIComponent(s.tvgName || s.name || '') + '&scope=' + scope,
            category_name: s.groupTitle || '',
            stream_type: /^https?:\/\//i.test(String(s.multicastUrl || '')) ? 'http' : 'rtp',
            stream_url: s.multicastUrl || ''
        }));
        
        return apiSuccess(res, { live_streams });
    } catch (error) {
        req.log.error(`XTREAM导出失败: ${error.message}`);
        return apiFail(res, '导出失败', 500);
    }
});

module.exports = router;
