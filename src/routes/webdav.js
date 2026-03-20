const express = require('express');
const router = express.Router();
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { XMLParser } = require('fast-xml-parser');
const logger = require('../core/logger');
const config = require('../config');
const storage = require('../storage');
const streamsReader = require('../storage/streams-reader');
const configReader = require('../storage/config-reader');
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

// 获取设置（与SQLite主模式保持一致）
async function getSettings() {
    const runtimeApp = config.getConfig('appSettings') || {};
    const sqliteApp = await configReader.loadAppSettingsFallback({});
    const appSettings = { ...(sqliteApp || {}), ...(runtimeApp || {}) };
    if (typeof appSettings.webdavPass === 'string' && appSettings.webdavPass.startsWith('enc:v1:') && typeof config.decryptSecret === 'function') {
        appSettings.webdavPass = config.decryptSecret(appSettings.webdavPass) || '';
    }
    if (typeof appSettings.securityToken === 'string' && appSettings.securityToken.startsWith('enc:v1:') && typeof config.decryptSecret === 'function') {
        appSettings.securityToken = config.decryptSecret(appSettings.securityToken) || '';
    }
    const streamsRuntime = config.getConfig('streams') || { streams: [] };
    const sqliteStreams = await streamsReader.readStreamsFromSqlite();
    const streamsList = Array.isArray(sqliteStreams) ? sqliteStreams : (Array.isArray(streamsRuntime.streams) ? streamsRuntime.streams : []);
    const fccRuntime = config.getConfig('fccServers') || { servers: [], currentId: '' };
    const fccServers = await configReader.loadFccServersFallback(fccRuntime);
    const logoRuntime = config.getConfig('logoTemplates') || { templates: [], currentId: '' };
    const logoTemplates = await configReader.loadLogoTemplatesFallback(logoRuntime);
    const groupTitlesRuntime = config.getConfig('groupTitles') || { titles: [] };
    const groupTitles = await configReader.loadGroupTitlesFallback(groupTitlesRuntime);
    const proxyRuntime = config.getConfig('proxyServers') || { list: [] };
    const proxyServers = await configReader.loadProxyServersFallback(proxyRuntime);
    const logoCurrentId = String(appSettings.logoTemplateCurrentId || logoTemplates.currentId || '');
    const currentLogo = (logoTemplates.templates || []).find(t => String(t && t.id ? t.id : '') === logoCurrentId) || (logoTemplates.templates || [])[0] || null;
    const logoTemplate = currentLogo && currentLogo.url ? currentLogo.url : (appSettings.logoTemplate || 'http://12.12.12.177:9443/lcmyhome/TVlive/raw/branch/main/LOGO/{name}.png');
    return {
        globalFcc: appSettings.globalFcc || '',
        fccServers: Array.isArray(fccServers.servers) ? fccServers.servers : [],
        logoTemplate,
        groupTitles: Array.isArray(groupTitles.titles) ? groupTitles.titles : ['默认'],
        externalUrl: appSettings.externalUrl || '',
        internalUrl: appSettings.internalUrl || '',
        useInternal: appSettings.useInternal || false,
        useExternal: appSettings.useExternal || false,
        securityToken: appSettings.securityToken || '',
        enableToken: appSettings.enableToken || false,
        proxyList: Array.isArray(proxyServers.list) ? proxyServers.list : [],
        webdavUrl: appSettings.webdavUrl || '',
        webdavUser: appSettings.webdavUser || '',
        webdavPass: appSettings.webdavPass || '',
        webdavRoot: appSettings.webdavRoot || '/',
        webdavInsecure: appSettings.webdavInsecure || false,
        logLevel: appSettings.logLevel || 'info',
        logKeepDays: appSettings.logKeepDays || 7,
        multicastList: streamsList
    };
}

// 创建WebDAV axios实例
function makeAxiosForWebDav(settings) {
    const https = require('https');
    const agent = new https.Agent({ rejectUnauthorized: !settings.webdavInsecure });
    const inst = axios.create({
        baseURL: settings.webdavUrl,
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        httpsAgent: agent,
        validateStatus: () => true,
        auth: settings.webdavUser ? { 
            username: settings.webdavUser, 
            password: settings.webdavPass || '' 
        } : undefined
    });
    return inst;
}

