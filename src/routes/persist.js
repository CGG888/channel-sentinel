const express = require('express');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3');
const logger = require('../core/logger');
const config = require('../config');
const storage = require('../storage');
const storageMode = require('../storage/mode');
const streamsReader = require('../storage/streams-reader');
const configReader = require('../storage/config-reader');
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

// 数据目录和文件路径
const DATA_DIR = path.join(__dirname, '../../data');
const DATA_FILE = path.join(DATA_DIR, 'streams.json');
const SQLITE_DB = path.join(DATA_DIR, 'channel_sentinel.db');

/**
 * 确保数据目录存在
 */
function ensureDataDir() {
    try {
        if (!fs.existsSync(DATA_DIR)) {
            fs.mkdirSync(DATA_DIR, { recursive: true });
        }
    } catch (e) {
        logger.error(`创建数据目录失败: ${e.message}`, 'Persist');
    }
}

/**
 * 读取JSON文件
 */
function readJson(file, defObj) {
    ensureDataDir();
    try {
        if (fs.existsSync(file)) {
            const txt = fs.readFileSync(file, 'utf-8');
            return JSON.parse(txt);
        }
    } catch (e) {
        logger.error(`读取JSON文件失败: ${file} - ${e.message}`, 'Persist');
    }
    return defObj;
}

/**
 * 写入JSON文件
 */
function writeJson(file, obj) {
    ensureDataDir();
    try {
        fs.writeFileSync(file, JSON.stringify(obj, null, 2), 'utf-8');
        return true;
    } catch (e) {
        logger.error(`写入JSON文件失败: ${file} - ${e.message}`, 'Persist');
        return false;
    }
}

/**
 * 获取全局流列表（从主应用注入）
 */
let getStreams = () => {
    const cfg = config.getConfig('streams') || {};
    return Array.isArray(cfg.streams) ? cfg.streams : [];
};
let setStreams = (streams) => {};
let getSettings = () => {
    const cfg = config.getConfig('streams') || {};
    return cfg && cfg.settings && typeof cfg.settings === 'object' ? cfg.settings : {};
};
let setSettings = (settings) => {};

/**
 * 设置流列表和设置的获取/设置函数
 */
function setupPersistModule(streamsGetter, streamsSetter, settingsGetter, settingsSetter) {
    getStreams = streamsGetter;
    setStreams = streamsSetter;
    getSettings = settingsGetter;
    setSettings = settingsSetter;
}

function buildBackupStamp(d = new Date()) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

async function createSqliteBackupWithStamp(stamp) {
    await storage.init(config.getAllConfigs());
    await storage.checkpoint();
    if (!fs.existsSync(SQLITE_DB)) return '';
    const backupName = `channel_sentinel-${stamp}.db`;
    const backupFile = path.join(DATA_DIR, backupName);
    fs.copyFileSync(SQLITE_DB, backupFile);
    return backupName;
}

/**
 * 持久化保存当前数据与配置
 */
async function persistSave() {
    ensureDataDir();
    const fromGetter = Array.isArray(getStreams()) ? getStreams() : [];
    const fromConfig = Array.isArray((config.getConfig('streams') || {}).streams) ? (config.getConfig('streams') || {}).streams : [];
    const effectiveStreams = fromGetter.length > 0 ? fromGetter : fromConfig;
    const effectiveSettings = (() => {
        const s1 = getSettings();
        if (s1 && typeof s1 === 'object' && Object.keys(s1).length > 0) return s1;
        const s2 = (config.getConfig('streams') || {}).settings;
        return (s2 && typeof s2 === 'object') ? s2 : {};
    })();
    const payload = { 
        streams: effectiveStreams, 
        settings: effectiveSettings 
    };
    
    try {
        const mode = storageMode.getStorageMode();
        const stamp = buildBackupStamp();
        let jsonBackup = '';
        let sqliteBackup = '';
        if (storageMode.shouldWriteSqlite()) {
            await storage.syncConfig('streams', payload);
        }
        if (storageMode.shouldWriteJson()) {
            fs.writeFileSync(DATA_FILE, JSON.stringify(payload, null, 2), 'utf-8');
            const jsonName = `streams-${stamp}.json`;
            const verFile = path.join(DATA_DIR, jsonName);
            fs.writeFileSync(verFile, JSON.stringify(payload, null, 2), 'utf-8');
            jsonBackup = jsonName;
            storage.recordSnapshot(jsonBackup, 'persist');
        }
        if (storageMode.shouldWriteSqlite()) {
            sqliteBackup = await createSqliteBackupWithStamp(stamp);
            if (sqliteBackup) storage.recordSnapshot(sqliteBackup, 'persist-sqlite');
        }
        
        logger.info(`数据保存成功: mode=${mode}`, 'Persist');
        return { success: true, mode, jsonBackup, sqliteBackup };
    } catch (e) {
        logger.error(`数据保存失败: ${e.message}`, 'Persist');
        return { success: false, message: e.message || '保存失败' };
    }
}

