const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3');
const logger = require('../core/logger');

class SqliteStorage {
    constructor() {
        this.dataDir = path.join(__dirname, '../../data');
        this.dbFile = path.join(this.dataDir, 'channel_sentinel.db');
        this.db = null;
        this.initPromise = null;
        this.fccNameColumnReady = false;
        this.udpxyNameColumnReady = false;
        this.streamQueue = [];
        this.configQueue = [];
        this.draining = false;
        this.lastDrainDomain = 'config';
        this.metrics = {
            enqueued: 0,
            completed: 0,
            failed: 0,
            streamEnqueued: 0,
            configEnqueued: 0,
            streamCompleted: 0,
            configCompleted: 0,
            streamFailed: 0,
            configFailed: 0,
            totalWaitMs: 0,
            totalExecMs: 0,
            lastError: '',
            lastErrorAt: '',
            lastJobAt: '',
            maxStreamQueueDepth: 0,
            maxConfigQueueDepth: 0
        };
    }

    init(seedConfigs = null) {
        if (this.initPromise) return this.initPromise;
        this.initPromise = this.initDb(seedConfigs).catch((e) => {
            logger.error(`SQLite初始化失败: ${e.message}`, 'Storage');
            throw e;
        });
        return this.initPromise;
    }

    async initDb(seedConfigs = null) {
        if (!fs.existsSync(this.dataDir)) {
            fs.mkdirSync(this.dataDir, { recursive: true });
        }
        try {
            await this.openDatabase();
            await this.applyPragmas();
            await this.createTables();
            await this.recoverConfigTablesFromBackupIfNeeded();
            if (seedConfigs) {
                const shouldSeed = await this.shouldSeedFromConfigs(seedConfigs);
                if (shouldSeed) {
                    logger.warn('检测到空库，使用内存配置执行一次性种子同步', 'Storage');
                    await this.syncAll(seedConfigs);
                } else {
                    logger.info('检测到SQLite已有数据，跳过内存种子同步', 'Storage');
                }
            }
            logger.info(`SQLite初始化完成: ${this.dbFile}`, 'Storage');
        } catch (e) {
            if (!this.isCorruptionError(e)) throw e;
            logger.error(`检测到SQLite结构损坏，开始自动重建: ${e.message}`, 'Storage');
            await this.rebuildCorruptedDatabase(seedConfigs);
            logger.info(`SQLite重建完成: ${this.dbFile}`, 'Storage');
        }
    }

