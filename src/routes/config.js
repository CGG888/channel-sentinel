const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const axios = require('axios');
const sharp = require('sharp');
const config = require('../config');
const storage = require('../storage');
const configReader = require('../storage/config-reader');
const storageMode = require('../storage/mode');
const streamsReader = require('../storage/streams-reader');
const logger = require('../core/logger');
const { wrapAsync } = require('../middleware/governance');

// 数据目录路径
const DATA_DIR = path.join(__dirname, '../../data');
const CFG_LOGO = path.join(DATA_DIR, 'logo_templates.json');
const CFG_FCC = path.join(DATA_DIR, 'fcc_servers.json');
const CFG_UDPXY = path.join(DATA_DIR, 'udpxy_servers.json');
const CFG_GROUPS = path.join(DATA_DIR, 'group_titles.json');
const CFG_GROUP_RULES = path.join(DATA_DIR, 'group_rules.json');
const CFG_EPG = path.join(DATA_DIR, 'epg_sources.json');
const CFG_PROXY = path.join(DATA_DIR, 'proxy_servers.json');
const CFG_APPSET = path.join(DATA_DIR, 'app_settings.json');
const SECRET_FILE_ABS = path.join(__dirname, '../../data/.secret_key');
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

// 确保数据目录存在
function ensureDataDir() {
    try { if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true }); } catch(e) {}
}

// 读取JSON文件
function readJson(file, defObj) {
    ensureDataDir();
    try {
        if (fs.existsSync(file)) {
            const txt = fs.readFileSync(file, 'utf-8');
            return JSON.parse(txt);
        }
    } catch(e) {}
    return defObj;
}

// 写入JSON文件
function writeJson(file, obj) {
    ensureDataDir();
    try {
        if (storageMode.shouldWriteJson()) {
            fs.writeFileSync(file, JSON.stringify(obj, null, 2), 'utf-8');
        }
        if (storageMode.shouldWriteSqlite()) {
            storage.syncByFile(path.basename(file), obj);
        }
        return true;
    } catch(e) {
        return false;
    }
}

// 加密解密函数
function ensureSecretKeyInit() {
    try {
        const dataDir = path.join(__dirname, '../../data');
        if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
        if (fs.existsSync(SECRET_FILE_ABS)) {
            const raw = fs.readFileSync(SECRET_FILE_ABS, 'utf-8').trim();
            if (raw) return Buffer.from(raw, 'base64');
        }
    } catch(e) {}
    const key = crypto.randomBytes(32);
    try { fs.writeFileSync(SECRET_FILE_ABS, key.toString('base64')); } catch(e) {}
    return key;
}

const SECRET_KEY = ensureSecretKeyInit();

function encryptSecret(plain) {
    if (!plain) return '';
    try {
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('aes-256-gcm', SECRET_KEY, iv);
        const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
        const tag = cipher.getAuthTag();
        return `enc:v1:${iv.toString('base64')}:${enc.toString('base64')}:${tag.toString('base64')}`;
    } catch(e) { return String(plain); }
}

function decryptSecret(v) {
    if (!v) return '';
    if (!String(v).startsWith('enc:v1:')) return String(v);
    try {
        const [, , ivB64, cB64, tagB64] = String(v).split(':');
        const iv = Buffer.from(ivB64, 'base64');
        const data = Buffer.from(cB64, 'base64');
        const tag = Buffer.from(tagB64, 'base64');
        const decipher = crypto.createDecipheriv('aes-256-gcm', SECRET_KEY, iv);
        decipher.setAuthTag(tag);
        const out = Buffer.concat([decipher.update(data), decipher.final()]);
        return out.toString('utf8');
    } catch(e) { return ''; }
}

function unwrapSecret(v) {
    let out = String(v || '');
    if (!out) return '';
    for (let i = 0; i < 64; i++) {
        if (!out.startsWith('enc:v1:')) return out;
        const next = decryptSecret(out);
        if (!next || next === out) return '';
        out = String(next);
    }
    return out.startsWith('enc:v1:') ? '' : out;
}

function syncRuntimeAppSettings(settings) {
    try {
        const runtime = { ...(settings || {}) };
        runtime.securityToken = unwrapSecret(runtime.securityToken || '');
        runtime.webdavPass = unwrapSecret(runtime.webdavPass || '');
        if (runtime.storageMode) {
            storageMode.setStorageMode(runtime.storageMode);
        }
        if (typeof runtime.logLevel === 'string') {
            const nextLogLevel = String(runtime.logLevel || '').toLowerCase();
            if (logger.LEVELS.includes(nextLogLevel)) logger.setLevel(nextLogLevel);
        }
        const current = config.getConfig('appSettings') || {};
        config.updateConfig('appSettings', { ...current, ...runtime });
    } catch (e) {}
}