// 连接WebDAV路径
function joinWebDavPath(...parts) {
    return parts.join('/').replace(/\/+/g, '/');
}

// 获取当前时间文件夹部分
function nowFolderParts() {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    const y = d.getFullYear();
    const ymd = `${y}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
    const hms = `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    return [String(y), ymd, hms];
}

// 构建当前流数据payload
async function buildCurrentStreamsPayload() {
    const settings = await getSettings();
    const payload = { 
        streams: settings.multicastList || [], 
        settings: { ...settings, globalFcc: settings.globalFcc } 
    };
    try { 
        return Buffer.from(JSON.stringify(payload, null, 2)); 
    } catch(e) { 
        return Buffer.from('{}'); 
    }
}

// 确保数据目录存在
function ensureDataDir() {
    const DATA_DIR = path.join(__dirname, '../../data');
    try {
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }
    } catch (e) {
        // 忽略错误
    }
}

// 测试WebDAV连接
route('post', '/webdav/test', async (req, res) => {
    const settings = await getSettings();
    const inst = makeAxiosForWebDav(settings);
    
    if (!settings.webdavUrl) {
        return apiFail(res, '未配置 webdavUrl', 400);
    }
    
    try {
        let root = joinWebDavPath(settings.webdavRoot || '/');
        if (!root.endsWith('/')) root += '/';
        const r = await inst.request({ 
            method: 'PROPFIND', 
            url: root, 
            headers: { Depth: '0' } 
        });
        
        if (r.status >= 200 && r.status < 300) {
            return apiSuccess(res, { status: r.status });
        }
        
        return apiFail(res, 'WebDAV 不可用', 502, { status: r.status });
    } catch (e) {
        req.log.error(`WebDAV 测试连接失败: ${e.message}`);
        return apiFail(res, '连接失败', 500);
    }
});

