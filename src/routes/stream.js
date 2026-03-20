const express = require('express');
const streamService = require('../services/stream');
const config = require('../config');
const { wrapAsync } = require('../middleware/governance');

const router = express.Router();
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

function parsePositiveInt(v, fallback) {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return fallback;
    return Math.floor(n);
}

// 单条检测用ffprobe
route('post', '/check-stream', async (req, res) => {
    let { udpxyUrl, multicastUrl, name } = req.body;
    udpxyUrl = String(udpxyUrl || '').trim();
    multicastUrl = String(multicastUrl || '').trim();
    if (!udpxyUrl || !multicastUrl) return apiFail(res, '缺少必要参数', 400);
    const fullUrl = `${udpxyUrl}/rtp/${multicastUrl.replace('rtp://', '')}`;
    req.log.info(`开始检测组播流: ${multicastUrl}`);
    const streams = config.getConfig('streams');
    const detected = await streamService.detectAndPersistSingle({
        sourceList: streams.streams || [],
        udpxyUrl,
        multicastUrl,
        name,
        fullUrl,
        defaultHttpParam: getPrevGlobalParam()
    });
    if (!detected.saved) return apiFail(res, '保存失败', 500);
    return apiSuccess(res, detected.payload);
});

// HTTP流检测
route('post', '/check-http-stream', async (req, res) => {
    let { url, name } = req.body;
    url = String(url || '').trim();
    if (!url) return apiFail(res, '缺少url参数', 400);
    req.log.info(`开始检测HTTP流: ${url}`);
    const streams = config.getConfig('streams');
    const detected = await streamService.detectAndPersistSingle({
        sourceList: streams.streams || [],
        udpxyUrl: '',
        multicastUrl: url,
        name,
        fullUrl: url,
        defaultHttpParam: getPrevGlobalParam()
    });
    if (!detected.saved) return apiFail(res, '保存失败', 500);
    return apiSuccess(res, detected.payload);
});

// 批量检测
route('post', '/check-streams-batch', async (req, res) => {
    req.log.info('收到批量检测请求');
    let { udpxyUrl, multicastList: batchList } = req.body;
    udpxyUrl = String(udpxyUrl || '').trim();
    if (!Array.isArray(batchList)) {
        req.log.warn('批量检测参数错误: multicastList不是数组');
        return apiFail(res, 'multicastList必须为数组', 400);
    }
    
    try {
        const streams = config.getConfig('streams') || {};
        const handled = await streamService.detectAndPersistBatch({
            sourceList: streams.streams || [],
            udpxyUrl,
            batchList,
            defaultHttpParam: getPrevGlobalParam()
        });
        if (!handled.saved) return apiFail(res, '保存失败', 500);
        return apiSuccess(res, { results: handled.results });
    } catch (error) {
        req.log.error(`批量检测失败: ${error.message}`);
        return apiFail(res, error.message, 400);
    }
});

// 获取文本内容（用于批量获取URL内容）
route('post', '/fetch-text', async (req, res) => {
    const { urls } = req.body || {};
    if (!Array.isArray(urls) || urls.length === 0) {
        return apiFail(res, 'urls必须为非空数组', 400);
    }
    const results = [];
    const axios = require('axios');
    for (const u of urls) {
        if (typeof u !== 'string' || !/^https?:\/\//i.test(u)) {
            results.push({ url: u, ok: false, status: 'invalid', text: '' });
            continue;
        }
        try {
            const r = await axios.get(u);
            results.push({ url: u, ok: true, status: r.status, text: r.data });
        } catch (e) {
            results.push({ url: u, ok: false, status: 'error', text: '' });
        }
    }
    return apiSuccess(res, { results });
});

// 获取所有流
route('get', '/streams', async (req, res) => {
    const pageSizeRaw = String(req.query.pageSize || '').trim();
    const pageRaw = String(req.query.page || '').trim();
    const fieldsRaw = String(req.query.fields || '').trim();
    const pageSize = pageSizeRaw ? Math.min(500, parsePositiveInt(pageSizeRaw, 50)) : 0;
    const page = pageRaw ? parsePositiveInt(pageRaw, 1) : 1;
    const fields = fieldsRaw ? fieldsRaw.split(',').map((s) => s.trim()).filter(Boolean) : [];
    const streams = config.getConfig('streams') || {};
    const view = await streamService.readStreamsView({
        page,
        pageSize,
        fields,
        memoryStreams: streams.streams || []
    });
    return apiSuccess(res, view);
});