async function ensureSqliteSeededWhenSwitching(nextMode) {
    if (storageMode.normalizeStorageMode(nextMode) !== 'sqlite') return;
    const memoryStreams = (config.getConfig('streams') || {}).streams || [];
    const sqliteStreams = await streamsReader.readStreamsFromSqlite();
    const sqliteCount = Array.isArray(sqliteStreams) ? sqliteStreams.length : 0;
    const memoryCount = Array.isArray(memoryStreams) ? memoryStreams.length : 0;
    if (sqliteCount === 0 && memoryCount > 0) {
        await storage.syncAll(config.getAllConfigs());
    }
}

async function loadMergedAppSettings(defaults = {}) {
    const rawJson = readJson(CFG_APPSET, defaults || {});
    const sqliteMaybe = await configReader.loadAppSettingsFallback({});
    const runtime = config.getConfig('appSettings') || {};
    if (storageMode.getStorageMode() === 'sqlite') {
        return { ...(defaults || {}), ...(rawJson || {}), ...(sqliteMaybe || {}), ...(runtime || {}) };
    }
    return { ...(defaults || {}), ...(sqliteMaybe || {}), ...(rawJson || {}), ...(runtime || {}) };
}

function enforceSqlitePrimaryMode(settingsObj) {
    const next = { ...(settingsObj || {}) };
    next.storageMode = 'sqlite';
    storageMode.setStorageMode('sqlite');
    return next;
}

async function applyAppSettingsPatch(patch = {}) {
    const settings = await loadMergedAppSettings({});
    settings.securityToken = unwrapSecret(settings.securityToken || '');
    settings.webdavPass = unwrapSecret(settings.webdavPass || '');
    Object.assign(settings, patch || {});
    if (typeof settings.logLevel === 'string') {
        const nextLevel = String(settings.logLevel || '').toLowerCase();
        settings.logLevel = logger.LEVELS.includes(nextLevel) ? nextLevel : logger.getLogLevel();
    }
    const normalized = enforceSqlitePrimaryMode(settings);
    const toSave = { ...normalized };
    if (toSave.securityToken) toSave.securityToken = encryptSecret(unwrapSecret(toSave.securityToken));
    if (toSave.webdavPass) toSave.webdavPass = encryptSecret(unwrapSecret(toSave.webdavPass));
    config.updateConfig('appSettings', normalized);
    if (storageMode.shouldWriteJson()) {
        try {
            fs.writeFileSync(CFG_APPSET, JSON.stringify(toSave, null, 2), 'utf-8');
        } catch (e) {}
    }
    if (storageMode.shouldWriteSqlite()) {
        await storage.syncByFile('app_settings.json', toSave);
    }
    syncRuntimeAppSettings(toSave);
    return normalized;
}

// Logo模板配置
route('get', '/config/logo-templates', async (req, res) => {
    const defId = 'ltpl-default';
    const cfgRaw = readJson(CFG_LOGO, { templates: [{ id: defId, name: '默认模板', url: '' }], currentId: defId });
    const cfg = await configReader.loadLogoTemplatesFallback(cfgRaw);
    const listRaw = Array.isArray(cfg.templates) ? cfg.templates : [];
    const listObj = listRaw.map(t => {
        if (typeof t === 'string') {
            return { id: 'ltpl-' + Math.random().toString(36).slice(2) + Date.now().toString(36), name: '未命名模板', url: t, category: '内网台标' };
        }
        return { 
            id: t.id || ('ltpl-' + Math.random().toString(36).slice(2) + Date.now().toString(36)), 
            name: t.name || '未命名模板', 
            url: t.url || '', 
            category: typeof t.category === 'string' ? (t.category === '内网' ? '内网台标' : (t.category === '外网' ? '外网台标' : t.category)) : '内网台标' 
        };
    }).filter(x => x.url);
    
    const appSettings = await loadMergedAppSettings({});
    let currId = String(appSettings.logoTemplateCurrentId || cfg.currentId || '');
    let currUrl = '';
    if (!currId && typeof cfg.current === 'string') {
        const it = listObj.find(x => x.url === cfg.current);
        currId = it ? it.id : '';
    }
    if (!currId && listObj[0]) currId = listObj[0].id;
    const currItem = listObj.find(x => x.id === currId) || listObj[0] || null;
    currUrl = currItem ? currItem.url : '';
    const listStr = listObj.map(x => x.url);
    return apiSuccess(res, { templates: listStr, current: currUrl, templatesObj: listObj, currentId: currId });
});