/**
 * 从持久化文件加载数据
 */
async function persistLoad() {
    try {
        if (storageMode.shouldWriteSqlite() && !storageMode.shouldWriteJson()) {
            await storage.init(config.getAllConfigs());
            const sqliteStreams = await streamsReader.readStreamsFromSqlite();
            if (Array.isArray(sqliteStreams)) {
                setStreams(sqliteStreams);
                return true;
            }
            return false;
        }
        if (!storageMode.shouldWriteJson()) {
            logger.info('JSON读取已关闭，跳过persistLoad', 'Persist');
            return false;
        }
        if (fs.existsSync(DATA_FILE)) {
            const txt = fs.readFileSync(DATA_FILE, 'utf-8');
            const json = JSON.parse(txt);
            
            // 设置流列表
            if (Array.isArray(json.streams)) {
                setStreams(json.streams);
            }
            
            // 设置配置
            if (json.settings) {
                setSettings(json.settings);
            }
            await storage.syncConfig('streams', json);
            
            logger.info(`数据加载成功: ${DATA_FILE}，记录数: ${Array.isArray(json.streams) ? json.streams.length : 0}`, 'Persist');
            return true;
        }
    } catch (e) {
        logger.error(`数据加载失败: ${e.message}`, 'Persist');
    }
    return false;
}

/**
 * 列出所有版本文件
 */
function listVersions() {
    ensureDataDir();
    try {
        const files = fs.readdirSync(DATA_DIR).filter(f => /^streams-\d{8}-\d{6}\.json$/.test(f));
        const entries = files.map(f => {
            const full = path.join(DATA_DIR, f);
            let time = 0;
            try {
                const st = fs.statSync(full);
                time = st.mtimeMs || 0;
            } catch (e) {}
            return { file: f, time };
        });
        entries.sort((a, b) => b.time - a.time);
        return entries;
    } catch (e) {
        logger.error(`列出版本文件失败: ${e.message}`, 'Persist');
        return [];
    }
}

function listSqliteBackups() {
    ensureDataDir();
    try {
        const files = fs.readdirSync(DATA_DIR).filter(f => /^channel_sentinel-\d{8}-\d{6}\.db$/.test(f));
        const entries = files.map(f => {
            const full = path.join(DATA_DIR, f);
            let time = 0;
            let size = 0;
            try {
                const st = fs.statSync(full);
                time = st.mtimeMs || 0;
                size = st.size || 0;
            } catch (e) {}
            return { file: f, time, size };
        });
        entries.sort((a, b) => b.time - a.time);
        return entries;
    } catch (e) {
        logger.error(`列出SQLite备份失败: ${e.message}`, 'Persist');
        return [];
    }
}

function listBackupsByMode() {
    const mode = storageMode.getStorageMode();
    let mainEntry = null;
    try {
        if (fs.existsSync(SQLITE_DB)) {
            const st = fs.statSync(SQLITE_DB);
            mainEntry = {
                type: 'sqlite-main',
                file: 'channel_sentinel.db',
                time: st.mtimeMs || 0,
                size: st.size || 0,
                isMain: true
            };
        }
    } catch (e) {}
    const jsonBackups = listVersions().map((v) => ({ ...v, type: 'json' }));
    const sqliteBackups = listSqliteBackups().map((v) => ({ ...v, type: 'sqlite' }));
    let backups = [];
    if (mode === 'json') backups = jsonBackups;
    else if (mode === 'sqlite') backups = mainEntry ? [mainEntry, ...sqliteBackups] : sqliteBackups;
    else backups = [...jsonBackups, ...sqliteBackups];
    if (mode !== 'json' && mainEntry && !backups.find((b) => b && b.type === 'sqlite-main')) {
        backups = [mainEntry, ...backups];
    }
    backups.sort((a, b) => (b.time || 0) - (a.time || 0));
    if (mainEntry) {
        backups = [mainEntry, ...backups.filter((b) => !(b && b.type === 'sqlite-main'))];
    }
    return { mode, backups };
}

