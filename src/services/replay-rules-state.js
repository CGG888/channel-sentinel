const fs = require('fs');
const path = require('path');

class ReplayRulesStateManager {
    constructor(params = {}) {
        this.baseRulesPath = params.baseRulesPath;
        this.timeRulesPath = params.timeRulesPath;
        this.dataDir = params.dataDir;
        this.backupDir = path.join(this.dataDir, 'rules_backups');
        this.statePath = path.join(this.dataDir, 'replay_rules_state.json');
        this.maxHitLogs = 500;
        this.resetCache = typeof params.resetCache === 'function' ? params.resetCache : (() => {});
    }

    ensureDataDir() {
        if (!fs.existsSync(this.dataDir)) fs.mkdirSync(this.dataDir, { recursive: true });
        if (!fs.existsSync(this.backupDir)) fs.mkdirSync(this.backupDir, { recursive: true });
    }

    safeReadJson(filePath, fallback) {
        try {
            if (!fs.existsSync(filePath)) return fallback;
            return JSON.parse(fs.readFileSync(filePath, 'utf8'));
        } catch (e) {
            return fallback;
        }
    }

    saveJson(filePath, value) {
        this.ensureDataDir();
        fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
    }

    getCurrentVersions() {
        const base = this.safeReadJson(this.baseRulesPath, {});
        const time = this.safeReadJson(this.timeRulesPath, {});
        return {
            baseRulesVersion: String(base && base.meta && base.meta.rules_version || ''),
            timeRulesVersion: String(time && time.meta && time.meta.rules_version || ''),
            baseUpdatedAt: String(base && base.meta && base.meta.updated_at || ''),
            timeUpdatedAt: String(time && time.meta && time.meta.updated_at || '')
        };
    }

    loadState() {
        const fallback = {
            current: null,
            history: [],
            hitLogs: [],
            lastRollback: null,
            selection: {
                base: { mode: 'auto', ruleId: '' },
                time: { mode: 'auto', formatId: '' },
                proxy: { mode: 'path_no_scheme' }
            }
        };
        const state = this.safeReadJson(this.statePath, fallback);
        if (!state || typeof state !== 'object') return fallback;
        if (!Array.isArray(state.history)) state.history = [];
        if (!Array.isArray(state.hitLogs)) state.hitLogs = [];
        if (!state.current || typeof state.current !== 'object') state.current = null;
        if (!state.selection || typeof state.selection !== 'object') state.selection = { ...fallback.selection };
        if (!state.selection.base || typeof state.selection.base !== 'object') state.selection.base = { mode: 'auto', ruleId: '' };
        if (!state.selection.time || typeof state.selection.time !== 'object') state.selection.time = { mode: 'auto', formatId: '' };
        if (!state.selection.proxy || typeof state.selection.proxy !== 'object') state.selection.proxy = { mode: 'path_no_scheme' };
        return state;
    }

    saveState(state) {
        this.saveJson(this.statePath, state);
    }

    buildSnapshotId(versions) {
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        const baseV = String(versions.baseRulesVersion || 'base').replace(/[^\w.-]/g, '_');
        const timeV = String(versions.timeRulesVersion || 'time').replace(/[^\w.-]/g, '_');
        return `${stamp}-${baseV}-${timeV}`;
    }

    createSnapshot(reason = 'manual') {
        this.ensureDataDir();
        const versions = this.getCurrentVersions();
        const snapshotId = this.buildSnapshotId(versions);
        const baseTarget = path.join(this.backupDir, `${snapshotId}.base.json`);
        const timeTarget = path.join(this.backupDir, `${snapshotId}.time.json`);
        fs.copyFileSync(this.baseRulesPath, baseTarget);
        fs.copyFileSync(this.timeRulesPath, timeTarget);
        const state = this.loadState();
        const entry = {
            snapshotId,
            createdAt: new Date().toISOString(),
            reason: String(reason || 'manual'),
            versions,
            files: {
                base: baseTarget,
                time: timeTarget
            }
        };
        state.history.unshift(entry);
        if (state.history.length > 50) state.history = state.history.slice(0, 50);
        state.current = {
            snapshotId,
            ...versions,
            updatedAt: new Date().toISOString()
        };
        this.saveState(state);
        return entry;
    }