route('post', '/config/logo-templates', async (req, res) => {
    const { templates, current, templatesObj, currentId } = req.body || {};
    let listObj = Array.isArray(templatesObj) ? templatesObj.map(t => ({
        id: t && t.id ? t.id : ('ltpl-' + Math.random().toString(36).slice(2) + Date.now().toString(36)),
        name: t && t.name ? t.name : '未命名模板',
        url: t && t.url ? t.url : '',
        category: t && typeof t.category === 'string' ? t.category : '内网台标'
    })) : [];
    
    if (listObj.length === 0) {
        const listStr = Array.isArray(templates) ? templates : [];
        listObj = listStr.filter(u => typeof u === 'string' && u).map(u => ({
            id: 'ltpl-' + Math.random().toString(36).slice(2) + Date.now().toString(36),
            name: '未命名模板',
            url: u,
            category: '内网台标'
        }));
    }
    
    listObj = listObj.filter(x => x.url);
    let currId = typeof currentId === 'string' ? currentId : '';
    if (!currId && typeof current === 'string') {
        const it = listObj.find(x => x.url === current);
        currId = it ? it.id : '';
    }
    if (!currId && listObj[0]) currId = listObj[0].id;
    
    const currItem = listObj.find(x => x.id === currId) || listObj[0] || null;
    const currUrl = currItem ? currItem.url : '';
    
    config.updateConfig('logoTemplates', { templates: listObj, currentId: currId });
    const logoOk = await config.saveConfigStrict('logoTemplates');
    if (!logoOk) return apiFail(res, '保存失败', 500);
    await applyAppSettingsPatch({ logoTemplate: currUrl, logoTemplateCurrentId: currId });
    
    return apiSuccess(res, {});
});

// Logo获取
route('get', '/logo', async (req, res) => {
    try {
        const nmRaw = String(req.query.name || '').trim();
        const scope = String(req.query.scope || 'internal').toLowerCase();
        if (!nmRaw) return res.status(400).send('missing name');
        
        const cfg = readJson(CFG_LOGO, { templates: [{ id: 'ltpl-default', name: '默认模板', url: '', category: '内网台标' }], currentId: 'ltpl-default' });
        const listRaw = Array.isArray(cfg.templates) ? cfg.templates : [];
        const listObj = listRaw.map(t => {
            if (typeof t === 'string') return { id: 'ltpl-' + Math.random().toString(36).slice(2) + Date.now().toString(36), name: '未命名模板', url: t, category: '内网台标' };
            return { 
                id: t.id || ('ltpl-' + Math.random().toString(36).slice(2) + Date.now().toString(36)), 
                name: t.name || '未命名模板', 
                url: t.url || '', 
                category: typeof t.category === 'string' ? (t.category === '内网' ? '内网台标' : (t.category === '外网' ? '外网台标' : t.category)) : '内网台标' 
            };
        }).filter(x => x.url);
        
        let tpl = '';
        if (scope === 'external') {
            const ext = listObj.find(x => x.category === '外网台标');
            tpl = ext ? ext.url : '';
        } else {
            const int = listObj.find(x => x.category === '内网台标');
            tpl = int ? int.url : '';
        }
        
        if (!tpl) {
            const currId = typeof cfg.currentId === 'string' ? cfg.currentId : '';
            const currItem = listObj.find(x => x.id === currId) || listObj[0] || null;
            tpl = currItem ? currItem.url : '';
        }
        
        const nm = encodeURIComponent(nmRaw);
        const target = tpl.replace('{name}', nm);
        const resp = await axios.get(target, { 
            responseType: 'arraybuffer', 
            validateStatus: () => true, 
            headers: { 'User-Agent': req.headers['user-agent'] || 'Mozilla/5.0' } 
        });
        
        if (resp.status < 200 || resp.status >= 300) {
            return res.status(404).send('not found');
        }
        
        const accept = String(req.headers['accept'] || '').toLowerCase();
        const fmtRaw = String(req.query.fmt || '').toLowerCase();
        const wRaw = parseInt(String(req.query.w || '').trim(), 10);
        const hRaw = parseInt(String(req.query.h || '').trim(), 10);
        const fitRaw = String(req.query.fit || '').toLowerCase();
        
        const clamp = (n, lo, hi) => (isFinite(n) && n > 0 ? Math.max(lo, Math.min(hi, n)) : undefined);
        const w = clamp(wRaw, 1, 512);
        const h = clamp(hRaw, 1, 512);
        const fitMap = { contain: 'inside', cover: 'cover', fill: 'fill', inside: 'inside', outside: 'outside' };
        const fit = fitMap[fitRaw] || 'inside';
        
        let wantFmt = '';
        if (fmtRaw === 'webp' || fmtRaw === 'avif' || fmtRaw === 'png' || fmtRaw === 'jpeg' || fmtRaw === 'jpg') {
            wantFmt = fmtRaw === 'jpg' ? 'jpeg' : fmtRaw;
        } else {
            if (accept.includes('image/avif')) wantFmt = 'avif';
            else if (accept.includes('image/webp')) wantFmt = 'webp';
            else wantFmt = '';
        }
        
        const srcBuf = Buffer.from(resp.data);
        
        async function sendWithCache(buf, contentType) {
            const etag = '"' + crypto.createHash('sha1').update(buf).digest('hex') + '"';
            const inm = String(req.headers['if-none-match'] || '');
            if (inm && inm === etag) {
                res.status(304);
                res.set('ETag', etag);
                res.set('Cache-Control', 'public, max-age=604800, stale-while-revalidate=86400');
                return res.end();
            }
            res.set('ETag', etag);
            res.set('Cache-Control', 'public, max-age=604800, stale-while-revalidate=86400');
            res.type(contentType);
            return res.send(buf);
        }
        
        const upstreamContentType = (resp.headers && (resp.headers['content-type'] || resp.headers['Content-Type'])) || 'image/png';
        
        if (sharp) {
            try {
                let img = sharp(srcBuf, { failOnError: false });
                if (w || h) {
                    img = img.resize({ width: w, height: h, fit, withoutEnlargement: true });
                }
                let outType = upstreamContentType;
                if (wantFmt === 'webp') {
                    img = img.webp({ quality: 70, effort: 4 });
                    outType = 'image/webp';
                } else if (wantFmt === 'avif') {
                    img = img.avif({ quality: 45, effort: 4 });
                    outType = 'image/avif';
                } else if (wantFmt === 'png') {
                    img = img.png({ compressionLevel: 9 });
                    outType = 'image/png';
                } else if (wantFmt === 'jpeg') {
                    img = img.jpeg({ quality: 70, mozjpeg: true });
                    outType = 'image/jpeg';
                }
                const outBuf = await img.toBuffer();
                return await sendWithCache(outBuf, outType);
            } catch(e) {
                // 失败回退到原图
                return await sendWithCache(srcBuf, upstreamContentType);
            }
        } else {
            // 无图像处理库，直接透传但提供长缓存
            return await sendWithCache(srcBuf, upstreamContentType);
        }
    } catch(e) {
        res.status(404).send('not found');
    }
});

