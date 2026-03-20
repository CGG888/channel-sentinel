const path = require('path');
const sqlite3 = require('sqlite3');
const streamsReader = require('./streams-reader');
const logger = require('../core/logger');

const DATA_DIR = path.join(__dirname, '../../data');
const DB_FILE = path.join(DATA_DIR, 'channel_sentinel.db');
let sharedDb = null;
let openingPromise = null;

function openDb() {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(DB_FILE, sqlite3.OPEN_READONLY, (err) => {
            if (err) reject(err);
            else resolve(db);
        });
    });
}

async function getSharedDb() {
    if (sharedDb) return sharedDb;
    if (openingPromise) return openingPromise;
    openingPromise = openDb()
        .then((db) => {
            sharedDb = db;
            return db;
        })
        .finally(() => {
            openingPromise = null;
        });
    return openingPromise;
}

function all(db, sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

function closeDb(db) {
    return new Promise((resolve) => {
        db.close(() => resolve());
    });
}

function parseStoredValue(v) {
    const raw = String(v == null ? '' : v);
    try {
        return JSON.parse(raw);
    } catch (e) {
        return raw;
    }
}

async function queryRows(sql) {
    if (!streamsReader.shouldReadFromSqlite()) return null;
    return queryRowsForce(sql);
}

async function queryRowsForce(sql) {
    try {
        const db = await getSharedDb();
        return await all(db, sql);
    } catch (e) {
        if (sharedDb) {
            try { sharedDb.close(); } catch (_e) {}
            sharedDb = null;
        }
        logger.error(`SQLite配置读取失败: ${e.message}`, 'Storage');
        try {
            const db = await getSharedDb();
            return await all(db, sql);
        } catch (_e2) {
            return null;
        }
    }
}

async function loadAppSettingsFallback(fallbackObj = {}) {
    const rows = await queryRows(`SELECT key, value FROM app_settings`);
    if (!rows) return { ...(fallbackObj || {}) };
    const obj = {};
    for (const r of rows) {
        obj[String(r.key || '')] = parseStoredValue(r.value);
    }
    return { ...(fallbackObj || {}), ...obj };
}

async function loadFccServersFallback(fallbackObj = { servers: [], currentId: '' }) {
    let rows = null;
    try {
        rows = await queryRows(`SELECT id, name, url FROM fcc_servers ORDER BY id ASC`);
    } catch (_e) {
        rows = null;
    }
    if (!rows) {
        rows = await queryRows(`SELECT id, url FROM fcc_servers ORDER BY id ASC`);
    }
    if (!rows) return { ...(fallbackObj || { servers: [], currentId: '' }) };
    const fallbackList = Array.isArray(fallbackObj && fallbackObj.servers) ? fallbackObj.servers : [];
    const nameMap = new Map();
    for (const it of fallbackList) {
        const id = String(it && it.id ? it.id : '');
        if (!id) continue;
        nameMap.set(id, String(it && it.name ? it.name : ''));
    }
    return {
        servers: rows.map((r) => {
            const id = String(r && r.id ? r.id : '');
            const addr = String(r && r.url ? r.url : '');
            const name = String(r && r.name ? r.name : '') || nameMap.get(id) || '';
            return { id, name, addr, url: addr };
        }).filter((x) => x.addr),
        currentId: (fallbackObj && fallbackObj.currentId) || ''
    };
}

async function loadUdpxyServersFallback(fallbackObj = { servers: [], currentId: '' }) {
    let rows = null;
    try {
        rows = await queryRows(`SELECT id, name, url FROM udpxy_servers ORDER BY id ASC`);
    } catch (_e) {
        rows = null;
    }
    if (!rows) {
        rows = await queryRows(`SELECT id, url FROM udpxy_servers ORDER BY id ASC`);
    }
    if (!rows) return { ...(fallbackObj || { servers: [], currentId: '' }) };
    const fallbackList = Array.isArray(fallbackObj && fallbackObj.servers) ? fallbackObj.servers : [];
    const nameMap = new Map();
    for (const it of fallbackList) {
        const id = String(it && it.id ? it.id : '');
        if (!id) continue;
        nameMap.set(id, String(it && it.name ? it.name : ''));
    }
    return {
        servers: rows.map((r) => {
            const id = String(r && r.id ? r.id : '');
            const addr = String(r && r.url ? r.url : '');
            const name = String(r && r.name ? r.name : '') || nameMap.get(id) || '';
            return { id, name, addr, url: addr };
        }).filter((x) => x.url),
        currentId: (fallbackObj && fallbackObj.currentId) || ''
    };
}

async function loadGroupTitlesFallback(fallbackObj = { titles: [] }) {
    const rows = await queryRows(`SELECT name, color FROM group_titles ORDER BY id ASC`);
    if (!rows) return { ...(fallbackObj || { titles: [] }) };
    return { titles: rows.map((r) => ({ name: r.name || '', color: r.color || '' })).filter((x) => x.name) };
}

async function loadGroupRulesFallback(fallbackObj = { rules: [] }) {
    const rows = await queryRows(`SELECT name, matchers_json FROM group_rules ORDER BY id ASC`);
    if (!rows) return { ...(fallbackObj || { rules: [] }) };
    return {
        rules: rows.map((r) => ({
            name: r.name || '',
            matchers: (() => {
                try {
                    const arr = JSON.parse(String(r.matchers_json || '[]'));
                    return Array.isArray(arr) ? arr : [];
                } catch (e) {
                    return [];
                }
            })()
        })).filter((x) => x.name)
    };
}

async function loadProxyServersFallback(fallbackObj = { list: [] }) {
    const rows = await queryRows(`SELECT type, url FROM proxy_servers ORDER BY id ASC`);
    if (!rows) return { ...(fallbackObj || { list: [] }) };
    return { list: rows.map((r) => ({ type: r.type || '', url: r.url || '' })).filter((x) => x.url) };
}

async function loadEpgSourcesFallback(fallbackObj = { sources: [] }) {
    const rows = await queryRows(`SELECT id, name, url, scope FROM epg_sources ORDER BY id ASC`);
    if (!rows) return { ...(fallbackObj || { sources: [] }) };
    return {
        sources: rows.map((r) => ({
            id: r.id || '',
            name: r.name || '未命名EPG',
            url: r.url || '',
            scope: r.scope || '内网EPG'
        })).filter((x) => x.url)
    };
}

async function loadLogoTemplatesFallback(fallbackObj = { templates: [], currentId: '' }) {
    const rows = await queryRows(`SELECT id, name, url, category FROM logo_templates ORDER BY id ASC`);
    if (!rows) return { ...(fallbackObj || { templates: [], currentId: '' }) };
    return {
        templates: rows.map((r) => ({
            id: r.id || '',
            name: r.name || '未命名模板',
            url: r.url || '',
            category: r.category || '内网台标'
        })).filter((x) => x.url),
        currentId: (fallbackObj && fallbackObj.currentId) || ''
    };
}

async function loadUsersFallback(fallbackObj = { username: 'admin', passwordHash: '' }) {
    const rows = await queryRows(`SELECT username, password_hash FROM users LIMIT 1`);
    if (!rows || !rows[0]) return { ...(fallbackObj || { username: 'admin', passwordHash: '' }) };
    const row = rows[0] || {};
    return {
        username: String(row.username || (fallbackObj && fallbackObj.username) || 'admin'),
        passwordHash: String(row.password_hash || (fallbackObj && fallbackObj.passwordHash) || '')
    };
}

function countArray(v) {
    return Array.isArray(v) ? v.length : 0;
}

async function reconcileConfigWithMemory(memoryConfigs = {}) {
    const epgMem = memoryConfigs.epgSources || { sources: [] };
    const proxyMem = memoryConfigs.proxyServers || { list: [] };
    const fccMem = memoryConfigs.fccServers || { servers: [] };
    const udpxyMem = memoryConfigs.udpxyServers || { servers: [] };
    const groupTitlesMem = memoryConfigs.groupTitles || { titles: [] };
    const groupRulesMem = memoryConfigs.groupRules || { rules: [] };
    const logoMem = memoryConfigs.logoTemplates || { templates: [] };

    const rows = {
        epg: await queryRowsForce(`SELECT COUNT(1) AS c FROM epg_sources`),
        proxy: await queryRowsForce(`SELECT COUNT(1) AS c FROM proxy_servers`),
        fcc: await queryRowsForce(`SELECT COUNT(1) AS c FROM fcc_servers`),
        udpxy: await queryRowsForce(`SELECT COUNT(1) AS c FROM udpxy_servers`),
        groupTitles: await queryRowsForce(`SELECT COUNT(1) AS c FROM group_titles`),
        groupRules: await queryRowsForce(`SELECT COUNT(1) AS c FROM group_rules`),
        logo: await queryRowsForce(`SELECT COUNT(1) AS c FROM logo_templates`)
    };

    const safeCount = (arr) => (Array.isArray(arr) && arr[0] ? Number(arr[0].c || 0) : 0);
    const sqlite = {
        epg: safeCount(rows.epg),
        proxy: safeCount(rows.proxy),
        fcc: safeCount(rows.fcc),
        udpxy: safeCount(rows.udpxy),
        groupTitles: safeCount(rows.groupTitles),
        groupRules: safeCount(rows.groupRules),
        logo: safeCount(rows.logo)
    };
    const memory = {
        epg: countArray(epgMem.sources),
        proxy: countArray(proxyMem.list),
        fcc: countArray(fccMem.servers),
        udpxy: countArray(udpxyMem.servers),
        groupTitles: countArray(groupTitlesMem.titles),
        groupRules: countArray(groupRulesMem.rules),
        logo: countArray(logoMem.templates)
    };
    return {
        ok: true,
        sameEpg: sqlite.epg === memory.epg,
        sameProxy: sqlite.proxy === memory.proxy,
        sameFcc: sqlite.fcc === memory.fcc,
        sameUdpxy: sqlite.udpxy === memory.udpxy,
        sameGroupTitles: sqlite.groupTitles === memory.groupTitles,
        sameGroupRules: sqlite.groupRules === memory.groupRules,
        sameLogo: sqlite.logo === memory.logo,
        sqlite,
        memory
    };
}

async function resetSharedDb() {
    if (sharedDb) {
        await closeDb(sharedDb);
        sharedDb = null;
    }
    openingPromise = null;
}

module.exports = {
    loadAppSettingsFallback,
    loadFccServersFallback,
    loadUdpxyServersFallback,
    loadGroupTitlesFallback,
    loadGroupRulesFallback,
    loadProxyServersFallback,
    loadEpgSourcesFallback,
    loadLogoTemplatesFallback,
    loadUsersFallback,
    reconcileConfigWithMemory,
    resetSharedDb
};
