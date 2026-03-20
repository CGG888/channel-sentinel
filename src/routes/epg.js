const express = require('express');
const router = express.Router();
const epgService = require('../services/epg');
const logger = require('../core/logger');
const { wrapAsync } = require('../middleware/governance');

const route = (method, path, handler) => router[method](path, wrapAsync(handler));

function apiSuccess(res, payload = {}, statusCode = 200) {
    if (typeof res.apiSuccess === 'function') return res.apiSuccess(payload, statusCode);
    return res.status(statusCode).json({ success: true, ...(payload || {}) });
}

function apiFail(res, message, statusCode = 500, extra = {}) {
    if (typeof res.apiFail === 'function') return res.apiFail(message, statusCode, extra);
    return res.status(statusCode).json({ success: false, message, ...(extra || {}) });
}

// 获取EPG节目列表
route('get', '/epg/programs', async (req, res) => {
    try {
        const scope = String(req.query.scope || 'internal').toLowerCase();
        const channelId = String(req.query.channelId || '').trim();
        const channelName = String(req.query.channelName || '').trim();
        const dateStr = String(req.query.date || '').trim();
        const epgId = String(req.query.epgId || '').trim();
        const forceRefresh = String(req.query.refresh || '') === 'true';

        const result = await epgService.getPrograms(scope, channelId, channelName, dateStr, epgId, forceRefresh);
        
        if (result.success) {
            return apiSuccess(res, result);
        } else {
            return apiSuccess(res, { programs: [], channel: null, message: result.message });
        }
    } catch (e) {
        req.log.error(`EPG节目查询异常: ${e.message}`);
        return apiFail(res, 'EPG节目查询异常', 500, { channel: null, programs: [] });
    }
});

// 刷新EPG数据
route('post', '/epg/refresh', async (req, res) => {
    try {
        const { scope, id } = req.body || {};
        const result = await epgService.refreshEpgData(scope, id);
        if (result && result.success) return apiSuccess(res, result);
        return apiFail(res, (result && result.message) || 'refresh error', 500);
    } catch (e) {
        req.log.error(`EPG刷新异常: ${e.message}`);
        return apiFail(res, 'refresh error', 500);
    }
});

module.exports = router;
