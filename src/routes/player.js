const express = require('express');
const logger = require('../core/logger');
const logMask = require('../utils/log-mask');
const governance = require('../middleware/governance');

const router = express.Router();

/**
 * 播放器日志记录
 * POST /api/player/log
 * 请求体:
 *   - name: 频道名称
 *   - tvgName: 频道TVG名称
 *   - mode: 播放模式
 *   - cast: 投屏类型
 *   - programTitle: 节目标题
 *   - url: 播放URL
 *   - scope: 范围
 */
router.post('/player/log', governance.wrapAsync(async (req, res) => {
    const b = req.body || {};
    const name = String(b.name || b.tvgName || '').trim();
    const tvgName = String(b.tvgName || '').trim();
    const mode = String(b.mode || '').trim();
    const cast = String(b.cast || '').trim();
    const programTitle = String(b.programTitle || '').trim();
    const url = String(b.url || '').trim();
    const maskedUrl = logMask.maskUrlHost(url);
    const scope = String(b.scope || '').trim();
    const info = [
        name || tvgName ? `频道: ${name || tvgName}` : '',
        mode && cast ? `类型: ${mode}/${cast}` : (mode ? `类型: ${mode}` : (cast ? `类型: ${cast}` : '')),
        programTitle ? `节目: ${programTitle}` : '',
        scope ? `范围: ${scope}` : '',
        maskedUrl ? `地址: ${maskedUrl}` : ''
    ].filter(Boolean).join(' | ');
    if (info) {
        if (req.log && req.log.info) req.log.info(`播放日志 -> ${info}`);
        else logger.info(`播放日志 -> ${info}`, 'Player');
    } else {
        if (req.log && req.log.info) req.log.info('播放日志');
        else logger.info('播放日志', 'Player');
    }
    if (typeof res.apiSuccess === 'function') return res.apiSuccess();
    return res.json({ success: true });
}));

module.exports = router;