function openReadOnlyDb(filePath) {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(filePath, sqlite3.OPEN_READONLY, (err) => {
            if (err) reject(err);
            else resolve(db);
        });
    });
}

function dbAll(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(Array.isArray(rows) ? rows : []);
        });
    });
}

function dbGet(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row || null);
        });
    });
}

function closeDb(db) {
    return new Promise((resolve) => {
        db.close(() => resolve());
    });
}

function mapStreamRow(r) {
    return {
        udpxyUrl: r.udpxy_url || '',
        multicastUrl: r.multicast_url || '',
        name: r.name || '',
        tvgId: r.tvg_id || '',
        tvgName: r.tvg_name || '',
        logo: r.logo || '',
        groupTitle: r.group_title || '',
        catchupFormat: r.catchup_format || '',
        catchupBase: r.catchup_base || '',
        m3uCatchup: r.m3u_catchup || '',
        m3uCatchupSource: r.m3u_catchup_source || '',
        httpParam: r.http_param || '',
        isAvailable: !!r.is_available,
        lastChecked: r.last_checked || '',
        frameRate: r.frame_rate || '',
        bitRate: r.bit_rate || '',
        speed: r.speed || '',
        resolution: r.resolution || '',
        codec: r.codec || ''
    };
}

async function readStreamsFromSqliteFile(filePath) {
    let db = null;
    try {
        db = await openReadOnlyDb(filePath);
        const rows = await dbAll(db, `
            SELECT
                udpxy_url, multicast_url, name, tvg_id, tvg_name, logo, group_title,
                catchup_format, catchup_base, m3u_catchup, m3u_catchup_source, http_param,
                is_available, last_checked, frame_rate, bit_rate, speed, resolution, codec
            FROM streams
            ORDER BY id ASC
        `);
        return rows.map(mapStreamRow);
    } finally {
        if (db) await closeDb(db);
    }
}

async function readAppSettingsFromSqliteFile(filePath, fallbackObj = {}) {
    let db = null;
    try {
        db = await openReadOnlyDb(filePath);
        const rows = await dbAll(db, `SELECT key, value FROM app_settings`);
        const obj = {};
        for (const r of rows) {
            const k = String(r && r.key ? r.key : '');
            if (!k) continue;
            const raw = String(r && r.value != null ? r.value : '');
            const lower = raw.toLowerCase();
            if (lower === 'true') obj[k] = true;
            else if (lower === 'false') obj[k] = false;
            else if (/^-?\d+(\.\d+)?$/.test(raw)) obj[k] = Number(raw);
            else obj[k] = raw;
        }
        return { ...(fallbackObj || {}), ...obj };
    } finally {
        if (db) await closeDb(db);
    }
}

async function restoreSqliteBackupToMain(filename) {
    if (!/^channel_sentinel-\d{8}-\d{6}\.db$/.test(filename)) {
        throw new Error('非法SQLite备份文件名');
    }
    const src = path.join(DATA_DIR, filename);
    if (!fs.existsSync(src)) throw new Error('SQLite备份不存在');
    const preBackup = await createSqliteBackupWithStamp(buildBackupStamp());
    if (!preBackup) throw new Error('恢复前主库保护备份创建失败');
    logger.warn(`恢复前已创建主库保护备份: ${preBackup}`, 'Persist');
    await storage.close();
    if (typeof streamsReader.resetSharedDb === 'function') await streamsReader.resetSharedDb();
    if (typeof configReader.resetSharedDb === 'function') await configReader.resetSharedDb();
    fs.copyFileSync(src, SQLITE_DB);
    await storage.init();
    if (typeof streamsReader.resetSharedDb === 'function') await streamsReader.resetSharedDb();
    if (typeof configReader.resetSharedDb === 'function') await configReader.resetSharedDb();
    const sqliteStreams = await streamsReader.readStreamsFromSqlite();
    if (!Array.isArray(sqliteStreams)) {
        throw new Error(`SQLite备份读取失败: ${filename}`);
    }
    setStreams(sqliteStreams);
    const streamsCfg = config.getConfig('streams') || { streams: [], settings: {} };
    config.updateConfig('streams', { ...streamsCfg, streams: sqliteStreams });
    const payload = { streams: sqliteStreams, settings: getSettings() };
    if (storageMode.shouldWriteJson()) {
        writeJson(DATA_FILE, payload);
    }
    return { streams: sqliteStreams, settings: getSettings(), loadedCount: sqliteStreams.length, preBackup };
}