// WebDAV备份
route('post', '/webdav/backup', async (req, res) => {
    const settings = await getSettings();
    
    if (!settings.webdavUrl) {
        return apiFail(res, '未配置 WebDAV', 400);
    }
    
    const inst = makeAxiosForWebDav(settings);
    let base = joinWebDavPath(settings.webdavRoot || '/');
    if (!base.endsWith('/')) base += '/';
    const parts = nowFolderParts();
    const folder = joinWebDavPath(base, ...parts);
    
    try {
        await storage.init(config.getAllConfigs());
        await storage.checkpoint();
        // 创建嵌套文件夹
        logger.info(`WebDAV 备份开始，目标目录: ${folder}`, 'WebDAV');
        let cur = base;
        
        for (const p of parts) {
            cur = joinWebDavPath(cur, p);
            const mkUrl = cur.endsWith('/') ? cur : (cur + '/');
            const mk = await inst.request({ 
                method: 'MKCOL', 
                url: mkUrl 
            });
            
            const ok = (mk.status >= 200 && mk.status < 300) || 
                      mk.status === 201 || 
                      mk.status === 204 || 
                      mk.status === 405;
            
            if (!ok) {
                logger.error(`MKCOL 失败: ${mk.status} ${mkUrl}`, 'WebDAV');
                throw new Error(`MKCOL 失败: ${mk.status}`);
            } else {
                logger.debug(`MKCOL 成功/已存在: ${mk.status} ${mkUrl}`, 'WebDAV');
            }
        }
        
        // 配置文件列表
        const files = [
            { path: path.join(__dirname, '../../data/logo_templates.json'), name: 'logo_templates.json' },
            { path: path.join(__dirname, '../../data/fcc_servers.json'), name: 'fcc_servers.json' },
            { path: path.join(__dirname, '../../data/udpxy_servers.json'), name: 'udpxy_servers.json' },
            { path: path.join(__dirname, '../../data/group_titles.json'), name: 'group_titles.json' },
            { path: path.join(__dirname, '../../data/group_rules.json'), name: 'group_rules.json' },
            { path: path.join(__dirname, '../../data/epg_sources.json'), name: 'epg_sources.json' },
            { path: path.join(__dirname, '../../data/proxy_servers.json'), name: 'proxy_servers.json' },
            { path: path.join(__dirname, '../../data/app_settings.json'), name: 'app_settings.json' },
            { path: path.join(__dirname, '../../data/channel_sentinel.db'), name: 'channel_sentinel.db' }
        ];
        
        let uploaded = 0;
        
        for (const f of files) {
            if (fs.existsSync(f.path)) {
                const buf = fs.readFileSync(f.path);
                const url = joinWebDavPath(folder, f.name);
                const put = await inst.put(url, buf, { 
                    headers: { 'Content-Type': f.name.endsWith('.db') ? 'application/octet-stream' : 'application/json' } 
                });
                
                const ok = (put.status >= 200 && put.status < 300) || 
                          put.status === 201 || 
                          put.status === 204;
                
                if (ok) {
                    uploaded++;
                    logger.debug(`PUT 成功: ${url} status=${put.status}`, 'WebDAV');
                } else {
                    logger.warn(`PUT 失败: ${url} status=${put.status}`, 'WebDAV');
                }
            }
        }
        
        // 流数据
        const sBuf = await buildCurrentStreamsPayload();
        const sUrl = joinWebDavPath(folder, 'streams.json');
        const putS = await inst.put(sUrl, sBuf, { 
            headers: { 'Content-Type': 'application/json' } 
        });
        
        if ((putS.status >= 200 && putS.status < 300) || 
            putS.status === 201 || 
            putS.status === 204) {
            uploaded++;
            logger.debug(`PUT 成功: ${sUrl} status=${putS.status}`, 'WebDAV');
        } else {
            logger.warn(`PUT 失败: ${sUrl} status=${putS.status}`, 'WebDAV');
        }
        
        // 带时间戳的副本
        const stamp = `${parts[1]}-${parts[2]}`;
        const s2Url = joinWebDavPath(folder, `streams-${stamp}.json`);
        const putS2 = await inst.put(s2Url, sBuf, { 
            headers: { 'Content-Type': 'application/json' } 
        });
        
        if ((putS2.status >= 200 && putS2.status < 300) || 
            putS2.status === 201 || 
            putS2.status === 204) {
            uploaded++;
            logger.debug(`PUT 成功: ${s2Url} status=${putS2.status}`, 'WebDAV');
        } else {
            logger.warn(`PUT 失败: ${s2Url} status=${putS2.status}`, 'WebDAV');
        }
        
        if (uploaded === 0) {
            logger.error(`备份失败：未成功上传任何文件，目标目录 ${folder}`, 'WebDAV');
            return apiFail(res, '备份失败：未上传任何文件', 502);
        }
        
        logger.info(`WebDAV 备份完成：上传文件数 ${uploaded}，目录 ${folder}`, 'WebDAV');
        return apiSuccess(res, { folder: parts.join('/'), uploaded });
    } catch (e) {
        req.log.error(`WebDAV 备份异常: ${e.message}`);
        return apiFail(res, '备份失败', 500);
    }
});

