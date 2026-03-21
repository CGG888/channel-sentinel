/**
 * 回放规则贡献路由
 * 处理 GitHub OAuth 和规则提交
 */

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const storage = require('../storage');
const config = require('../config');
const { wrapAsync } = require('../middleware/governance');

// Cloudflare Worker 地址
const WORKER_BASE_URL = process.env.GITHUB_OAUTH_WORKER_URL || 'https://github-oauth.channel-sentinel.top';

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

// 生成随机 ID
function generateId() {
    return crypto.randomUUID();
}

// 生成 state
function generateState() {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 获取 GitHub OAuth 状态
 * GET /api/auth/github/status
 */
router.get('/auth/github/status', wrapAsync(async (req, res) => {
    // 从 session 或配置获取 GitHub 关联状态
    const appSettings = config.getConfig('appSettings') || {};
    const githubLinked = appSettings.github_linked || false;
    const githubUsername = appSettings.github_username || '';

    return apiSuccess(res, {
        linked: githubLinked,
        username: githubUsername,
        linkedAt: appSettings.github_linked_at || null
    });
}));

/**
 * 发起 GitHub OAuth
 * GET /api/auth/github/begin
 */
router.get('/auth/github/begin', wrapAsync(async (req, res) => {
    const state = generateState();
    const redirectUri = encodeURIComponent(req.query.redirect_uri || 'http://localhost:3000');

    // 存储 state 到 session（简化处理，存到配置中）
    const appSettings = config.getConfig('appSettings') || {};
    appSettings.oauth_state = state;
    appSettings.oauth_redirect_uri = req.query.redirect_uri || '';
    config.updateConfig('appSettings', appSettings);

    // 跳转到 Worker OAuth 开始
    const workerUrl = `${WORKER_BASE_URL}/oauth/begin?state=${state}&redirect_uri=${redirectUri}`;

    return res.redirect(workerUrl);
}));

/**
 * GitHub OAuth 回调
 * GET /api/auth/github/callback
 *
 * 注意：本地应用只接收 state 参数（code 已在 Worker 端使用）
 * 本地应用通过 state 从 Worker 获取 Token
 */
router.get('/auth/github/callback', wrapAsync(async (req, res) => {
    const state = req.query.state;

    if (!state) {
        return apiFail(res, 'Missing state parameter', 400);
    }

    // 从 Worker 获取 Token（使用 state 换取）
    try {
        const tokenResponse = await fetch(`${WORKER_BASE_URL}/oauth/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ state })
        });

        const tokenData = await tokenResponse.json();

        if (!tokenData.success || !tokenData.token) {
            return apiFail(res, 'Failed to get token: ' + (tokenData && tokenData.error), 400);
        }

        // 存储 Token 到配置
        const appSettings = config.getConfig('appSettings') || {};
        appSettings.github_access_token = tokenData.token;
        appSettings.github_username = tokenData.username;
        appSettings.github_linked = true;
        appSettings.github_linked_at = new Date().toISOString();
        config.updateConfig('appSettings', appSettings);

        // 返回成功（前端会自动跳转）
        return apiSuccess(res, {
            linked: true,
            username: tokenData.username
        });

    } catch (e) {
        console.error('[GitHub OAuth] Callback error:', e);
        return apiFail(res, 'OAuth callback failed: ' + e.message, 500);
    }
}));

/**
 * 解除 GitHub 关联
 * DELETE /api/auth/github/disconnect
 */
router.delete('/auth/github/disconnect', wrapAsync(async (req, res) => {
    const appSettings = config.getConfig('appSettings') || {};
    appSettings.github_access_token = '';
    appSettings.github_username = '';
    appSettings.github_linked = false;
    appSettings.github_linked_at = null;
    config.updateConfig('appSettings', appSettings);

    return apiSuccess(res, { message: 'GitHub account disconnected' });
}));

/**
 * 获取当前用户
 */
function getCurrentUser(req) {
    // 从 session 或默认用户
    return req.session?.user || 'default_user';
}

/**
 * 提交规则
 * POST /api/replay-rules/contributions
 */
router.post('/replay-rules/contributions', wrapAsync(async (req, res) => {
    const { province, operator, city, m3u_line, description } = req.body || {};

    if (!province || !operator || !m3u_line) {
        return apiFail(res, 'Missing required fields: province, operator, m3u_line', 400);
    }

    const appSettings = config.getConfig('appSettings') || {};
    const githubToken = appSettings.github_access_token;
    const githubUsername = appSettings.github_username;

    if (!githubToken || !githubUsername) {
        return apiFail(res, 'GitHub account not linked', 401);
    }

    const id = generateId();

    // 通过 Worker API 发布 Issue 评论
    const commentBody = `@${githubUsername} 省份-运营商 提交:\n` +
        `时间: ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}\n\n` +
        `M3U行:\n${m3u_line}\n\n` +
        `说明: ${description || '无'}\n\n` +
        `状态: pending`;

    try {
        const response = await fetch(`${WORKER_BASE_URL}/api/repos/CGG888/channel-sentinel/issues/10/comments`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-GitHub-Token': githubToken
            },
            body: JSON.stringify({ body: commentBody })
        });

        const commentData = await response.json();

        let githubCommentId = '';
        let githubCommentUrl = '';

        if (response.ok && commentData.id) {
            githubCommentId = String(commentData.id);
            githubCommentUrl = commentData.html_url || '';
        }

        // 存储到数据库
        await storage.addContribution({
            id,
            user: getCurrentUser(req),
            github_username: githubUsername,
            province,
            operator,
            city: city || '',
            m3u_line,
            description: description || '',
            github_comment_id: githubCommentId,
            github_comment_url: githubCommentUrl
        });

        return apiSuccess(res, {
            id,
            issueUrl: 'https://github.com/CGG888/channel-sentinel/issues/10',
            commentUrl: githubCommentUrl,
            status: 'pending'
        });

    } catch (e) {
        console.error('[Contributions] Submit error:', e);
        return apiFail(res, 'Failed to submit: ' + e.message, 500);
    }
}));

/**
 * 获取我的提交记录
 * GET /api/replay-rules/contributions
 */
router.get('/replay-rules/contributions', wrapAsync(async (req, res) => {
    const user = getCurrentUser(req);
    const contributions = await storage.getContributions(user);

    return apiSuccess(res, {
        contributions: contributions.map(c => ({
            id: c.id,
            province: c.province,
            operator: c.operator,
            city: c.city,
            m3uLine: c.m3u_line,
            description: c.description,
            status: c.status,
            ruleVersion: c.rule_version,
            ruleId: c.rule_id,
            githubCommentUrl: c.github_comment_url,
            createdAt: c.created_at,
            processedAt: c.processed_at
        }))
    });
}));

/**
 * 获取单条提交详情
 * GET /api/replay-rules/contributions/:id
 */
router.get('/replay-rules/contributions/:id', wrapAsync(async (req, res) => {
    const { id } = req.params;
    const contribution = await storage.getContribution(id);

    if (!contribution) {
        return apiFail(res, 'Contribution not found', 404);
    }

    return apiSuccess(res, {
        contribution: {
            id: contribution.id,
            province: contribution.province,
            operator: contribution.operator,
            city: contribution.city,
            m3uLine: contribution.m3u_line,
            description: contribution.description,
            status: contribution.status,
            ruleVersion: contribution.rule_version,
            ruleId: contribution.rule_id,
            githubUsername: contribution.github_username,
            githubCommentUrl: contribution.github_comment_url,
            createdAt: contribution.created_at,
            processedAt: contribution.processed_at
        }
    });
}));

/**
 * 获取规则版本列表
 * GET /api/replay-rules/versions
 */
router.get('/replay-rules/versions', wrapAsync(async (req, res) => {
    const versions = await storage.getRuleVersions();

    return apiSuccess(res, {
        versions: versions.map(v => ({
            version: v.version,
            publishedAt: v.published_at,
            changelog: v.changelog,
            totalRules: v.total_rules,
            githubPrUrl: v.github_pr_url
        }))
    });
}));

module.exports = router;