// FCC服务器配置
route('get', '/config/fcc-servers', async (req, res) => {
    const cfgRaw = readJson(CFG_FCC, { servers: [], currentId: '' });
    const cfg = await configReader.loadFccServersFallback(cfgRaw);
    const appSettings = await loadMergedAppSettings({});
    const currentId = String(appSettings.fccCurrentId || cfg.currentId || '');
    const servers = Array.isArray(cfg.servers) ? cfg.servers : [];
    const emptyNameCount = servers.reduce((n, x) => n + (String(x && x.name ? x.name : '').trim() ? 0 : 1), 0);
    logger.info('读取FCC配置', 'Config', { total: servers.length, currentId, emptyNameCount });
    return apiSuccess(res, { servers, currentId });
});

route('post', '/config/fcc-servers', async (req, res) => {
    const { servers, currentId } = req.body || {};
    const list = (Array.isArray(servers) ? servers : []).map((x) => {
        const id = String(x && x.id ? x.id : '');
        const name = String(x && x.name ? x.name : '');
        const addr = String(x && (x.addr || x.url) ? (x.addr || x.url) : '').trim();
        return { id, name, addr, url: addr };
    }).filter((x) => x.addr);
    const nextCurrentId = typeof currentId === 'string' ? currentId : '';
    const emptyNameCount = list.reduce((n, x) => n + (String(x && x.name ? x.name : '').trim() ? 0 : 1), 0);
    logger.info('保存FCC配置请求', 'Config', { incoming: Array.isArray(servers) ? servers.length : 0, valid: list.length, currentId: nextCurrentId, emptyNameCount });
    config.updateConfig('fccServers', { servers: list, currentId: nextCurrentId });
    const fccOk = await config.saveConfigStrict('fccServers');
    if (!fccOk) {
        logger.error('保存FCC配置失败', 'Config', { valid: list.length, currentId: nextCurrentId });
        return apiFail(res, '保存失败', 500);
    }
    await applyAppSettingsPatch({ fccCurrentId: nextCurrentId });
    logger.info('保存FCC配置成功', 'Config', { valid: list.length, currentId: nextCurrentId, emptyNameCount });
    return apiSuccess(res, {});
});

// UDPXY服务器配置
route('get', '/config/udpxy-servers', async (req, res) => {
    const cfgRaw = readJson(CFG_UDPXY, { servers: [], currentId: '' });
    const cfg = await configReader.loadUdpxyServersFallback(cfgRaw);
    const appSettings = await loadMergedAppSettings({});
    const currentId = String(appSettings.udpxyCurrentId || cfg.currentId || '');
    const servers = Array.isArray(cfg.servers) ? cfg.servers : [];
    const emptyNameCount = servers.reduce((n, x) => n + (String(x && x.name ? x.name : '').trim() ? 0 : 1), 0);
    logger.info('读取UDPXY配置', 'Config', { total: servers.length, currentId, emptyNameCount });
    return apiSuccess(res, { servers, currentId });
});