// 列出WebDAV备份目录
route('post', '/webdav/list', async (req, res) => {
    const settings = await getSettings();
    
    if (!settings.webdavUrl) {
        return apiFail(res, '未配置 WebDAV', 400);
    }
    
    const inst = makeAxiosForWebDav(settings);
    let base = joinWebDavPath(settings.webdavRoot || '/');
    if (!base.endsWith('/')) base += '/';
    const parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true });
    
    async function listDir(url) {
        let u = url;
        if (!u.endsWith('/')) u += '/';
        const r = await inst.request({ 
            method: 'PROPFIND', 
            url: u, 
            headers: { Depth: '1' } 
        });
        
        if (r.status < 200 || r.status >= 300) return [];
        let xml = r.data;
        
        try {
            const txt = Buffer.isBuffer(xml) ? xml.toString('utf-8') : String(xml || '');
            const j = parser.parse(txt);
            const resp = j && (j.multistatus && j.multistatus.response);
            const arr = Array.isArray(resp) ? resp : (resp ? [resp] : []);
            
            return arr.map(x => {
                const href = (x.href || '').trim();
                const propstat = x.propstat || x['d:propstat'] || {};
                const prop = propstat.prop || propstat['d:prop'] || {};
                const rtype = prop.resourcetype || (prop['d:resourcetype'] || {});
                const isDir = rtype && (rtype.collection !== undefined);
                return { href, isDir };
            }).filter(e => e.isDir)
              .map(e => decodeURI(e.href));
        } catch(e) { 
            return []; 
        }
    }
    
    async function listEntries(url) {
        let u = url;
        if (!u.endsWith('/')) u += '/';
        const r = await inst.request({ 
            method: 'PROPFIND', 
            url: u, 
            headers: { Depth: '1' } 
        });
        
        if (r.status < 200 || r.status >= 300) return [];
        let xml = r.data;
        
        try {
            const txt = Buffer.isBuffer(xml) ? xml.toString('utf-8') : String(xml || '');
            const j = parser.parse(txt);
            const resp = j && (j.multistatus && j.multistatus.response);
            const arr = Array.isArray(resp) ? resp : (resp ? [resp] : []);
            
            return arr.map(x => {
                const href = (x.href || '').trim();
                const propstat = x.propstat || x['d:propstat'] || {};
                const prop = propstat.prop || propstat['d:prop'] || {};
                const rtype = prop.resourcetype || (prop['d:resourcetype'] || {});
                const isDir = !!(rtype && rtype.collection !== undefined);
                return { href: decodeURI(href), isDir };
            });
        } catch(e) { 
            return []; 
        }
    }
    
    try {
        const years = await listDir(base);
        let result = [];
        
        for (const y of years) {
            if (y.replace(/\/+$/, '') === base.replace(/\/+$/, '')) continue;
            const ys = await listDir(y);
            
            for (const d of ys) {
                const ts = await listDir(d);
                
                for (const t of ts) {
                    const entries = await listEntries(t);
                    const hasStreams = entries.some(e => 
                        !e.isDir && /\/streams(\-\d{8}\-\d{6})?\.json$/i.test(e.href)
                    );
                    
                    if (!hasStreams) continue;
                    
                    let rel = t;
                    rel = rel.replace(/^https?:\/\/[^/]+/i, '');
                    rel = rel.replace(/^\/+/, '');
                    
                    const rootPrefix = (settings.webdavRoot || '/')
                        .replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')
                        .replace(/^\/?/, '')
                        .replace(/\/?$/, '');
                    
                    const re = new RegExp('^' + rootPrefix + '\/?', 'i');
                    const pathRel = rel.replace(re, '').replace(/^\/+/, '').replace(/\/+$/, '');
                    
                    if (pathRel) result.push(pathRel);
                }
            }
        }
        
        result = result.sort().reverse();
        return apiSuccess(res, { dirs: result });
    } catch (e) {
        req.log.error(`WebDAV 列目录失败: ${e.message}`);
        return apiFail(res, '列目录失败', 500);
    }
});

