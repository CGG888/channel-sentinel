/**
 * CDN 管理路由
 * 提供 CDN 配置和检测的 API 接口
 */

const express = require('express');
const router = express.Router();
const cdnManager = require('../services/cdn-manager');
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

// 获取 CDN 列表
route('get', '/cdn/list', async (req, res) => {
    const list = await cdnManager.getCdnList();
    return apiSuccess(res, { cdn: list });
});

// 重新检测所有 CDN
route('post', '/cdn/test', async (req, res) => {
    const ranked = await cdnManager.detectAllCdns();
    return apiSuccess(res, {
        ranked,
        message: `检测完成，可用 CDN: ${ranked.filter(x => x.available).length} 个`
    });
});

// 添加自定义 CDN
route('post', '/cdn/custom', async (req, res) => {
    const { url } = req.body || {};
    if (!url) {
        return apiFail(res, '请提供 CDN 地址', 400);
    }
    const result = await cdnManager.addCustomCdn(url);
    if (!result.success) {
        return apiFail(res, result.message, 400);
    }
    return apiSuccess(res, result);
});

// 删除自定义 CDN
route('delete', '/cdn/custom', async (req, res) => {
    const { url } = req.body || {};
    if (!url) {
        return apiFail(res, '请提供要删除的 CDN 地址', 400);
    }
    const result = await cdnManager.removeCustomCdn(url);
    if (!result.success) {
        return apiFail(res, result.message, 400);
    }
    return apiSuccess(res, result);
});

// 更新 CDN 设置
route('put', '/cdn/settings', async (req, res) => {
    const { enabled, autoSelect, selected } = req.body || {};
    const result = cdnManager.updateCdnSettings({ enabled, autoSelect, selected });
    return apiSuccess(res, result);
});

// 获取当前选中的 CDN（内部使用）
route('get', '/cdn/selected', async (req, res) => {
    const selected = await cdnManager.getSelectedCdn();
    return apiSuccess(res, { selected });
});

module.exports = router;