route('post', '/config/udpxy-servers', async (req, res) => {
    const { servers, currentId } = req.body || {};
    const list = (Array.isArray(servers) ? servers : []).map((x) => ({
        id: String(x && x.id ? x.id : ''),
        name: String(x && x.name ? x.name : ''),
        addr: String(x && (x.addr || x.url) ? (x.addr || x.url) : '').trim(),
        url: String(x && (x.url || x.addr) ? (x.url || x.addr) : '').trim()
    })).filter((x) => x.url);
    const nextCurrentId = typeof currentId === 'string' ? currentId : '';
    const emptyNameCount = list.reduce((n, x) => n + (String(x && x.name ? x.name : '').trim() ? 0 : 1), 0);
    logger.info('保存UDPXY配置请求', 'Config', { incoming: Array.isArray(servers) ? servers.length : 0, valid: list.length, currentId: nextCurrentId, emptyNameCount });
    config.updateConfig('udpxyServers', { servers: list, currentId: nextCurrentId });
    const udpxyOk = await config.saveConfigStrict('udpxyServers');
    if (!udpxyOk) {
        logger.error('保存UDPXY配置失败', 'Config', { valid: list.length, currentId: nextCurrentId });
        return apiFail(res, '保存失败', 500);
    }
    await applyAppSettingsPatch({ udpxyCurrentId: nextCurrentId });
    logger.info('保存UDPXY配置成功', 'Config', { valid: list.length, currentId: nextCurrentId, emptyNameCount });
    return apiSuccess(res, {});
});

// 分组标题配置
route('get', '/config/group-titles', async (req, res) => {
    const cfgRaw = readJson(CFG_GROUPS, { titles: [] });
    const cfg = await configReader.loadGroupTitlesFallback(cfgRaw);
    const raw = Array.isArray(cfg.titles) ? cfg.titles : [];
    const titlesObj = raw.map(x => {
        if (typeof x === 'string') return { name: x, color: '' };
        return { name: x && x.name ? x.name : '未命名分组', color: x && x.color ? x.color : '' };
    }).filter(x => x.name);
    const titles = titlesObj.map(x => x.name);
    return apiSuccess(res, { titles, titlesObj });
});

route('post', '/config/group-titles', async (req, res) => {
    const { titles, titlesObj } = req.body || {};
    let listObj = Array.isArray(titlesObj) ? titlesObj.map(x => ({
        name: x && x.name ? x.name : '未命名分组',
        color: x && x.color ? x.color : ''
    })).filter(x => x.name) : [];
    
    if (listObj.length === 0) {
        const names = Array.isArray(titles) ? titles : [];
        listObj = names.filter(n => typeof n === 'string' && n).map(n => ({ name: n, color: '' }));
    }
    
    config.updateConfig('groupTitles', { titles: listObj });
    const titlesOk = await config.saveConfigStrict('groupTitles');
    if (!titlesOk) return apiFail(res, '保存失败', 500);
    return apiSuccess(res, {});
});

// 分组规则配置
route('get', '/config/group-rules', async (req, res) => {
    const cfgRaw = readJson(CFG_GROUP_RULES, { rules: [] });
    const cfg = await configReader.loadGroupRulesFallback(cfgRaw);
    const rules = Array.isArray(cfg.rules) ? cfg.rules : [];
    const normalized = rules.map(r => ({
        name: r && r.name ? r.name : '',
        matchers: Array.isArray(r && r.matchers) ? r.matchers : []
    })).filter(x => x.name);
    return apiSuccess(res, { rules: normalized });
});

route('post', '/config/group-rules', async (req, res) => {
    const { rules } = req.body || {};
    const list = Array.isArray(rules) ? rules.map(r => ({
        name: r && r.name ? r.name : '',
        matchers: Array.isArray(r && r.matchers) ? r.matchers.map(m => ({
            field: m && m.field ? m.field : 'name',
            op: m && m.op ? m.op : 'contains',
            value: m && m.value ? String(m.value) : ''
        })).filter(m => m.value) : []
    })).filter(x => x.name) : [];
    
    config.updateConfig('groupRules', { rules: list });
    const rulesOk = await config.saveConfigStrict('groupRules');
    if (!rulesOk) return apiFail(res, '保存失败', 500);
    return apiSuccess(res, {});
});

