const path = require('path');
const crypto = require('crypto');
const sqlite3 = require('sqlite3');
const logger = require('../core/logger');
const storageMode = require('./mode');

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

async function queryRows(sql, params = []) {
    try {
        const db = await getSharedDb();
        return await all(db, sql, params);
    } catch (e) {
        if (sharedDb) {
            try { sharedDb.close(); } catch (_e) {}
            sharedDb = null;
        }
        const db = await getSharedDb();
        return await all(db, sql, params);
    }
}

async function readStreamsFromSqlite() {
    try {
        const rows = await queryRows(`
            SELECT
                udpxy_url, multicast_url, name, tvg_id, tvg_name, logo, group_title,
                catchup_format, catchup_base, m3u_catchup, m3u_catchup_source, http_param,
                is_available, last_checked, frame_rate, bit_rate, speed, resolution, codec
            FROM streams
            ORDER BY id ASC
        `);
        const streams = rows.map(mapStreamRow);
        return streams;
    } catch (e) {
        logger.error(`SQLite读取streams失败: ${e.message}`, 'Storage');
        return null;
    }
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

async function readStreamsPageFromSqlite(page = 1, pageSize = 50) {
    try {
        const p = Math.max(1, Math.floor(Number(page) || 1));
        const ps = Math.max(1, Math.min(500, Math.floor(Number(pageSize) || 50)));
        const offset = (p - 1) * ps;
        const countRows = await queryRows(`SELECT COUNT(1) AS c FROM streams`);
        const total = Number(countRows[0] && countRows[0].c ? countRows[0].c : 0);
        const onlineRows = await queryRows(`SELECT COUNT(1) AS c FROM streams WHERE is_available = 1`);
        const online = Number(onlineRows[0] && onlineRows[0].c ? onlineRows[0].c : 0);
        const rows = await queryRows(`
            SELECT
                udpxy_url, multicast_url, name, tvg_id, tvg_name, logo, group_title,
                catchup_format, catchup_base, m3u_catchup, m3u_catchup_source, http_param,
                is_available, last_checked, frame_rate, bit_rate, speed, resolution, codec
            FROM streams
            ORDER BY id ASC
            LIMIT ? OFFSET ?
        `, [ps, offset]);
        return {
            streams: rows.map(mapStreamRow),
            pagination: {
                page: p,
                pageSize: ps,
                total,
                pages: Math.max(1, Math.ceil(total / ps))
            },
            stats: { total, online, offline: Math.max(0, total - online) }
        };
    } catch (e) {
        logger.error(`SQLite分页读取streams失败: ${e.message}`, 'Storage');
        return null;
    }
}

async function readStreamStatsFromSqlite() {
    try {
        const rows = await queryRows(`
            SELECT
                COUNT(1) AS total,
                SUM(CASE WHEN is_available = 1 THEN 1 ELSE 0 END) AS online
            FROM streams
        `);
        const total = Number(rows[0] && rows[0].total ? rows[0].total : 0);
        const online = Number(rows[0] && rows[0].online ? rows[0].online : 0);
        return { total, online, offline: Math.max(0, total - online) };
    } catch (e) {
        logger.error(`SQLite读取streams统计失败: ${e.message}`, 'Storage');
        return null;
    }
}

function hashStreams(list) {
    const stable = (Array.isArray(list) ? list : []).map((s) => ({
        udpxyUrl: String(s.udpxyUrl || ''),
        multicastUrl: String(s.multicastUrl || ''),
        isAvailable: !!s.isAvailable,
        lastChecked: String(s.lastChecked || ''),
        resolution: String(s.resolution || ''),
        codec: String(s.codec || '')
    }));
    return crypto.createHash('sha1').update(JSON.stringify(stable)).digest('hex');
}

async function reconcileStreamsWithMemory(memoryStreams) {
    const sqliteStreams = await readStreamsFromSqlite();
    if (!sqliteStreams) {
        return { ok: false, message: 'sqlite unavailable' };
    }
    const mem = Array.isArray(memoryStreams) ? memoryStreams : [];
    const memoryOnline = mem.filter((x) => x && x.isAvailable).length;
    const sqliteOnline = sqliteStreams.filter((x) => x && x.isAvailable).length;
    const memoryHash = hashStreams(mem);
    const sqliteHash = hashStreams(sqliteStreams);
    return {
        ok: true,
        sameCount: mem.length === sqliteStreams.length,
        sameOnline: memoryOnline === sqliteOnline,
        sameHash: memoryHash === sqliteHash,
        memory: { count: mem.length, online: memoryOnline, hash: memoryHash },
        sqlite: { count: sqliteStreams.length, online: sqliteOnline, hash: sqliteHash }
    };
}

function shouldReadFromSqlite() {
    const v = String(process.env.READ_FROM || '').trim().toLowerCase();
    if (v === 'sqlite') return true;
    if (v === 'legacy' || v === 'json') return false;
    return storageMode.getStorageMode() === 'sqlite';
}

function getReadMode() {
    return shouldReadFromSqlite() ? 'sqlite' : 'legacy';
}

async function loadStreamsFallback(memoryStreams) {
    if (!shouldReadFromSqlite()) return Array.isArray(memoryStreams) ? memoryStreams : [];
    const sqliteStreams = await readStreamsFromSqlite();
    if (!sqliteStreams) return Array.isArray(memoryStreams) ? memoryStreams : [];
    return sqliteStreams;
}

async function resetSharedDb() {
    if (sharedDb) {
        await closeDb(sharedDb);
        sharedDb = null;
    }
    openingPromise = null;
}

module.exports = {
    loadStreamsFallback,
    readStreamsFromSqlite,
    readStreamsPageFromSqlite,
    readStreamStatsFromSqlite,
    reconcileStreamsWithMemory,
    shouldReadFromSqlite,
    getReadMode,
    resetSharedDb
};