/**
 * 加载指定版本文件
 */
function loadVersionFile(filename) {
    ensureDataDir();
    if (!storageMode.shouldWriteJson()) {
        logger.info('JSON读取已关闭，跳过loadVersionFile', 'Persist');
        return false;
    }
    const full = path.join(DATA_DIR, filename);
    if (!fs.existsSync(full)) {
        return false;
    }
    
    try {
        const txt = fs.readFileSync(full, 'utf-8');
        const json = JSON.parse(txt);
        
        // 设置流列表
        if (Array.isArray(json.streams)) {
            setStreams(json.streams);
        }
        
        // 设置配置
        if (json.settings) {
            setSettings(json.settings);
        }
        storage.syncConfig('streams', json);
        
        logger.info(`版本加载成功: ${filename}`, 'Persist');
        return true;
    } catch (e) {
        logger.error(`版本加载失败: ${filename} - ${e.message}`, 'Persist');
        return false;
    }
}

// API端点

/**
 * 保存当前数据与配置
 */
route('post', '/save', async (req, res) => {
    req.log.info('请求保存当前数据与配置');
    const result = await persistSave();
    if (result && result.success) {
        return apiSuccess(res, result);
    }
    return apiFail(res, (result && result.message) || '保存失败', 500, result || {});
});

/**
 * 加载数据
 */
route('post', '/load', async (req, res) => {
    req.log.info('请求加载数据');
    const ok = await persistLoad();
    if (ok) {
        return apiSuccess(res, { streams: getStreams(), settings: getSettings() });
    }
    return apiFail(res, '未找到持久化文件', 404);
});

/**
 * 删除所有数据
 */
route('post', '/delete', async (req, res) => {
    req.log.info('请求删除所有数据');
    ensureDataDir();
    try {
        if (fs.existsSync(DATA_FILE)) {
            fs.unlinkSync(DATA_FILE);
            return apiSuccess(res, {});
        }
        return apiSuccess(res, { message: '文件不存在' });
    } catch (e) {
        req.log.error(`删除数据失败: ${e.message}`);
        return apiFail(res, '删除失败', 500);
    }
});

/**
 * 列出所有版本
 */
route('get', '/list', async (req, res) => {
    try {
        if (storageMode.getStorageMode() === 'sqlite') {
            return apiSuccess(res, { versions: [], message: 'SQLite主模式请使用 /api/persist/backups' });
        }
        const versions = listVersions();
        return apiSuccess(res, { versions });
    } catch (e) {
        req.log.error(`列出版本失败: ${e.message}`);
        return apiFail(res, '列出版本失败', 500);
    }
});

/**
 * 加载指定版本
 */
route('post', '/load-version', async (req, res) => {
    const { filename } = req.body || {};
    if (!filename) {
        return apiFail(res, '缺少filename', 400);
    }
    if (storageMode.getStorageMode() === 'sqlite') {
        return apiFail(res, 'SQLite主模式请使用 /api/persist/load-backup 并传 type=sqlite', 400);
    }
    
    req.log.info(`请求加载版本: ${filename}`);
    const ok = loadVersionFile(filename);
    if (ok) {
        return apiSuccess(res, { streams: getStreams(), settings: getSettings() });
    }
    return apiFail(res, '版本文件不存在或读取失败', 404);
});

/**
 * 删除指定版本
 */
