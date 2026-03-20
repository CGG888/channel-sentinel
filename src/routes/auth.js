const express = require('express');
const authManager = require('../core/auth');
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

// 验证码接口
route('get', '/captcha', async (req, res) => {
    const captcha = authManager.generateCaptcha();
    res.cookie('captcha_id', captcha.id, { httpOnly: true, maxAge: 5 * 60 * 1000 });
    res.type('svg');
    return res.status(200).send(captcha.svg);
});

// 登录接口
route('post', '/login', async (req, res) => {
    const { username, password, captcha } = req.body;
    const captchaId = req.cookies['captcha_id'];
    req.log.info(`登录请求: username=${String(username || '')}`);
    const result = await authManager.login(username, password, captchaId, captcha);
    if (result.success) {
        res.cookie('auth_token', result.token, { maxAge: 3650 * 24 * 60 * 60 * 1000, httpOnly: true });
        return apiSuccess(res, {});
    }
    req.log.warn(`登录失败: username=${String(username || '')}`);
    return apiFail(res, result.message, 200);
});

// 登出接口
route('post', '/logout', async (req, res) => {
    const token = req.cookies['auth_token'];
    authManager.logout(token);
    res.clearCookie('auth_token');
    return apiSuccess(res, {});
});

// 检查登录状态
route('get', '/auth/check', async (req, res) => {
    const token = req.cookies['auth_token'];
    const result = authManager.checkAuth(token);
    if (result && result.success) return apiSuccess(res, result);
    return apiFail(res, '未登录', 200);
});

// 修改密码
route('post', '/auth/update', async (req, res) => {
    const token = req.cookies['auth_token'];
    const { username, password, oldPassword } = req.body;
    
    const result = await authManager.updatePassword(token, oldPassword, password, username);
    if (result && result.success) return apiSuccess(res, result);
    return apiFail(res, (result && result.message) || '修改失败', 200);
});

// 鉴权中间件
function requireAuth(req, res, next) {
    const token = req.cookies['auth_token'];
    if (token && authManager.verifySession(token)) {
        return next();
    }
    
    // API 请求返回 401
    if (req.path.startsWith('/api/') && !['/api/login', '/api/auth/check', '/api/system/info', '/api/captcha'].includes(req.path)) {
        // 排除导出接口
        if (req.path.startsWith('/api/export/')) return next();
        // 排除流代理
        if (req.path.startsWith('/api/proxy/')) return next();
        // 排除配置接口（用于测试，后续可能需要身份验证）
        if (req.path.startsWith('/api/config/')) return next();
        // 排除持久化接口（用于测试，后续可能需要身份验证）
        if (req.path.startsWith('/api/persist/')) return next();
        
        return apiFail(res, '未登录', 401);
    }
    
    // 页面请求重定向到登录页
    if (req.path === '/' || req.path === '/index.html' || req.path === '/results' || req.path === '/results.html' || req.path === '/player.html' || req.path === '/logs.html') {
        const back = encodeURIComponent(req.originalUrl || req.path || '/');
        return res.redirect('/login.html?redirect=' + back + '&_t=' + Date.now());
    }
    
    next();
}

module.exports = {
    router,
    requireAuth
};