    async openDatabase() {
        await new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(this.dbFile, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    async applyPragmas() {
        await this.run('PRAGMA journal_mode=WAL;');
        await this.run('PRAGMA synchronous=NORMAL;');
        await this.run('PRAGMA busy_timeout=5000;');
        await this.run('PRAGMA temp_store=MEMORY;');
        await this.run('PRAGMA foreign_keys=ON;');
        await this.run('PRAGMA cache_size=-20000;');
    }

    async ensureFccNameColumn() {
        if (this.fccNameColumnReady) return;
        try {
            await this.run(`ALTER TABLE fcc_servers ADD COLUMN name TEXT DEFAULT '';`);
            logger.info('fcc_servers已补齐name列', 'Storage');
            this.fccNameColumnReady = true;
        } catch (e) {
            const msg = String(e && e.message ? e.message : e).toLowerCase();
            if (msg.includes('duplicate column name')) {
                this.fccNameColumnReady = true;
                return;
            }
            logger.warn(`fcc_servers补齐name列失败: ${e.message}`, 'Storage');
        }
    }

    async ensureUdpxyNameColumn() {
        if (this.udpxyNameColumnReady) return;
        try {
            await this.run(`ALTER TABLE udpxy_servers ADD COLUMN name TEXT DEFAULT '';`);
            logger.info('udpxy_servers已补齐name列', 'Storage');
            this.udpxyNameColumnReady = true;
        } catch (e) {
            const msg = String(e && e.message ? e.message : e).toLowerCase();
            if (msg.includes('duplicate column name')) {
                this.udpxyNameColumnReady = true;
                return;
            }
            logger.warn(`udpxy_servers补齐name列失败: ${e.message}`, 'Storage');
        }
    }

    isCorruptionError(error) {
        const msg = String(error && error.message ? error.message : error).toLowerCase();
        return msg.includes('sqlite_corrupt')
            || msg.includes('malformed database schema')
            || msg.includes('database disk image is malformed');
    }

    async rebuildCorruptedDatabase(seedConfigs = null) {
        await this.safeCloseCurrentDb();
        const stamp = this.buildStamp(new Date());
        const backupBase = path.join(this.dataDir, `channel_sentinel-corrupt-${stamp}`);
        this.archiveIfExists(this.dbFile, `${backupBase}.db`);
        this.archiveIfExists(`${this.dbFile}-wal`, `${backupBase}.db-wal`);
        this.archiveIfExists(`${this.dbFile}-shm`, `${backupBase}.db-shm`);
        await this.openDatabase();
        await this.applyPragmas();
        await this.createTables();
        if (seedConfigs) {
            await this.syncAll(seedConfigs);
        }
    }

    async safeCloseCurrentDb() {
        if (!this.db) return;
        const dbRef = this.db;
        await new Promise((resolve) => {
            dbRef.close(() => resolve());
        });
        this.db = null;
    }

    archiveIfExists(src, dest) {
        if (!fs.existsSync(src)) return;
        try {
            fs.renameSync(src, dest);
        } catch (_e) {
            fs.copyFileSync(src, dest);
            fs.unlinkSync(src);
        }
    }

    buildStamp(now) {
        const d = now instanceof Date ? now : new Date();
        const p = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
    }

    run(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function onRun(err) {
                if (err) reject(err);
                else resolve(this);
            });
        });
    }

    get(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err, row) => {
                if (err) reject(err);
                else resolve(row || null);
            });
        });
    }

    dbGet(db, sql, params = []) {
        return new Promise((resolve, reject) => {
            db.get(sql, params, (err, row) => {
                if (err) reject(err);
                else resolve(row || null);
            });
        });
    }

    dbAll(db, sql, params = []) {
        return new Promise((resolve, reject) => {
            db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(Array.isArray(rows) ? rows : []);
            });
        });
    }

    async dbTableColumns(db, tableName) {
        const rows = await this.dbAll(db, `PRAGMA table_info(${tableName})`);
        const set = new Set();
        for (const r of rows) {
            const n = String(r && r.name ? r.name : '');
            if (n) set.add(n);
        }
        return set;
    }

    openDbReadOnly(filePath) {
        return new Promise((resolve, reject) => {
            const db = new sqlite3.Database(filePath, sqlite3.OPEN_READONLY, (err) => {
                if (err) reject(err);
                else resolve(db);
            });
        });
    }

    closeDb(db) {
        return new Promise((resolve) => {
            db.close(() => resolve());
        });
    }

    async tableCount(tableName) {
        const row = await this.get(`SELECT COUNT(1) AS c FROM ${tableName}`);
        return Number(row && row.c ? row.c : 0);
    }

    seedArrayCount(v) {
        return Array.isArray(v) ? v.length : 0;
    }

    hasSeedPayloadData(seedConfigs = {}) {
        const s = seedConfigs && typeof seedConfigs === 'object' ? seedConfigs : {};
        const streamsCount = this.seedArrayCount(s.streams && s.streams.streams);
        const fccCount = this.seedArrayCount(s.fccServers && s.fccServers.servers);
        const udpxyCount = this.seedArrayCount(s.udpxyServers && s.udpxyServers.servers);
        const groupTitlesCount = this.seedArrayCount(s.groupTitles && s.groupTitles.titles);
        const groupRulesCount = this.seedArrayCount(s.groupRules && s.groupRules.rules);
        const epgCount = this.seedArrayCount(s.epgSources && s.epgSources.sources);
        const logoCount = this.seedArrayCount(s.logoTemplates && s.logoTemplates.templates);
        const proxyCount = this.seedArrayCount(s.proxyServers && s.proxyServers.list);
        const appSettingsCount = Object.keys((s.appSettings && typeof s.appSettings === 'object') ? s.appSettings : {}).length;
        const usersCount = Object.keys((s.users && typeof s.users === 'object') ? s.users : {}).length;
        return streamsCount > 0 || fccCount > 0 || udpxyCount > 0 || groupTitlesCount > 0 || groupRulesCount > 0 || epgCount > 0 || logoCount > 0 || proxyCount > 0 || appSettingsCount > 0 || usersCount > 0;
    }

    async shouldSeedFromConfigs(seedConfigs = {}) {
        if (!this.hasSeedPayloadData(seedConfigs)) return false;
        const targets = ['streams', 'udpxy_servers', 'fcc_servers', 'group_titles', 'group_rules', 'epg_sources', 'logo_templates', 'proxy_servers', 'app_settings', 'users'];
        for (const t of targets) {
            const c = await this.tableCount(t);
            if (c > 0) return false;
        }
        return true;
    }

    async inspectBackupCounts(filePath, tables) {
        let db = null;
        try {
            db = await this.openDbReadOnly(filePath);
            const counts = {};
            let total = 0;
            for (const t of tables) {
                const row = await this.dbGet(db, `SELECT COUNT(1) AS c FROM ${t.table}`);
                const c = Number(row && row.c ? row.c : 0);
                counts[t.table] = c;
                total += c;
            }
            return { ok: true, counts, total };
        } catch (_e) {
            return { ok: false, counts: {}, total: 0 };
        } finally {
            if (db) await this.closeDb(db);
        }
    }

    findSqliteBackups() {
        const entries = fs.readdirSync(this.dataDir)
            .filter((f) => /^channel_sentinel(-\d{8}-\d{6}|\.pre-restore-\d{8}-\d{6})\.db$/.test(f))
            .map((f) => {
                const p = path.join(this.dataDir, f);
                let mtime = 0;
                try {
                    mtime = Number(fs.statSync(p).mtimeMs || 0);
                } catch (_e) {}
                return { file: f, fullPath: p, mtime };
            })
            .sort((a, b) => b.mtime - a.mtime);
        return entries;
    }

    async recoverConfigTablesFromBackupIfNeeded() {
        const targets = [
            { table: 'udpxy_servers', columns: ['id', 'name', 'url'] },
            { table: 'fcc_servers', columns: ['id', 'name', 'url'] },
            { table: 'group_titles', columns: ['name', 'color'] },
            { table: 'logo_templates', columns: ['id', 'name', 'url', 'category'] },
            { table: 'epg_sources', columns: ['id', 'name', 'url', 'scope'] },
            { table: 'group_rules', columns: ['name', 'matchers_json'] },
            { table: 'proxy_servers', columns: ['type', 'url'] }
        ];
        const streamCount = await this.tableCount('streams');
        if (streamCount <= 0) return;
        const currentCounts = {};
        let totalCurrent = 0;
        for (const t of targets) {
            const c = await this.tableCount(t.table);
            currentCounts[t.table] = c;
            totalCurrent += c;
        }
        if (totalCurrent > 0) return;
        const backups = this.findSqliteBackups();
        if (!backups.length) {
            logger.warn('检测到配置表为空但未找到可恢复SQLite备份', 'Storage', { streamCount });
            return;
        }
        let chosen = null;
        let chosenCounts = null;
        for (const b of backups) {
            const inspected = await this.inspectBackupCounts(b.fullPath, targets);
            if (!inspected.ok || inspected.total <= 0) continue;
            chosen = b;
            chosenCounts = inspected.counts;
            break;
        }
        if (!chosen || !chosenCounts) {
            logger.warn('检测到配置表为空但备份中无可恢复配置数据', 'Storage', { streamCount });
            return;
        }
        let srcDb = null;
        const restored = {};
        try {
            srcDb = await this.openDbReadOnly(chosen.fullPath);
            for (const t of targets) {
                const current = Number(currentCounts[t.table] || 0);
                const backupCount = Number(chosenCounts[t.table] || 0);
                if (current > 0 || backupCount <= 0) continue;
                const srcColumnsSet = await this.dbTableColumns(srcDb, t.table);
                const srcColumns = t.columns.filter((c) => srcColumnsSet.has(c));
                if (srcColumns.length <= 0) continue;
                const rows = await this.dbAll(srcDb, `SELECT ${srcColumns.join(', ')} FROM ${t.table}`);
                const normalized = rows.map((r) => {
                    const o = {};
                    for (const c of t.columns) {
                        o[c] = srcColumnsSet.has(c) && r && r[c] != null ? r[c] : '';
                    }
                    return o;
                });
                await this.replaceSimpleList(t.table, normalized, t.columns);
                restored[t.table] = normalized.length;
            }
            logger.warn('已从备份自动恢复空配置表', 'Storage', { backup: chosen.file, restored });
        } catch (e) {
            logger.error(`自动恢复配置表失败: ${e.message}`, 'Storage');
        } finally {
            if (srcDb) await this.closeDb(srcDb);
        }
    }

    stmtRun(stmt, params = []) {
        return new Promise((resolve, reject) => {
            stmt.run(params, (err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    stmtFinalize(stmt) {
        return new Promise((resolve, reject) => {
            stmt.finalize((err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }

    async createTables() {
        await this.run(`
            CREATE TABLE IF NOT EXISTS streams (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                udpxy_url TEXT,
                multicast_url TEXT NOT NULL,
                name TEXT,
                tvg_id TEXT,
                tvg_name TEXT,
                logo TEXT,
                group_title TEXT,
                catchup_format TEXT,
                catchup_base TEXT,
                m3u_catchup TEXT,
                m3u_catchup_source TEXT,
                http_param TEXT,
                is_available INTEGER DEFAULT 0,
                last_checked TEXT,
                frame_rate TEXT,
                bit_rate TEXT,
                speed TEXT,
                resolution TEXT,
                codec TEXT,
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(udpxy_url, multicast_url)
            );
        `);
        await this.run(`CREATE INDEX IF NOT EXISTS idx_streams_multicast_url ON streams(multicast_url);`);
        await this.run(`CREATE INDEX IF NOT EXISTS idx_streams_status_group ON streams(is_available, group_title);`);
        await this.run(`CREATE INDEX IF NOT EXISTS idx_streams_updated_at ON streams(updated_at);`);
        await this.run(`CREATE INDEX IF NOT EXISTS idx_streams_group_title ON streams(group_title);`);
        await this.run(`CREATE INDEX IF NOT EXISTS idx_streams_name ON streams(name);`);
        await this.run(`
            CREATE TABLE IF NOT EXISTS app_settings (
                key TEXT PRIMARY KEY,
                value TEXT
            );
        `);
        await this.run(`
            CREATE TABLE IF NOT EXISTS udpxy_servers (
                id TEXT PRIMARY KEY,
                url TEXT
            );
        `);
        await this.ensureUdpxyNameColumn();
        await this.run(`
            CREATE TABLE IF NOT EXISTS fcc_servers (
                id TEXT PRIMARY KEY,
                url TEXT
            );
        `);
        await this.ensureFccNameColumn();
        await this.run(`
            CREATE TABLE IF NOT EXISTS proxy_servers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                type TEXT,
                url TEXT
            );
        `);
        await this.run(`CREATE INDEX IF NOT EXISTS idx_proxy_servers_type ON proxy_servers(type);`);
        await this.run(`
            CREATE TABLE IF NOT EXISTS epg_sources (
                id TEXT PRIMARY KEY,
                name TEXT,
                url TEXT,
                scope TEXT
            );
        `);
        await this.run(`CREATE INDEX IF NOT EXISTS idx_epg_sources_scope ON epg_sources(scope);`);
        await this.run(`
            CREATE TABLE IF NOT EXISTS logo_templates (
                id TEXT PRIMARY KEY,
                name TEXT,
                url TEXT,
                category TEXT
            );
        `);
        await this.run(`CREATE INDEX IF NOT EXISTS idx_logo_templates_category ON logo_templates(category);`);
        await this.run(`
            CREATE TABLE IF NOT EXISTS group_titles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT,
                color TEXT
            );
        `);
        await this.run(`
            CREATE TABLE IF NOT EXISTS group_rules (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT,
                matchers_json TEXT
            );
        `);
        await this.run(`
            CREATE TABLE IF NOT EXISTS users (
                username TEXT PRIMARY KEY,
                password_hash TEXT
            );
        `);
        await this.run(`
            CREATE TABLE IF NOT EXISTS snapshots (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                filename TEXT,
                source TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
        `);
    }

    async close() {
        if (!this.db) {
            this.initPromise = null;
            this.streamQueue = [];
            this.configQueue = [];
            this.draining = false;
            this.lastDrainDomain = 'config';
            return;
        }
        const dbRef = this.db;
        await new Promise((resolve, reject) => {
            dbRef.close((err) => {
                if (err) reject(err);
                else resolve();
            });
        });
        this.db = null;
        this.initPromise = null;
        this.streamQueue = [];
        this.configQueue = [];
        this.draining = false;
        this.lastDrainDomain = 'config';
    }

    snapshotMetrics() {
        const m = this.metrics || {};
        const completed = Number(m.completed || 0);
        const failed = Number(m.failed || 0);
        const done = Math.max(1, completed + failed);
        return {
            enqueued: Number(m.enqueued || 0),
            completed,
            failed,
            streamEnqueued: Number(m.streamEnqueued || 0),
            configEnqueued: Number(m.configEnqueued || 0),
            streamCompleted: Number(m.streamCompleted || 0),
            configCompleted: Number(m.configCompleted || 0),
            streamFailed: Number(m.streamFailed || 0),
            configFailed: Number(m.configFailed || 0),
            avgWaitMs: Number(m.totalWaitMs || 0) / done,
            avgExecMs: Number(m.totalExecMs || 0) / done,
            lastError: String(m.lastError || ''),
            lastErrorAt: String(m.lastErrorAt || ''),
            lastJobAt: String(m.lastJobAt || ''),
            maxStreamQueueDepth: Number(m.maxStreamQueueDepth || 0),
            maxConfigQueueDepth: Number(m.maxConfigQueueDepth || 0),
            currentStreamQueueDepth: this.streamQueue.length,
            currentConfigQueueDepth: this.configQueue.length,
            draining: !!this.draining
        };
    }

    checkpoint() {
        return this.enqueue(async () => {
            await this.run('PRAGMA wal_checkpoint(FULL);');
        }, 'config');
    }

    pickNextJob() {
        const hasStream = this.streamQueue.length > 0;
        const hasConfig = this.configQueue.length > 0;
        if (!hasStream && !hasConfig) return null;
        if (hasStream && !hasConfig) return this.streamQueue.shift();
        if (!hasStream && hasConfig) return this.configQueue.shift();
        if (this.lastDrainDomain === 'streams') return this.configQueue.shift();
        return this.streamQueue.shift();
    }

    async drainQueues() {
        if (this.draining) return;
        this.draining = true;
        try {
            while (true) {
                const job = this.pickNextJob();
                if (!job) break;
                const { task, resolve, domain, enqueuedAt } = job;
                const startedAt = Date.now();
                this.metrics.totalWaitMs += Math.max(0, startedAt - Number(enqueuedAt || startedAt));
                try {
                    await this.init();
                    await task();
                    this.metrics.completed++;
                    if (domain === 'streams') this.metrics.streamCompleted++;
                    else this.metrics.configCompleted++;
                } catch (e) {
                    this.metrics.failed++;
                    if (domain === 'streams') this.metrics.streamFailed++;
                    else this.metrics.configFailed++;
                    this.metrics.lastError = String(e && e.message ? e.message : e);
                    this.metrics.lastErrorAt = new Date().toISOString();
                    logger.error(`SQLite写入失败: ${e.message}`, 'Storage', {
                        domain: domain || 'config',
                        streamQueueDepth: this.streamQueue.length,
                        configQueueDepth: this.configQueue.length
                    });
                } finally {
                    this.metrics.totalExecMs += Math.max(0, Date.now() - startedAt);
                    this.metrics.lastJobAt = new Date().toISOString();
                    this.lastDrainDomain = domain || this.lastDrainDomain;
                    resolve();
                }
            }
        } finally {
            this.draining = false;
            if (this.streamQueue.length > 0 || this.configQueue.length > 0) {
                this.drainQueues();
            }
        }
    }

    enqueue(task, domain = 'config') {
        return new Promise((resolve) => {
            const job = { task, resolve, domain, enqueuedAt: Date.now() };
            this.metrics.enqueued++;
            if (domain === 'streams') {
                this.metrics.streamEnqueued++;
                this.streamQueue.push(job);
                this.metrics.maxStreamQueueDepth = Math.max(this.metrics.maxStreamQueueDepth, this.streamQueue.length);
            } else {
                this.metrics.configEnqueued++;
                this.configQueue.push(job);
                this.metrics.maxConfigQueueDepth = Math.max(this.metrics.maxConfigQueueDepth, this.configQueue.length);
            }
            this.drainQueues();
        });
    }

    syncAll(configs) {
        if (!configs || typeof configs !== 'object') return Promise.resolve();
        return (async () => {
            await this.syncConfigNow('streams', configs.streams || { streams: [] });
            await this.syncConfigNow('appSettings', configs.appSettings || {});
            await this.syncConfigNow('logoTemplates', configs.logoTemplates || { templates: [] });
            await this.syncConfigNow('fccServers', configs.fccServers || { servers: [] });
            await this.syncConfigNow('udpxyServers', configs.udpxyServers || { servers: [] });
            await this.syncConfigNow('groupTitles', configs.groupTitles || { titles: [] });
            await this.syncConfigNow('groupRules', configs.groupRules || { rules: [] });
            await this.syncConfigNow('epgSources', configs.epgSources || { sources: [] });
            await this.syncConfigNow('proxyServers', configs.proxyServers || { list: [] });
            await this.syncConfigNow('users', configs.users || {});
        })();
    }

    syncConfig(configName, payload) {
        const domain = String(configName || '') === 'streams' ? 'streams' : 'config';
        return this.enqueue(() => this.syncConfigNow(configName, payload), domain);
    }

    syncByFile(fileName, payload) {
        const map = {
            'streams.json': 'streams',
            'app_settings.json': 'appSettings',
            'logo_templates.json': 'logoTemplates',
            'fcc_servers.json': 'fccServers',
            'udpxy_servers.json': 'udpxyServers',
            'group_titles.json': 'groupTitles',
            'group_rules.json': 'groupRules',
            'epg_sources.json': 'epgSources',
            'proxy_servers.json': 'proxyServers',
            'users.json': 'users'
        };
        const configName = map[String(fileName || '').toLowerCase()];
        if (!configName) return Promise.resolve();
        return this.syncConfig(configName, payload);
    }

    recordSnapshot(filename, source = 'streams') {
        if (!filename) return;
        this.enqueue(async () => {
            await this.run(`INSERT INTO snapshots(filename, source) VALUES(?, ?)`, [filename, source]);
        }, 'config');
    }

    syncStreamsUpsert(streamOrList) {
        const list = Array.isArray(streamOrList) ? streamOrList : [streamOrList];
        return this.enqueue(() => this.upsertStreamsNow(list), 'streams');
    }

    syncStreamsDeleteByIdentity(streamOrList) {
        const list = Array.isArray(streamOrList) ? streamOrList : [streamOrList];
        return this.enqueue(() => this.deleteStreamsByIdentityNow(list), 'streams');
    }

    clearStreams() {
        return this.enqueue(() => this.run('DELETE FROM streams;'), 'streams');
    }

    toStreamRow(s) {
        const now = new Date().toISOString();
        return [
            String(s && s.udpxyUrl ? s.udpxyUrl : ''),
            String(s && s.multicastUrl ? s.multicastUrl : ''),
            String(s && s.name ? s.name : ''),
            String(s && s.tvgId ? s.tvgId : ''),
            String(s && s.tvgName ? s.tvgName : ''),
            String(s && s.logo ? s.logo : ''),
            String(s && s.groupTitle ? s.groupTitle : ''),
            String(s && s.catchupFormat ? s.catchupFormat : ''),
            String(s && s.catchupBase ? s.catchupBase : ''),
            String(s && s.m3uCatchup ? s.m3uCatchup : ''),
            String(s && s.m3uCatchupSource ? s.m3uCatchupSource : ''),
            String(s && s.httpParam ? s.httpParam : ''),
            s && s.isAvailable ? 1 : 0,
            String(s && s.lastChecked ? s.lastChecked : ''),
            s && s.frameRate != null ? String(s.frameRate) : '',
            s && s.bitRate != null ? String(s.bitRate) : '',
            s && s.speed != null ? String(s.speed) : '',
            String(s && s.resolution ? s.resolution : ''),
            String(s && s.codec ? s.codec : ''),
            now
        ];
    }

    streamIdentity(s) {
        return `${String(s && s.udpxyUrl ? s.udpxyUrl : '').trim()}||${String(s && s.multicastUrl ? s.multicastUrl : '').trim()}`;
    }

    async upsertStreamsNow(list) {
        const map = new Map();
        const input = Array.isArray(list) ? list : [];
        for (const s of input) {
            if (!s || !s.multicastUrl) continue;
            map.set(this.streamIdentity(s), s);
        }
        const rows = Array.from(map.values());
        if (!rows.length) return;
        await this.run('BEGIN TRANSACTION;');
        try {
            const stmt = this.db.prepare(`
                INSERT INTO streams(
                    udpxy_url, multicast_url, name, tvg_id, tvg_name, logo, group_title,
                    catchup_format, catchup_base, m3u_catchup, m3u_catchup_source, http_param,
                    is_available, last_checked, frame_rate, bit_rate, speed, resolution, codec, updated_at
                ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(udpxy_url, multicast_url) DO UPDATE SET
                    name=excluded.name,
                    tvg_id=excluded.tvg_id,
                    tvg_name=excluded.tvg_name,
                    logo=excluded.logo,
                    group_title=excluded.group_title,
                    catchup_format=excluded.catchup_format,
                    catchup_base=excluded.catchup_base,
                    m3u_catchup=excluded.m3u_catchup,
                    m3u_catchup_source=excluded.m3u_catchup_source,
                    http_param=excluded.http_param,
                    is_available=excluded.is_available,
                    last_checked=excluded.last_checked,
                    frame_rate=excluded.frame_rate,
                    bit_rate=excluded.bit_rate,
                    speed=excluded.speed,
                    resolution=excluded.resolution,
                    codec=excluded.codec,
                    updated_at=excluded.updated_at
            `);
            for (const s of rows) {
                await this.stmtRun(stmt, this.toStreamRow(s));
            }
            await this.stmtFinalize(stmt);
            await this.run('COMMIT;');
        } catch (e) {
            await this.run('ROLLBACK;');
            throw e;
        }
    }

    async deleteStreamsByIdentityNow(list) {
        const map = new Map();
        const input = Array.isArray(list) ? list : [];
        for (const s of input) {
            if (!s || !s.multicastUrl) continue;
            map.set(this.streamIdentity(s), s);
        }
        const ids = Array.from(map.values());
        if (!ids.length) return;
        await this.run('BEGIN TRANSACTION;');
        try {
            const stmt = this.db.prepare(`DELETE FROM streams WHERE udpxy_url = ? AND multicast_url = ?`);
            for (const s of ids) {
                const udpxy = String(s && s.udpxyUrl ? s.udpxyUrl : '');
                const multicast = String(s && s.multicastUrl ? s.multicastUrl : '');
                if (!multicast) continue;
                await this.stmtRun(stmt, [udpxy, multicast]);
            }
            await this.stmtFinalize(stmt);
            await this.run('COMMIT;');
        } catch (e) {
            await this.run('ROLLBACK;');
            throw e;
        }
    }

    async syncConfigNow(configName, payload) {
        if (configName === 'streams') {
            const list = Array.isArray(payload && payload.streams) ? payload.streams : [];
            await this.run('BEGIN TRANSACTION;');
            try {
                await this.run('DELETE FROM streams;');
                const stmt = this.db.prepare(`
                    INSERT INTO streams(
                        udpxy_url, multicast_url, name, tvg_id, tvg_name, logo, group_title,
                        catchup_format, catchup_base, m3u_catchup, m3u_catchup_source, http_param,
                        is_available, last_checked, frame_rate, bit_rate, speed, resolution, codec, updated_at
                    ) VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `);
                for (const s of list) {
                    await this.stmtRun(stmt, this.toStreamRow(s));
                }
                await this.stmtFinalize(stmt);
                await this.run('COMMIT;');
            } catch (e) {
                await this.run('ROLLBACK;');
                throw e;
            }
            return;
        }
        if (configName === 'appSettings') {
            const obj = payload && typeof payload === 'object' ? payload : {};
            await this.run('BEGIN TRANSACTION;');
            try {
                await this.run('DELETE FROM app_settings;');
                const stmt = this.db.prepare(`INSERT INTO app_settings(key, value) VALUES(?, ?)`);
                for (const [k, v] of Object.entries(obj)) {
                    await this.stmtRun(stmt, [k, typeof v === 'string' ? v : JSON.stringify(v)]);
                }
                await this.stmtFinalize(stmt);
                await this.run('COMMIT;');
            } catch (e) {
                await this.run('ROLLBACK;');
                throw e;
            }
            return;
        }
        if (configName === 'logoTemplates') {
            const templates = Array.isArray(payload && payload.templates) ? payload.templates : [];
            await this.replaceSimpleList('logo_templates', templates.map((x) => ({
                id: x && x.id ? x.id : '',
                name: x && x.name ? x.name : '',
                url: x && x.url ? x.url : '',
                category: x && x.category ? x.category : ''
            })), ['id', 'name', 'url', 'category']);
            return;
        }
        if (configName === 'epgSources') {
            const sources = Array.isArray(payload && payload.sources) ? payload.sources : [];
            await this.replaceSimpleList('epg_sources', sources.map((x) => ({
                id: x && x.id ? x.id : '',
                name: x && x.name ? x.name : '',
                url: x && x.url ? x.url : '',
                scope: x && x.scope ? x.scope : ''
            })), ['id', 'name', 'url', 'scope']);
            return;
        }
        if (configName === 'udpxyServers') {
            await this.ensureUdpxyNameColumn();
            const list = Array.isArray(payload && payload.servers) ? payload.servers : [];
            const emptyNameCount = list.reduce((n, x) => n + (String(x && x.name ? x.name : '').trim() ? 0 : 1), 0);
            logger.info('开始同步udpxyServers到SQLite', 'Storage', { total: list.length, emptyNameCount });
            await this.replaceSimpleList('udpxy_servers', list.map((x) => ({
                id: x && x.id ? x.id : '',
                name: x && x.name ? x.name : '',
                url: x && (x.url || x.addr) ? (x.url || x.addr) : ''
            })), ['id', 'name', 'url']);
            logger.info('完成同步udpxyServers到SQLite', 'Storage', { total: list.length, emptyNameCount });
            return;
        }
        if (configName === 'fccServers') {
            await this.ensureFccNameColumn();
            const list = Array.isArray(payload && payload.servers) ? payload.servers : [];
            const emptyNameCount = list.reduce((n, x) => n + (String(x && x.name ? x.name : '').trim() ? 0 : 1), 0);
            logger.info('开始同步fccServers到SQLite', 'Storage', { total: list.length, emptyNameCount });
            await this.replaceSimpleList('fcc_servers', list.map((x) => ({
                id: x && x.id ? x.id : '',
                name: x && x.name ? x.name : '',
                url: x && (x.url || x.addr) ? (x.url || x.addr) : ''
            })), ['id', 'name', 'url']);
            logger.info('完成同步fccServers到SQLite', 'Storage', { total: list.length, emptyNameCount });
            return;
        }
        if (configName === 'proxyServers') {
            const list = Array.isArray(payload && payload.list) ? payload.list : [];
            await this.replaceSimpleList('proxy_servers', list.map((x) => ({
                type: x && x.type ? x.type : '',
                url: x && x.url ? x.url : ''
            })), ['type', 'url']);
            return;
        }
        if (configName === 'groupTitles') {
            const raw = Array.isArray(payload && payload.titles) ? payload.titles : [];
            const list = raw.map((x) => {
                if (typeof x === 'string') return { name: x, color: '' };
                return { name: x && x.name ? x.name : '', color: x && x.color ? x.color : '' };
            }).filter((x) => x.name);
            await this.replaceSimpleList('group_titles', list, ['name', 'color']);
            return;
        }
        if (configName === 'groupRules') {
            const list = Array.isArray(payload && payload.rules) ? payload.rules : [];
            await this.replaceSimpleList('group_rules', list.map((x) => ({
                name: x && x.name ? x.name : '',
                matchers_json: JSON.stringify(Array.isArray(x && x.matchers) ? x.matchers : [])
            })), ['name', 'matchers_json']);
            return;
        }
        if (configName === 'users') {
            const username = String(payload && payload.username ? payload.username : 'admin');
            const passwordHash = String(payload && payload.passwordHash ? payload.passwordHash : '');
            await this.run('BEGIN TRANSACTION;');
            try {
                await this.run('DELETE FROM users;');
                await this.run(`INSERT INTO users(username, password_hash) VALUES(?, ?)`, [username, passwordHash]);
                await this.run('COMMIT;');
            } catch (e) {
                await this.run('ROLLBACK;');
                throw e;
            }
        }
    }

    async replaceSimpleList(table, rows, columns) {
        await this.run('BEGIN TRANSACTION;');
        try {
            await this.run(`DELETE FROM ${table};`);
            if (rows.length > 0) {
                const placeholders = columns.map(() => '?').join(', ');
                const stmt = this.db.prepare(`INSERT INTO ${table}(${columns.join(', ')}) VALUES(${placeholders})`);
                for (const row of rows) {
                    const values = columns.map((c) => String(row[c] == null ? '' : row[c]));
                    await this.stmtRun(stmt, values);
                }
                await this.stmtFinalize(stmt);
            }
            await this.run('COMMIT;');
        } catch (e) {
            await this.run('ROLLBACK;');
            throw e;
        }
    }
}

module.exports = new SqliteStorage();