route('post', '/delete-version', async (req, res) => {
    const { filename } = req.body || {};
    if (!filename) {
        return apiFail(res, '缺少filename', 400);
    }
    if (storageMode.getStorageMode() === 'sqlite') {
        return apiFail(res, 'SQLite主模式不支持删除 JSON 版本', 400);
    }
    
    req.log.info(`请求删除版本: ${filename}`);
    ensureDataDir();
    const full = path.join(DATA_DIR, filename);
    try {
        if (fs.existsSync(full)) {
            fs.unlinkSync(full);
            return apiSuccess(res, {});
        } else {
            return apiFail(res, '文件不存在', 404);
        }
    } catch (e) {
        return apiFail(res, '删除失败', 500);
    }
});

route('get', '/backups', async (req, res) => {
    try {
        const result = listBackupsByMode();
        return apiSuccess(res, { mode: result.mode, backups: result.backups });
    } catch (e) {
        req.log.error(`读取备份列表失败: ${e.message}`);
        return apiFail(res, '读取备份列表失败', 500);
    }
});

route('post', '/load-backup', async (req, res) => {
    const type = String((req.body && req.body.type) || '').trim().toLowerCase();
    const filename = String((req.body && req.body.filename) || '').trim();
    if (!type || !filename) {
        return res.status(400).json({ success: false, message: '缺少type或filename' });
    }
    try {
        if (type === 'json') {
            if (storageMode.getStorageMode() === 'sqlite') {
                return res.status(400).json({ success: false, message: 'SQLite主模式不支持加载 JSON 备份' });
            }
            const ok = loadVersionFile(filename);
            if (!ok) return res.status(404).json({ success: false, message: 'JSON备份不存在或读取失败' });
            return res.json({ success: true, type, filename, streams: getStreams(), settings: getSettings() });
        }
        if (type === 'sqlite') {
            const restored = await restoreSqliteBackupToMain(filename);
            return res.json({ success: true, type, filename, ...restored, restored: true });
        }
        if (type === 'sqlite-main') {
            if (filename !== 'channel_sentinel.db') {
                return res.status(400).json({ success: false, message: '非法主库文件名' });
            }
            if (!fs.existsSync(SQLITE_DB)) return res.status(404).json({ success: false, message: 'SQLite主库不存在' });
            await storage.init();
            if (typeof streamsReader.resetSharedDb === 'function') await streamsReader.resetSharedDb();
            if (typeof configReader.resetSharedDb === 'function') await configReader.resetSharedDb();
            const sqliteStreams = await streamsReader.readStreamsFromSqlite();
            if (!Array.isArray(sqliteStreams)) {
                throw new Error('SQLite主库读取失败');
            }
            setStreams(sqliteStreams);
            const streamsCfg = config.getConfig('streams') || { streams: [], settings: {} };
            config.updateConfig('streams', { ...streamsCfg, streams: sqliteStreams });
            const payload = { streams: sqliteStreams, settings: getSettings() };
            if (storageMode.shouldWriteJson()) {
                writeJson(DATA_FILE, payload);
            }
            return res.json({ success: true, type, filename, streams: sqliteStreams, settings: getSettings(), loadedCount: sqliteStreams.length });
        }
        return res.status(400).json({ success: false, message: '不支持的备份类型' });
    } catch (e) {
        logger.error(`加载备份失败: ${e.message}`, 'Persist');
        return res.status(500).json({ success: false, message: '加载备份失败' });
    }
});