// 设置获取
route('get', '/settings', async (req, res) => {
    const settings = await loadMergedAppSettings({});
    const proxyCfg = await configReader.loadProxyServersFallback(config.getConfig('proxyServers') || { list: [] });
    const groupCfg = await configReader.loadGroupTitlesFallback(config.getConfig('groupTitles') || { titles: [] });
    
    // 解密敏感字段
    const s = { ...settings };
    if (typeof s.webdavPass === 'string') s.webdavPass = unwrapSecret(s.webdavPass);
    if (typeof s.securityToken === 'string') s.securityToken = unwrapSecret(s.securityToken);
    s.storageMode = storageMode.getStorageMode();
    s.logLevel = logger.LEVELS.includes(String(s.logLevel || '').toLowerCase()) ? String(s.logLevel).toLowerCase() : logger.getLogLevel();
    s.proxyList = Array.isArray(proxyCfg.list) ? proxyCfg.list : [];
    s.groupTitles = Array.isArray(groupCfg.titles) ? groupCfg.titles : [];
    
    return apiSuccess(res, { settings: s });
});

// 设置更新
route('post', '/settings/update', async (req, res) => {
    const { 
        fccServers, 
        logoTemplate, 
        groupTitles, 
        globalFcc: gf, 
        externalUrl, 
        internalUrl, 
        useInternal, 
        useExternal, 
        securityToken, 
        enableToken, 
        proxyList, 
        webdavUrl, 
        webdavUser, 
        webdavPass, 
        webdavRoot, 
        webdavInsecure,
        storageMode: nextStorageMode,
        logLevel
    } = req.body || {};
    
    const settings = await loadMergedAppSettings({});
    settings.securityToken = unwrapSecret(settings.securityToken || '');
    settings.webdavPass = unwrapSecret(settings.webdavPass || '');
    
    if (Array.isArray(fccServers)) {
        const list = fccServers.map((x) => ({
            id: String(x && x.id ? x.id : ''),
            name: String(x && x.name ? x.name : ''),
            addr: String(x && (x.addr || x.url) ? (x.addr || x.url) : '').trim(),
            url: String(x && (x.url || x.addr) ? (x.url || x.addr) : '').trim()
        })).filter((x) => x.addr);
        config.updateConfig('fccServers', { servers: list });
        const fccSaved = await config.saveConfigStrict('fccServers');
        if (!fccSaved) return res.status(500).json({ success: false, message: '保存失败' });
    }
    
    if (typeof logoTemplate === 'string') {
        settings.logoTemplate = logoTemplate;
        let logoCurrentId = settings.logoTemplateCurrentId || '';
        // 更新logo配置的当前模板
        const logoCfg = readJson(CFG_LOGO, { templates: [], currentId: '' });
        if (logoCfg.templates && logoCfg.templates.length > 0) {
            // 查找是否有匹配的模板，没有则创建
            const existing = logoCfg.templates.find(t => t.url === logoTemplate);
            if (!existing) {
                const newId = 'ltpl-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
                logoCfg.templates.push({ id: newId, name: '自定义模板', url: logoTemplate, category: '内网台标' });
                logoCfg.currentId = newId;
                logoCurrentId = newId;
                config.updateConfig('logoTemplates', logoCfg);
                const logoSaved = await config.saveConfigStrict('logoTemplates');
                if (!logoSaved) return res.status(500).json({ success: false, message: '保存失败' });
            } else {
                logoCfg.currentId = existing.id;
                logoCurrentId = existing.id;
                config.updateConfig('logoTemplates', logoCfg);
                const logoSaved = await config.saveConfigStrict('logoTemplates');
                if (!logoSaved) return res.status(500).json({ success: false, message: '保存失败' });
            }
        }
        settings.logoTemplateCurrentId = logoCurrentId;
    }
    
    if (Array.isArray(groupTitles)) {
        const groupCfgRaw = config.getConfig('groupTitles') || { titles: [] };
        const groupCfg = await configReader.loadGroupTitlesFallback(groupCfgRaw);
        const prevMap = new Map(
            (Array.isArray(groupCfg.titles) ? groupCfg.titles : [])
                .map((it) => ({ name: String(it && it.name ? it.name : ''), color: String(it && it.color ? it.color : '') }))
                .filter((it) => it.name)
                .map((it) => [it.name, it.color])
        );
        const listObj = groupTitles.map((it) => {
            if (typeof it === 'string') {
                const name = it.trim();
                if (!name) return null;
                return { name, color: prevMap.get(name) || '' };
            }
            const name = String(it && it.name ? it.name : '').trim();
            if (!name) return null;
            const color = String(it && it.color ? it.color : '').trim() || (prevMap.get(name) || '');
            return { name, color };
        }).filter((it) => it);
        config.updateConfig('groupTitles', { titles: listObj });
        const groupsSaved = await config.saveConfigStrict('groupTitles');
        if (!groupsSaved) return res.status(500).json({ success: false, message: '保存失败' });
        settings.groupTitles = listObj;
    }
    
    if (typeof externalUrl === 'string') settings.externalUrl = externalUrl.trim();
    if (typeof internalUrl === 'string') settings.internalUrl = internalUrl.trim();
    if (typeof useInternal === 'boolean') settings.useInternal = useInternal;
    if (typeof useExternal === 'boolean') settings.useExternal = useExternal;
    if (typeof securityToken === 'string') settings.securityToken = securityToken.trim();
    if (typeof enableToken === 'boolean') settings.enableToken = enableToken;
    if (typeof webdavUrl === 'string') settings.webdavUrl = webdavUrl;
    if (typeof webdavUser === 'string') settings.webdavUser = webdavUser;
    if (typeof webdavPass === 'string') settings.webdavPass = webdavPass;
    if (typeof webdavRoot === 'string') settings.webdavRoot = webdavRoot;
    if (typeof webdavInsecure === 'boolean') settings.webdavInsecure = webdavInsecure;
    if (typeof logLevel === 'string') {
        const nextLogLevel = String(logLevel || '').toLowerCase();
        if (logger.LEVELS.includes(nextLogLevel)) {
            settings.logLevel = nextLogLevel;
            logger.setLevel(nextLogLevel);
        }
    }
    const normalizedNextStorageMode = 'sqlite';
    const _requestedMode = storageMode.normalizeStorageMode(nextStorageMode);
    void _requestedMode;
    const normalizedSettings = await applyAppSettingsPatch(settings);
    await ensureSqliteSeededWhenSwitching(normalizedNextStorageMode);
    
    if (Array.isArray(proxyList)) {
        const normalized = proxyList.map(x => ({
            type: normalizeProxyType(x && x.type),
            url: x && x.url ? x.url.trim() : ''
        })).filter(x => !!x.url);
        config.updateConfig('proxyServers', { list: normalized });
        const proxySaved = await config.saveConfigStrict('proxyServers');
        if (!proxySaved) return res.status(500).json({ success: false, message: '保存失败' });
    }
    
    if (typeof gf === 'string') {
        const streamsCfg = config.getConfig('streams') || { streams: [], settings: {} };
        const nextSettings = { ...(streamsCfg.settings || {}), globalFcc: gf };
        config.updateConfig('streams', { settings: nextSettings });
        const streamsSaved = await config.saveConfigStrict('streams');
        if (!streamsSaved) return res.status(500).json({ success: false, message: '保存失败' });
    }
    
    const proxyCfg = await configReader.loadProxyServersFallback(config.getConfig('proxyServers') || { list: [] });
    res.json({
        success: true,
        settings: {
            ...normalizedSettings,
            storageMode: storageMode.getStorageMode(),
            proxyList: Array.isArray(proxyCfg.list) ? proxyCfg.list : []
        }
    });
});

