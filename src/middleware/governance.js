const logger = require('../core/logger');

function generateReqId() {
    return 'req-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

function resolveDomain(inputPath = '') {
    const p = String(inputPath || '');
    if (p.startsWith('/api/player')) return 'Player';
    if (p.startsWith('/api/proxy')) return 'Proxy';
    if (p.startsWith('/api/catchup') || p.startsWith('/api/epg')) return 'Replay';
    if (p.startsWith('/api/system/replay-rules')) return 'Replay';
    if (p.startsWith('/api/export')) return 'Export';
    if (p.startsWith('/api/persist') || p.startsWith('/api/webdav')) return 'Persist';
    if (p.startsWith('/api/config') || p.startsWith('/api/settings')) return 'Config';
    if (p.startsWith('/api/stream') || p.startsWith('/api/check')) return 'Detect';
    if (p.startsWith('/api/logs')) return 'Logs';
    if (p.startsWith('/api/auth') || p.startsWith('/api/login') || p.startsWith('/api/captcha')) return 'Auth';
    return 'App';
}

function requestContext(req, res, next) {
    const headerReqId = req.headers && (req.headers['x-request-id'] || req.headers['x-trace-id']);
    req.reqId = String(headerReqId || '').trim() || generateReqId();
    req.domain = resolveDomain(req.originalUrl || req.path || '');
    res.setHeader('X-Request-Id', req.reqId);
    next();
}

function attachResponseHelpers(req, res, next) {
    res.apiSuccess = function(payload = {}, statusCode = 200) {
        const body = payload && typeof payload === 'object' ? payload : {};
        const merged = Object.prototype.hasOwnProperty.call(body, 'success') ? body : { success: true, ...body };
        return res.status(statusCode).json(merged);
    };
    res.apiFail = function(message, statusCode = 500, extra = {}) {
        const body = {
            success: false,
            message: String(message || '服务器内部错误'),
            ...(extra && typeof extra === 'object' ? extra : {})
        };
        return res.status(statusCode).json(body);
    };
    req.log = {
        debug: (msg, data) => logger.debug(msg, req.domain, data, req.reqId),
        info: (msg, data) => logger.info(msg, req.domain, data, req.reqId),
        warn: (msg, data) => logger.warn(msg, req.domain, data, req.reqId),
        error: (msg, data) => logger.error(msg, req.domain, data, req.reqId)
    };
    next();
}

function wrapAsync(handler) {
    return function(req, res, next) {
        Promise.resolve(handler(req, res, next)).catch(next);
    };
}

module.exports = {
    resolveDomain,
    requestContext,
    attachResponseHelpers,
    wrapAsync
};
