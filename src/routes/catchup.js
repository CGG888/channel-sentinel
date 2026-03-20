const express = require('express');
const catchupService = require('../services/catchup');
const logger = require('../core/logger');
const { wrapAsync } = require('../middleware/governance');

const router = express.Router();
const route = (method, path, handler) => router[method](path, wrapAsync(handler));

function apiSuccess(res, payload = {}, statusCode = 200) {
    if (typeof res.apiSuccess === 'function') return res.apiSuccess(payload, statusCode);
    return res.status(statusCode).json({ success: true, ...(payload || {}) });
}

function apiFail(res, message, statusCode = 500, extra = {}) {
    if (typeof res.apiFail === 'function') return res.apiFail(message, statusCode, extra);
    return res.status(statusCode).json({ success: false, message, ...(extra || {}) });
}

/**
 * 回看播放地址生成
 * GET /api/catchup/play
 * 参数:
 *   - scope: 范围 ('internal' 或 'external', 默认 'internal')
 *   - fmt: 回放格式（以 /api/system/replay-rules/catalog 为准，默认 'iso8601'，支持别名与扩展格式）
 *   - proto: 协议 ('http' 或 'rtsp', 默认 'http')
 *   - name: 频道名称
 *   - tvgName: 频道TVG名称
 *   - resolution: 分辨率
 *   - frameRate: 帧率
 *   - multicastUrl: 组播URL
 *   - catchupBase: 回看基础URL
 *   - startMs: 开始时间戳（毫秒）
 *   - endMs: 结束时间戳（毫秒）
 */
route('get', '/catchup/play', async (req, res) => {
    try {
        const scope = String(req.query.scope || 'internal').toLowerCase();
        const fmt = String(req.query.fmt || 'iso8601').toLowerCase();
        const proto = String(req.query.proto || 'http').toLowerCase();
        const name = String(req.query.name || '').trim();
        const tvgName = String(req.query.tvgName || '').trim();
        const resolution = String(req.query.resolution || '').trim();
        const frameRate = String(req.query.frameRate || '').trim();
        const multicastUrl = String(req.query.multicastUrl || '').trim();
        const catchupBase = String(req.query.catchupBase || '').trim();
        const startMs = parseInt(String(req.query.startMs || ''), 10);
        const endMs = parseInt(String(req.query.endMs || ''), 10);

        req.log.info(`回看播放请求: scope=${scope}, name=${name}, startMs=${startMs}, endMs=${endMs}`);

        const result = catchupService.generateCatchupUrl({
            scope,
            fmt,
            proto,
            name,
            tvgName,
            resolution,
            frameRate,
            multicastUrl,
            catchupBase,
            startMs,
            endMs
        });

        if (result.success) {
            req.log.info(`回看播放地址生成成功: ${result.url}`);
            return apiSuccess(res, { url: result.url, meta: result.meta || {} });
        } else {
            req.log.warn(`回看播放地址生成失败: ${result.message}`);
            return apiFail(res, result.message, 400);
        }
    } catch (error) {
        req.log.error(`回看播放处理异常: ${error.message}`);
        return apiFail(res, '服务器内部错误', 500);
    }
});

route('get', '/catchup/profile', async (req, res) => {
    try {
        const scope = String(req.query.scope || 'internal').toLowerCase();
        const fmt = String(req.query.fmt || 'default').toLowerCase();
        const proto = String(req.query.proto || 'http').toLowerCase();
        const name = String(req.query.name || '').trim();
        const tvgName = String(req.query.tvgName || '').trim();
        const resolution = String(req.query.resolution || '').trim();
        const frameRate = String(req.query.frameRate || '').trim();
        const multicastUrl = String(req.query.multicastUrl || '').trim();
        const catchupBase = String(req.query.catchupBase || '').trim();
        const startMs = parseInt(String(req.query.startMs || ''), 10);
        const endMs = parseInt(String(req.query.endMs || ''), 10);
        const result = catchupService.previewCatchup({
            scope,
            fmt,
            proto,
            name,
            tvgName,
            resolution,
            frameRate,
            multicastUrl,
            catchupBase,
            startMs,
            endMs
        });
        if (result.success) return apiSuccess(res, result);
        return apiFail(res, result.message || 'resolve failed', 400);
    } catch (error) {
        req.log.error(`回看预览处理异常: ${error.message}`);
        return apiFail(res, '服务器内部错误', 500);
    }
});

module.exports = router;
