const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const logger = require('../core/logger');
const opsObservability = require('../services/ops-observability');
const moduleHealth = require('../services/module-health');
const { wrapAsync } = require('../middleware/governance');

const route = (method, path, handler) => router[method](path, wrapAsync(handler));

function apiSuccess(res, payload = {}, statusCode = 200) {
    if (typeof res.apiSuccess === 'function') {
        return res.apiSuccess(payload, statusCode);
    }
    return res.status(statusCode).json({ success: true, ...(payload || {}) });
}

function apiFail(res, message, statusCode = 500, extra = {}) {
    if (typeof res.apiFail === 'function') {
        return res.apiFail(message, statusCode, extra);
    }
    return res.status(statusCode).json({ success: false, message, ...(extra || {}) });
}

// 确保日志目录存在
function ensureLogDir() {
    const LOG_DIR = path.join(__dirname, '../../data/logs');
    try {
        if (!fs.existsSync(LOG_DIR)) {
            fs.mkdirSync(LOG_DIR, { recursive: true });
        }
    } catch (e) {
        // 忽略错误
    }
}

function parseLineToLogObject(line) {
    const txt = String(line || '').trim();
    if (!txt) return null;
    const m = txt.match(/^(\d{4}-\d{2}-\d{2}T[^\s]+)\s+(FATAL|ERROR|WARN|INFO|DEBUG)\s+([^\s]+)\s*(.*)$/i);
    if (!m) return null;
    const level = String(m[2] || '').toUpperCase();
    const module = String(m[3] || 'App');
    const rest = String(m[4] || '');
    let reqId = '';
    let message = rest;
    const req = rest.match(/reqId=([^\s]+)\s*/);
    if (req) {
        reqId = req[1] || '';
        message = rest.replace(req[0], '').trim();
    }
    return {
        time: m[1],
        level,
        module,
        reqId,
        message,
        data: null
    };
}

function listLogFiles() {
    ensureLogDir();
    const LOG_DIR = path.join(__dirname, '../../data/logs');
    try {
        return fs.readdirSync(LOG_DIR)
            .filter(f => /^app-\d{8}\.log$/.test(f))
            .sort((a, b) => b.localeCompare(a));
    } catch (e) {
        return [];
    }
}

function readTailFromDisk(lines, level, module, keyword, fileName) {
    const files = listLogFiles();
    const targetName = fileName && /^app-\d{8}\.log$/.test(fileName) ? fileName : (files[0] || '');
    if (!targetName) return [];
    const LOG_DIR = path.join(__dirname, '../../data/logs');
    const targetPath = path.join(LOG_DIR, targetName);
    try {
        const raw = fs.readFileSync(targetPath, 'utf-8');
        const rows = raw.split(/\r?\n/).filter(Boolean);
        const out = [];
        for (let i = Math.max(0, rows.length - Math.max(lines * 5, 500)); i < rows.length; i++) {
            const obj = parseLineToLogObject(rows[i]);
            if (!obj) continue;
            const pass = logger.levelIdx(String(obj.level || '').toLowerCase()) <= logger.levelIdx(level) &&
                (module === 'all' || String(obj.module || '').toLowerCase() === module) &&
                (!keyword || JSON.stringify(obj).toLowerCase().includes(keyword));
            if (pass) out.push(obj);
        }
        return out.slice(-lines);
    } catch (e) {
        return [];
    }
}

// 获取日志文件列表
route('get', '/logs/files', async (req, res) => {
    ensureLogDir();
    try {
        const LOG_DIR = path.join(__dirname, '../../data/logs');
        const list = fs.readdirSync(LOG_DIR)
            .filter(f => /^app-\d{8}\.log$/.test(f))
            .map(f => {
                const p = path.join(LOG_DIR, f);
                let size = 0;
                try {
                    size = fs.statSync(p).size;
                } catch (e) {}
                return { file: f, size };
            })
            .sort((a, b) => b.file.localeCompare(a.file));
        
        return apiSuccess(res, { files: list });
    } catch (e) {
        req.log.warn(`读取日志文件列表失败: ${e.message}`);
        return apiFail(res, '读取日志文件列表失败', 500, { files: [] });
    }
});

// 下载日志文件
route('get', '/logs/download', async (req, res) => {
    ensureLogDir();
    const f = String(req.query.file || '');
    if (!/^app-\d{8}\.log$/.test(f)) {
        return res.status(400).end();
    }
    
    const LOG_DIR = path.join(__dirname, '../../data/logs');
    const p = path.join(LOG_DIR, f);
    
    if (!fs.existsSync(p)) {
        return res.status(404).end();
    }
    
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${f}"`);
    fs.createReadStream(p).pipe(res);
});