route('post', '/preview-backup', async (req, res) => {
    const type = String((req.body && req.body.type) || '').trim().toLowerCase();
    const filename = String((req.body && req.body.filename) || '').trim();
    if (!type || !filename) {
        return res.status(400).json({ success: false, message: '缺少type或filename' });
    }
    try {
        if (type === 'sqlite-main') {
            if (filename !== 'channel_sentinel.db') {
                return res.status(400).json({ success: false, message: '非法主库文件名' });
            }
            if (!fs.existsSync(SQLITE_DB)) return res.status(404).json({ success: false, message: 'SQLite主库不存在' });
            const streams = await readStreamsFromSqliteFile(SQLITE_DB);
            return res.json({ success: true, type, filename, streams, settings: getSettings(), loadedCount: streams.length, preview: true });
        }
        if (type === 'sqlite') {
            if (!/^channel_sentinel-\d{8}-\d{6}\.db$/.test(filename)) {
                return res.status(400).json({ success: false, message: '非法SQLite备份文件名' });
            }
            const src = path.join(DATA_DIR, filename);
            if (!fs.existsSync(src)) return res.status(404).json({ success: false, message: 'SQLite备份不存在' });
            const streams = await readStreamsFromSqliteFile(src);
            const settings = await readAppSettingsFromSqliteFile(src, getSettings());
            return res.json({ success: true, type, filename, streams, settings, loadedCount: streams.length, preview: true });
        }
        if (type === 'json') {
            if (!storageMode.shouldWriteJson()) {
                return res.status(400).json({ success: false, message: '当前模式不支持JSON预览' });
            }
            const full = path.join(DATA_DIR, filename);
            if (!fs.existsSync(full)) return res.status(404).json({ success: false, message: 'JSON备份不存在' });
            const txt = fs.readFileSync(full, 'utf-8');
            const json = JSON.parse(txt);
            const streams = Array.isArray(json && json.streams) ? json.streams : [];
            const settings = (json && json.settings && typeof json.settings === 'object') ? json.settings : getSettings();
            return res.json({ success: true, type, filename, streams, settings, loadedCount: streams.length, preview: true });
        }
        return res.status(400).json({ success: false, message: '不支持的备份类型' });
    } catch (e) {
        logger.error(`预览备份失败: ${e.message}`, 'Persist');
        return res.status(500).json({ success: false, message: '预览备份失败' });
    }
});

route('post', '/restore-backup', async (req, res) => {
    const type = String((req.body && req.body.type) || '').trim().toLowerCase();
    const filename = String((req.body && req.body.filename) || '').trim();
    const confirmed = !!(req.body && req.body.confirmed);
    if (!type || !filename) {
        return res.status(400).json({ success: false, message: '缺少type或filename' });
    }
    if (!confirmed) {
        return res.status(400).json({ success: false, message: '请确认后再恢复主库' });
    }
    try {
        if (type !== 'sqlite') {
            return res.status(400).json({ success: false, message: '仅支持从SQLite备份恢复主库' });
        }
        const restored = await restoreSqliteBackupToMain(filename);
        return res.json({ success: true, type, filename, ...restored, restored: true });
    } catch (e) {
        logger.error(`恢复主库失败: ${e.message}`, 'Persist');
        return res.status(500).json({ success: false, message: '恢复主库失败' });
    }
});

route('post', '/delete-backup', async (req, res) => {
    const type = String((req.body && req.body.type) || '').trim().toLowerCase();
    const filename = String((req.body && req.body.filename) || '').trim();
    if (!type || !filename) {
        return res.status(400).json({ success: false, message: '缺少type或filename' });
    }
    try {
        const allowed = type === 'json'
            ? /^streams-\d{8}-\d{6}\.json$/.test(filename)
            : /^channel_sentinel-\d{8}-\d{6}\.db$/.test(filename);
        if (!allowed) return res.status(400).json({ success: false, message: '非法文件名' });
        const full = path.join(DATA_DIR, filename);
        if (!fs.existsSync(full)) return res.status(404).json({ success: false, message: '备份文件不存在' });
        fs.unlinkSync(full);
        return res.json({ success: true });
    } catch (e) {
        logger.error(`删除备份失败: ${e.message}`, 'Persist');
        return res.status(500).json({ success: false, message: '删除备份失败' });
    }
});

route('post', '/sqlite-backup', async (req, res) => {
    try {
        ensureDataDir();
        const backupName = await createSqliteBackupWithStamp(buildBackupStamp());
        if (!backupName) return res.status(404).json({ success: false, message: 'SQLite数据库文件不存在' });
        logger.info(`SQLite备份成功: ${backupName}`, 'Persist');
        return res.json({ success: true, file: backupName });
    } catch (e) {
        logger.error(`SQLite备份失败: ${e.message}`, 'Persist');
        return res.status(500).json({ success: false, message: 'SQLite备份失败' });
    }
});

route('get', '/sqlite-backups', async (req, res) => {
    try {
        const backups = listSqliteBackups();
        return res.json({ success: true, backups });
    } catch (e) {
        logger.error(`读取SQLite备份列表失败: ${e.message}`, 'Persist');
        return res.status(500).json({ success: false, message: '读取备份列表失败' });
    }
});

module.exports = {
    router,
    setupPersistModule,
    persistSave,
    persistLoad,
    listVersions,
    loadVersionFile
};