// 重命名分组
route('post', '/settings/rename-group', async (req, res) => {
    const { from, to } = req.body || {};
    if (!from || !to) return res.status(400).json({ success: false, message: '缺少分组名称' });
    
    const streamsCfg = config.getConfig('streams') || { streams: [], settings: {} };
    const baseStreams = Array.isArray(streamsCfg.streams) ? streamsCfg.streams : [];
    const memoryStreams = await streamsReader.loadStreamsFallback(baseStreams);
    
    let updated = 0;
    if (Array.isArray(memoryStreams)) {
        const nextStreams = memoryStreams.map(s => {
            if ((s.groupTitle || '') === from) {
                updated++;
                return { ...s, groupTitle: to };
            }
            return s;
        });
        config.updateConfig('streams', { streams: nextStreams });
        const streamsSaved = await config.saveConfigStrict('streams');
        if (!streamsSaved) return res.status(500).json({ success: false, message: '保存失败' });
    }
    
    const groupCfgRaw = config.getConfig('groupTitles') || { titles: [] };
    const groupCfg = await configReader.loadGroupTitlesFallback(groupCfgRaw);
    if (Array.isArray(groupCfg.titles)) {
        const nextTitles = groupCfg.titles.map(t => {
            if (typeof t === 'string' && t === from) return to;
            if (t && t.name === from) return { ...t, name: to };
            return t;
        });
        config.updateConfig('groupTitles', { titles: nextTitles });
        const groupsSaved = await config.saveConfigStrict('groupTitles');
        if (!groupsSaved) return res.status(500).json({ success: false, message: '保存失败' });
    }
    
    res.json({ success: true, updated });
});

// 代理服务器配置
route('get', '/config/proxies', async (req, res) => {
    const cfgRaw = readJson(CFG_PROXY, { list: [] });
    const cfg = await configReader.loadProxyServersFallback(cfgRaw);
    return apiSuccess(res, { list: Array.isArray(cfg.list) ? cfg.list : [] });
});