function normalizeBackupFolder(folder, webdavRoot) {
    const fParts = String(folder || '').split('/').filter(Boolean);
    for (let i = 0; i <= fParts.length - 3; i++) {
        if (/^\d{4}$/.test(fParts[i]) &&
            /^\d{8}$/.test(fParts[i + 1]) &&
            /^\d{6}$/.test(fParts[i + 2])) {
            return `${fParts[i]}/${fParts[i + 1]}/${fParts[i + 2]}`;
        }
    }
    const rootPrefix = String(webdavRoot || '/').replace(/^\/+|\/+$/g, '');
    let tmp = fParts.join('/');
    if (rootPrefix) {
        tmp = tmp.replace(
            new RegExp('^' + rootPrefix.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&') + '/?', 'i'),
            ''
        );
    }
    if (/^\d{4}\/\d{8}\/\d{6}$/.test(tmp)) return tmp;
    return '';
}

route('post', '/webdav/delete', async (req, res) => {
    const { folder } = req.body || {};
    const settings = await getSettings();
    if (!settings.webdavUrl) {
        return apiFail(res, '未配置 WebDAV', 400);
    }
    const norm = normalizeBackupFolder(folder, settings.webdavRoot || '/');
    if (!norm) {
        return apiFail(res, '非法目录', 400);
    }
    const inst = makeAxiosForWebDav(settings);
    let base = joinWebDavPath(settings.webdavRoot || '/');
    if (!base.endsWith('/')) base += '/';
    const dir = joinWebDavPath(base, norm);
    let url = dir;
    if (!url.endsWith('/')) url += '/';
    try {
        const r = await inst.request({ method: 'DELETE', url });
        if (r.status >= 200 && r.status < 300) {
            logger.info(`WebDAV 删除备份目录成功: ${dir}`, 'WebDAV');
            return apiSuccess(res, { folder: norm, status: r.status });
        }
        logger.warn(`WebDAV 删除备份目录失败: ${dir} status=${r.status}`, 'WebDAV');
        return apiFail(res, '删除失败', 502, { status: r.status });
    } catch (e) {
        const status = e && e.response ? e.response.status : undefined;
        logger.warn(`WebDAV 删除备份目录异常: ${dir} status=${status} err=${e.message}`, 'WebDAV');
        return apiFail(res, '删除失败', 500, { status });
    }
});

// WebDAV恢复
route('post', '/webdav/restore', async (req, res) => {
    const { folder } = req.body || {};
    const settings = await getSettings();
    
    if (!settings.webdavUrl) {
        return apiFail(res, '未配置 WebDAV', 400);
    }
    
    if (!folder) {
        return apiFail(res, '缺少 folder', 400);
    }
    
    const inst = makeAxiosForWebDav(settings);
    
    const toAbs = (p) => {
        const base = String(settings.webdavUrl || '').replace(/\/+$/, '');
        return /^https?:\/\//i.test(p) ? p : base + (p.startsWith('/') ? '' : '/') + p;
    };
    
    let base = joinWebDavPath(settings.webdavRoot || '/');
    if (!base.endsWith('/')) base += '/';
    
    const norm = normalizeBackupFolder(folder, settings.webdavRoot || '/');
    if (!norm) {
        return apiFail(res, '非法目录', 400);
    }
    
    const dir = joinWebDavPath(base, norm);
    let restored = 0;
    let restoredDb = false;
    let details = [];
    
    try {
        logger.info(`WebDAV 恢复开始，目录: ${dir}`, 'WebDAV');
        ensureDataDir();
        const parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true });
        
        async function listEntries(u) {
            let url = u; 
            if (!url.endsWith('/')) url += '/';
            const r = await inst.request({ 
                method: 'PROPFIND', 
                url, 
                headers: { Depth: '1' } 
            });
            
            if (r.status < 200 || r.status >= 300) return [];
            const txt = Buffer.isBuffer(r.data) ? r.data.toString('utf-8') : String(r.data || '');
            
            try {
                const j = parser.parse(txt);
                const resp = j && j.multistatus && j.multistatus.response;
                const arr = Array.isArray(resp) ? resp : (resp ? [resp] : []);
                
                return arr.map(x => {
                    const href = decodeURI((x.href || '').trim());
                    const ps = Array.isArray(x.propstat) ? (x.propstat[0] || {}) : (x.propstat || {});
                    const prop = ps.prop || {};
                    const rtype = prop.resourcetype || {};
                    const isDir = !!(rtype && rtype.collection !== undefined) || /\/$/.test(href);
                    return { href, isDir };
                }).filter(e => e.href && e.href !== url);
            } catch(e) { return []; }
        }
        const entries = await listEntries(dir);
        logger.info(`WebDAV 恢复扫描完成，条目数: ${Array.isArray(entries)?entries.length:0}`, 'WebDAV');
        const fileEntries = entries.filter(e => /\.db(\?|$)/i.test(e.href));
        logger.info(`WebDAV 恢复候选文件数: ${fileEntries.length}`, 'WebDAV');
        const toDownload = fileEntries.map(e => {
            const href = e.href;
            const pathOnly = href.replace(/^https?:\/\/[^/]+/i, '');
            const last = (pathOnly.split('/').filter(Boolean).pop() || '').trim();
            const urlFull = /^https?:\/\//i.test(href) ? href : joinWebDavPath(dir, last);
            return { url: toAbs(urlFull), name: last, raw: href };
        });
        const sqliteMainPath = path.join(__dirname, '../../data/channel_sentinel.db');
        const dbCandidates = toDownload
            .filter((f) => /^channel_sentinel(?:-\d{8}-\d{6})?\.db$/i.test(f.name))
            .sort((a, b) => {
                const aExact = /^channel_sentinel\.db$/i.test(a.name) ? 1 : 0;
                const bExact = /^channel_sentinel\.db$/i.test(b.name) ? 1 : 0;
                if (aExact !== bExact) return bExact - aExact;
                return String(b.name).localeCompare(String(a.name));
            });
        if (dbCandidates.length === 0) {
            logger.warn(`WebDAV 恢复目录未找到SQLite备份文件，目录: ${dir}`, 'WebDAV');
            details.push({ skipped: true, reason: '未发现 channel_sentinel*.db 文件', dir });
        }
        for (const f of dbCandidates) {
            try {
                const dlUrl = joinWebDavPath(base, norm, f.name);
                const r = await inst.get(dlUrl, { responseType: 'arraybuffer' });
                const status = r && r.status ? r.status : 200;
                if (!(status >= 200 && status < 300)) {
                    details.push({ file: f.name, status, url: dlUrl });
                    logger.warn(`WebDAV 恢复SQLite失败: ${f.name} status=${status}`, 'WebDAV');
                    continue;
                }
                const buf = Buffer.from(r.data);
                await storage.close();
                if (typeof streamsReader.resetSharedDb === 'function') await streamsReader.resetSharedDb();
                if (typeof configReader.resetSharedDb === 'function') await configReader.resetSharedDb();
                fs.writeFileSync(sqliteMainPath, buf);
                await storage.init();
                if (typeof streamsReader.resetSharedDb === 'function') await streamsReader.resetSharedDb();
                if (typeof configReader.resetSharedDb === 'function') await configReader.resetSharedDb();
                const loaded = await streamsReader.readStreamsFromSqlite();
                if (!Array.isArray(loaded)) {
                    details.push({ file: f.name, error: 'SQLite恢复后读取失败', url: dlUrl });
                    logger.warn(`WebDAV 恢复SQLite失败: ${f.name} 读取校验未通过`, 'WebDAV');
                    continue;
                }
                restored++;
                restoredDb = true;
                details.push({ file: f.name, savedAs: 'channel_sentinel.db', status, url: dlUrl, loadedCount: loaded.length });
                logger.info(`WebDAV 恢复SQLite成功: ${f.name} -> channel_sentinel.db count=${loaded.length}`, 'WebDAV');
                break;
            } catch(err) {
                const status = err && err.response ? err.response.status : undefined;
                details.push({ file: f.name, error: String(err && err.message || err), status, url: joinWebDavPath(base, folder, f.name) });
                logger.warn(`WebDAV 恢复SQLite异常: ${f.name} status=${status}`, 'WebDAV');
            }
        }
        if (restored > 0) {
            logger.info(`WebDAV 恢复完成：恢复文件数 ${restored}，目录 ${dir}`, 'WebDAV');
            return apiSuccess(res, { restored, details });
        } else {
            logger.error(`WebDAV 恢复失败：未恢复任何文件，目录 ${dir}`, 'WebDAV');
            return apiFail(res, '未找到可恢复的 SQLite 备份文件', 502, { restored, details });
        }
    } catch (e) {
        req.log.error(`WebDAV 恢复异常: ${e && e.message ? e.message : String(e)}`);
        return apiFail(res, '恢复失败', 500, { restored, details });
    }
});

module.exports = router;