route('get', '/streams/stats', async (req, res) => {
    const streams = config.getConfig('streams');
    const list = Array.isArray(streams && streams.streams) ? streams.streams : [];
    const stats = await streamService.readStreamStats(list);
    return apiSuccess(res, stats);
});

route('get', '/streams/reconcile', async (req, res) => {
    const streams = config.getConfig('streams');
    const result = await streamService.reconcileStreams(streams.streams || []);
    if (!result || !result.ok) return apiFail(res, '对账失败', 500, result || {});
    return apiSuccess(res, result);
});

// 批量删除流
route('post', '/streams/batch-delete', async (req, res) => {
    const { indices } = req.body;
    if (!Array.isArray(indices)) {
        return apiFail(res, 'indices必须为数组', 400);
    }
    
    const streamsCfg = config.getConfig('streams') || { streams: [] };
    const sourceList = await streamService.loadSourceStreams(streamsCfg.streams || []);
    const deleted = streamService.buildBatchDeleteByIndices(sourceList, indices);
    const ok = await streamService.persistStreamChanges(deleted.nextList, [], deleted.deletes);
    if (!ok) return apiFail(res, '保存失败', 500);
    
    return apiSuccess(res, { count: deleted.count, message: `已删除 ${deleted.count} 条记录并保存` });
});

// 删除单个流
route('delete', '/stream/:index', async (req, res) => {
    const index = parseInt(req.params.index);
    const streamsCfg = config.getConfig('streams') || { streams: [] };
    const sourceList = await streamService.loadSourceStreams(streamsCfg.streams || []);
    const deleted = streamService.buildDeleteByIndex(sourceList, index);
    if (!deleted.ok) return apiFail(res, '无效的索引', 400);
    const ok = await streamService.persistStreamChanges(deleted.nextList, [], [deleted.removed]);
    if (!ok) return apiFail(res, '保存失败', 500);
    return apiSuccess(res, { message: '删除成功' });
});

// 清空所有流
route('delete', '/streams', async (req, res) => {
    const ok = await streamService.clearAllStreams();
    if (!ok) return apiFail(res, '保存失败', 500);
    streamService.clearCache();
    return apiSuccess(res, { message: '已清空所有检测结果并保存' });
});

// 强制刷新检测
route('post', '/force-refresh', async (req, res) => {
    const ok = await streamService.clearAllStreams();
    if (!ok) return apiFail(res, '保存失败', 500);
    streamService.clearCache();
    return apiSuccess(res, { message: '已强制清空所有检测数据' });
});

// 更新流的元数据
route('post', '/stream/update', async (req, res) => {
    const { udpxyUrl, multicastUrl, update } = req.body || {};
    if (!multicastUrl || typeof update !== 'object') {
        return apiFail(res, '缺少必要参数', 400);
    }
    
    const streams = config.getConfig('streams');
    const sourceList = Array.isArray(streams && streams.streams) ? streams.streams : [];
    const defaultHttpParam = (() => {
        const u = String(multicastUrl || '').trim();
        const scheme = u.split(':')[0].toLowerCase();
        return (scheme === 'rtp' || scheme === 'udp') ? getPrevGlobalParam() : '';
    })();
    const updated = await streamService.updateStreamMetadataAndPersist({
        sourceList,
        udpxyUrl,
        multicastUrl,
        update,
        defaultHttpParam
    });
    if (!updated.saved) return apiFail(res, '保存失败', 500);
    return apiSuccess(res, { stream: updated.stream });
});

// 设置FCC参数
route('post', '/set-fcc', async (req, res) => {
    const { fcc } = req.body || {};
    if (!fcc || typeof fcc !== 'string') {
        return apiFail(res, '缺少fcc参数', 400);
    }
    
    const settings = config.getConfig('appSettings');
    settings.globalFcc = fcc;
    config.updateConfig('appSettings', settings);
    const appSaved = await config.saveConfigStrict('appSettings');
    if (!appSaved) return apiFail(res, '保存失败', 500);
    
    const streams = config.getConfig('streams');
    const multicastList = streams.streams || [];
    const applied = await streamService.applyGlobalFccAndPersist(multicastList, fcc);
    if (!applied.saved) return apiFail(res, '保存失败', 500);
    return apiSuccess(res, { globalFcc: applied.val, count: applied.updatedList.length });
});

// 辅助函数：获取之前的全局参数
function getPrevGlobalParam() {
    const settings = config.getConfig('appSettings');
    const globalFcc = settings.globalFcc || '';
    if (!globalFcc) return '';
    const val = globalFcc.includes('=') ? globalFcc : `fcc=${globalFcc}`;
    return val;
}

module.exports = router;