// 获取日志尾部内容
route('get', '/logs/tail', async (req, res) => {
    const lines = Math.min(parseInt(req.query.lines || '200', 10) || 200, 2000);
    const level = String(req.query.level || logger.getLogLevel()).toLowerCase();
    const module = String(req.query.module || 'all').toLowerCase();
    const keyword = String(req.query.keyword || '').trim().toLowerCase();
    const file = String(req.query.file || '');
    
    const arr = [];
    const buffer = logger.getLogBuffer();
    
    for (let i = Math.max(0, buffer.length - lines); i < buffer.length; i++) {
        const o = buffer[i];
        const pass = logger.levelIdx(o.level.toLowerCase()) <= logger.levelIdx(level) &&
            (module === 'all' || String(o.module || '').toLowerCase() === module) &&
            (!keyword || JSON.stringify(o).toLowerCase().includes(keyword));
        
        if (pass) arr.push(o);
    }
    
    const merged = arr.length ? arr : readTailFromDisk(lines, level, module, keyword, file);
    return apiSuccess(res, { list: merged });
});

// 获取当前日志级别
route('get', '/logs/level', async (req, res) => {
    return apiSuccess(res, {
        level: logger.getLogLevel(), 
        keepDays: logger.getKeepDays() 
    });
});

route('get', '/logs/domain-metrics', async (req, res) => {
    const metrics = opsObservability.getDomainMetrics();
    return apiSuccess(res, { metrics });
});

route('get', '/logs/module-health', async (req, res) => {
    const rootDir = path.join(__dirname, '../../');
    const snapshot = moduleHealth.buildSnapshot(rootDir);
    const incidents = opsObservability.getIncidentSummary(100);
    const metrics = opsObservability.getDomainMetrics();
    const openIncidentSamples = (Array.isArray(incidents.list) ? incidents.list : [])
        .filter((x) => x && x.status === 'open')
        .slice(0, 5)
        .map((x) => ({
            id: String(x.id || ''),
            domain: String(x.domain || 'app'),
            severity: String(x.severity || 'info'),
            summary: String(x.summary || ''),
            openedAt: String(x.openedAt || '')
        }));
    const errorDomains = Object.values(metrics || {}).filter((x) => Number(x && x.error5xx || 0) > 0).length;
    const error5xxTotal = Object.values(metrics || {}).reduce((sum, x) => sum + Number(x && x.error5xx || 0), 0);
    const errorDomainTop = Object.entries(metrics || {})
        .map(([domain, item]) => ({
            domain: String(domain || ''),
            errorRate: Number(item && item.errorRate || 0),
            error5xx: Number(item && item.error5xx || 0),
            requests: Number(item && item.requests || 0)
        }))
        .filter((x) => x.error5xx > 0 || x.errorRate > 0)
        .sort((a, b) => b.errorRate - a.errorRate || b.error5xx - a.error5xx || b.requests - a.requests)
        .slice(0, 5);
    return apiSuccess(res, {
        ...snapshot,
        exceptions: {
            openIncidents: Number(incidents.open || 0),
            totalIncidents: Number(incidents.total || 0),
            errorDomains,
            error5xxTotal,
            errorDomainTop,
            openIncidentSamples
        }
    });
});

// 设置日志级别
route('post', '/logs/level', async (req, res) => {
    const { level, keepDays } = req.body || {};
    
    if (level && logger.LEVELS.includes(String(level).toLowerCase())) {
        logger.setLevel(level);
    }
    
    if (typeof keepDays === 'number' && keepDays >= 1 && keepDays <= 90) {
        logger.setKeepDays(keepDays);
    }
    
    return apiSuccess(res, {
        level: logger.getLogLevel(), 
        keepDays: logger.getKeepDays() 
    });
});

// SSE日志流
route('get', '/logs/stream', async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    if (typeof res.flushHeaders === 'function') res.flushHeaders();
    res.write('retry: 1500\n\n');
    
    const level = String(req.query.level || logger.getLogLevel()).toLowerCase();
    const module = String(req.query.module || 'all').toLowerCase();
    const keyword = String(req.query.keyword || '').trim().toLowerCase();
    const tail = Math.min(parseInt(req.query.tail || '200', 10) || 200, 2000);
    const file = String(req.query.file || '');
    
    const client = { res, level, module, keyword };
    const sseClients = logger.getSSEClients();
    sseClients.push(client);
    
    // 发送历史日志
    const buffer = logger.getLogBuffer();
    const arr = [];
    for (let i = Math.max(0, buffer.length - tail); i < buffer.length; i++) {
        const o = buffer[i];
        const pass = logger.levelIdx(o.level.toLowerCase()) <= logger.levelIdx(level) &&
            (module === 'all' || String(o.module || '').toLowerCase() === module) &&
            (!keyword || JSON.stringify(o).toLowerCase().includes(keyword));
        
        if (pass) arr.push(o);
    }
    
    const seed = arr.length ? arr : readTailFromDisk(tail, level, module, keyword, file);
    seed.forEach(o => {
        res.write(`data: ${JSON.stringify(o)}\n\n`);
    });
    const keepAliveTimer = setInterval(() => {
        try {
            res.write(`: ping ${Date.now()}\n\n`);
        } catch (e) {}
    }, 15000);
    
    // 清理客户端连接
    req.on('close', () => {
        clearInterval(keepAliveTimer);
        const idx = sseClients.indexOf(client);
        if (idx !== -1) {
            sseClients.splice(idx, 1);
        }
    });
});

module.exports = router;