route('post', '/config/proxies', async (req, res) => {
    const { list } = req.body || {};
    const arr = Array.isArray(list) ? list.map(x => ({
        type: normalizeProxyType(x && x.type),
        url: x && x.url ? x.url.trim() : ''
    })).filter(x => !!x.url) : [];
    
    config.updateConfig('proxyServers', { list: arr });
    const proxyOk = await config.saveConfigStrict('proxyServers');
    if (!proxyOk) return apiFail(res, '保存失败', 500);
    return apiSuccess(res, {});
});

// 应用设置配置
route('get', '/config/app-settings', async (req, res) => {
    const defaults = {
        useInternal: false,
        useExternal: false,
        internalUrl: '',
        externalUrl: '',
        securityToken: '',
        enableToken: false
    };
    const raw = await loadMergedAppSettings(defaults);
    
    const cfg = {
        ...raw,
        securityToken: unwrapSecret(raw.securityToken || ''),
        storageMode: storageMode.getStorageMode(),
        logLevel: logger.LEVELS.includes(String(raw.logLevel || '').toLowerCase()) ? String(raw.logLevel).toLowerCase() : logger.getLogLevel()
    };
    
    return apiSuccess(res, { appSettings: cfg });
});

route('post', '/config/app-settings', async (req, res) => {
    const { useInternal, useExternal, internalUrl, externalUrl, securityToken, enableToken, storageMode: nextStorageMode, logLevel } = req.body || {};
    
    const settings = await loadMergedAppSettings({});
    settings.securityToken = unwrapSecret(settings.securityToken || '');
    
    if (typeof useInternal === 'boolean') settings.useInternal = useInternal;
    if (typeof useExternal === 'boolean') settings.useExternal = useExternal;
    if (typeof internalUrl === 'string') settings.internalUrl = internalUrl.trim();
    if (typeof externalUrl === 'string') settings.externalUrl = externalUrl.trim();
    if (typeof securityToken === 'string') settings.securityToken = securityToken.trim();
    if (typeof enableToken === 'boolean') settings.enableToken = enableToken;
    if (typeof logLevel === 'string') {
        const nextLogLevel = String(logLevel || '').toLowerCase();
        if (logger.LEVELS.includes(nextLogLevel)) {
            settings.logLevel = nextLogLevel;
            logger.setLevel(nextLogLevel);
        }
    }
    const normalizedNextStorageMode = 'sqlite';
    const _requestedMode = storageMode.normalizeStorageMode(nextStorageMode);
    void _requestedMode;
    await applyAppSettingsPatch(settings);
    await ensureSqliteSeededWhenSwitching(normalizedNextStorageMode);
    
    res.json({ success: true, storageMode: storageMode.getStorageMode() });
});

// EPG源配置
route('get', '/config/epg-sources', async (req, res) => {
    const cfgRaw = readJson(CFG_EPG, { sources: [] });
    const cfg = await configReader.loadEpgSourcesFallback(cfgRaw);
    const list = Array.isArray(cfg.sources) ? cfg.sources : [];
    const normalized = list.map(x => ({
        id: x && x.id ? x.id : ('epg-' + Math.random().toString(36).slice(2) + Date.now().toString(36)),
        name: x && x.name ? x.name : '未命名EPG',
        url: x && x.url ? x.url : '',
        scope: (x && x.scope === '外网' || x && x.scope === '外网EPG') ? '外网EPG' : '内网EPG'
    })).filter(x => !!x.url);
    
    return apiSuccess(res, { sources: normalized });
});

route('post', '/config/epg-sources', async (req, res) => {
    const { sources } = req.body || {};
    const list = Array.isArray(sources) ? sources.map(x => ({
        id: x && x.id ? x.id : ('epg-' + Math.random().toString(36).slice(2) + Date.now().toString(36)),
        name: x && x.name ? x.name : '未命名EPG',
        url: x && x.url ? x.url : '',
        scope: (x && x.scope === '外网EPG') ? '外网EPG' : '内网EPG'
    })).filter(x => !!x.url) : [];
    
    config.updateConfig('epgSources', { sources: list });
    const epgOk = await config.saveConfigStrict('epgSources');
    if (!epgOk) return apiFail(res, '保存失败', 500);
    return apiSuccess(res, {});
});

// 工具函数：代理类型标准化
function normalizeProxyType(t) {
    const v = String(t || '').trim();
    if (v === '代理' || v === '单播代理') return '单播代理';
    if (v === '外网' || v === '组播代理') return '组播代理';
    // 兼容英文输入
    const low = v.toLowerCase();
    if (low === 'proxy') return '单播代理';
    if (low === 'external' || low === 'internet') return '组播代理';
    return '组播代理';
}

module.exports = router;