    ensureStateInitialized() {
        this.ensureDataDir();
        const state = this.loadState();
        const versions = this.getCurrentVersions();
        const sameCurrent = state.current &&
            state.current.baseRulesVersion === versions.baseRulesVersion &&
            state.current.timeRulesVersion === versions.timeRulesVersion;
        if (sameCurrent && Array.isArray(state.history) && state.history.length > 0) return state;
        this.createSnapshot('auto_init');
        return this.loadState();
    }

    getStatus() {
        const state = this.ensureStateInitialized();
        const current = this.getCurrentVersions();
        return {
            current,
            historyCount: Array.isArray(state.history) ? state.history.length : 0,
            lastRollback: state.lastRollback || null
        };
    }

    getSnapshots(limit = 20) {
        const state = this.ensureStateInitialized();
        const n = Math.max(1, Math.min(Number(limit || 20), 100));
        return (state.history || []).slice(0, n);
    }

    rollbackToSnapshot(snapshotId) {
        const sid = String(snapshotId || '').trim();
        if (!sid) return { success: false, message: 'snapshotId required' };
        const state = this.ensureStateInitialized();
        const target = (state.history || []).find((x) => String(x && x.snapshotId || '') === sid);
        if (!target || !target.files || !target.files.base || !target.files.time) {
            return { success: false, message: 'snapshot not found' };
        }
        if (!fs.existsSync(target.files.base) || !fs.existsSync(target.files.time)) {
            return { success: false, message: 'snapshot file missing' };
        }
        fs.copyFileSync(target.files.base, this.baseRulesPath);
        fs.copyFileSync(target.files.time, this.timeRulesPath);
        this.resetCache();
        const versions = this.getCurrentVersions();
        state.current = {
            snapshotId: sid,
            ...versions,
            updatedAt: new Date().toISOString()
        };
        state.lastRollback = {
            snapshotId: sid,
            at: new Date().toISOString(),
            versions
        };
        this.saveState(state);
        return { success: true, snapshotId: sid, versions };
    }

    trackHit(input = {}) {
        const state = this.ensureStateInitialized();
        const entry = {
            at: new Date().toISOString(),
            type: String(input.type || 'unknown'),
            scope: String(input.scope || ''),
            fmt: String(input.fmt || ''),
            proto: String(input.proto || ''),
            baseRuleId: String(input.baseRuleId || ''),
            timeRuleId: String(input.timeRuleId || ''),
            hitSource: String(input.hitSource || ''),
            success: input.success !== false,
            errorCode: String(input.errorCode || '')
        };
        state.hitLogs.unshift(entry);
        if (state.hitLogs.length > this.maxHitLogs) state.hitLogs = state.hitLogs.slice(0, this.maxHitLogs);
        this.saveState(state);
        return entry;
    }

    getHitLogs(limit = 100) {
        const state = this.ensureStateInitialized();
        const n = Math.max(1, Math.min(Number(limit || 100), this.maxHitLogs));
        return (state.hitLogs || []).slice(0, n);
    }

    getSelection() {
        const state = this.ensureStateInitialized();
        return state.selection || {
            base: { mode: 'auto', ruleId: '' },
            time: { mode: 'auto', formatId: '' },
            proxy: { mode: 'path_no_scheme' }
        };
    }

    updateSelection(input = {}) {
        const state = this.ensureStateInitialized();
        const baseIn = input.base || {};
        const timeIn = input.time || {};
        const proxyIn = input.proxy || {};
        const baseMode = String(baseIn.mode || 'auto').toLowerCase();
        const timeMode = String(timeIn.mode || 'auto').toLowerCase();
        const proxyModeRaw = String(proxyIn.mode || 'path_no_scheme').trim().toLowerCase();
        const proxyMode = ['path_no_scheme', 'with_proto_segment', 'full_url'].includes(proxyModeRaw) ? proxyModeRaw : 'path_no_scheme';
        state.selection = {
            base: {
                mode: baseMode === 'manual' ? 'manual' : 'auto',
                ruleId: String(baseIn.ruleId || '').trim()
            },
            time: {
                mode: timeMode === 'manual' ? 'manual' : 'auto',
                formatId: String(timeIn.formatId || '').trim()
            },
            proxy: {
                mode: proxyMode
            }
        };
        this.saveState(state);
        return state.selection;
    }
}

module.exports = ReplayRulesStateManager;
