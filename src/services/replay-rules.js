const fs = require('fs');
const path = require('path');
const ReplayRulesStateManager = require('./replay-rules-state');

class ReplayRulesService {
    constructor() {
        this.baseRulesPath = path.join(__dirname, '../../replay_base_rules.json');
        this.timeRulesPath = path.join(__dirname, '../../time_placeholder_rules.json');
        this.dataDir = path.join(__dirname, '../../data');
        this.cache = {
            base: null,
            baseMtime: 0,
            time: null,
            timeMtime: 0
        };
        this.stateManager = new ReplayRulesStateManager({
            baseRulesPath: this.baseRulesPath,
            timeRulesPath: this.timeRulesPath,
            dataDir: this.dataDir,
            resetCache: () => this.resetCache()
        });
    }

    loadJson(filePath) {
        const st = fs.statSync(filePath);
        const mtime = Number(st.mtimeMs || 0);
        const isBase = filePath === this.baseRulesPath;
        const key = isBase ? 'base' : 'time';
        const mKey = isBase ? 'baseMtime' : 'timeMtime';
        if (this.cache[key] && this.cache[mKey] === mtime) return this.cache[key];
        const obj = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        this.cache[key] = obj;
        this.cache[mKey] = mtime;
        return obj;
    }

    getBaseRules() {
        return this.loadJson(this.baseRulesPath);
    }

    getTimeRules() {
        return this.loadJson(this.timeRulesPath);
    }

    resetCache() {
        this.cache.base = null;
        this.cache.baseMtime = 0;
        this.cache.time = null;
        this.cache.timeMtime = 0;
    }

    getStatus() {
        return this.stateManager.getStatus();
    }

    getSnapshots(limit = 20) {
        return this.stateManager.getSnapshots(limit);
    }

    createSnapshot(reason = 'manual') {
        return this.stateManager.createSnapshot(reason);
    }

    rollbackToSnapshot(snapshotId) {
        return this.stateManager.rollbackToSnapshot(snapshotId);
    }

    trackHit(input = {}) {
        return this.stateManager.trackHit(input);
    }

    getHitLogs(limit = 100) {
        return this.stateManager.getHitLogs(limit);
    }

    getSelection() {
        return this.stateManager.getSelection();
    }

    updateSelection(input = {}) {
        return this.stateManager.updateSelection(input);
    }

    getCatalog() {
        const baseCfg = this.getBaseRules();
        const timeCfg = this.getTimeRules();
        const baseRules = (Array.isArray(baseCfg.rules) ? baseCfg.rules : [])
            .filter((r) => r && r.enabled !== false)
            .map((r) => ({
                id: String(r.id || ''),
                priority: Number(r.priority || 0),
                scope: String(r.scope || '*'),
                region: r.region || {},
                protocols: (r.match && Array.isArray(r.match.protocols)) ? r.match.protocols : [],
                hostRegex: String((r.match && r.match.host_regex) || ''),
                pathRegex: String((r.match && r.match.path_regex) || ''),
                outputTemplate: String((r.transform && r.transform.output_template) || ''),
                queryMode: String((r.transform && r.transform.query_mode) || '')
            }));
        const ext = (timeCfg && timeCfg.placeholder_extensions) || {};
        const runtimeAlias = (ext && ext.runtime_alias_tokens) || {};
        const patternAliases = (ext && ext.pattern_aliases) || {};
        const variables = (timeCfg && timeCfg.variables) || {};
        const placeholderCatalog = [];
        Object.keys(variables).forEach((k) => {
            placeholderCatalog.push({ key: `{${k}}`, value: String(variables[k] || ''), kind: 'variable', normalized: String(k || '') });
        });
        Object.keys(runtimeAlias).forEach((k) => {
            placeholderCatalog.push({ key: k, value: String(runtimeAlias[k] || ''), kind: 'runtime_alias', normalized: String(runtimeAlias[k] || '') });
        });
        Object.keys(patternAliases).forEach((k) => {
            placeholderCatalog.push({ key: k, value: String(patternAliases[k] || ''), kind: 'pattern_alias', normalized: String(k || '') });
        });
        const normalizeToken = (token) => String(token || '').replace(/^\$\{/, '{').replace(/\}$/, '').replace(/^\{/, '').replace(/\}$/, '').trim();
        const uniq = (arr) => [...new Set((arr || []).map((x) => String(x || '')).filter(Boolean))];
        const rawFormats = (Array.isArray(timeCfg.formats) ? timeCfg.formats : []);
        const timeFormats = rawFormats
            .filter((f) => f && f.enabled !== false)
            .map((f) => ({
                id: String(f.id || ''),
                priority: Number(f.priority || 0),
                protocols: Array.isArray(f.protocols) ? f.protocols : [],
                template: String(f.template || ''),
                isAlias: false,
                aliasTo: '',
                placeholders: (function() {
                    const tpl = String(f.template || '');
                    const varsHit = uniq((tpl.match(/\{[a-zA-Z0-9_]+\}/g) || []).map((x) => x.replace(/^\{/, '').replace(/\}$/, '')));
                    const simpleDollarHit = uniq((tpl.match(/\$\{[a-zA-Z0-9_]+\}/g) || []).map((x) => x.replace(/^\$\{/, '').replace(/\}$/, '')));
                    const explicitAliasToken = uniq((tpl.match(/\$\{timestamp\}|\{timestamp\}|\$\{end_timestamp\}|\{end_timestamp\}|\$\{duration\}|\{duration\}|\{start\}|\{end\}/g) || []).map((x) => String(x)));
                    const fromVars = varsHit.map((v) => `{${v}}`);
                    const fromDollarVars = simpleDollarHit.map((v) => `{${v}}`);
                    const fromRuntimeAlias = Object.keys(runtimeAlias).filter((token) => varsHit.includes(String(runtimeAlias[token] || '')));
                    return uniq([...fromVars, ...fromDollarVars, ...fromRuntimeAlias, ...explicitAliasToken]);
                })()
            }));
        const formatMap = {};
        timeFormats.forEach((f) => { formatMap[String(f.id || '')] = f; });
        const aliases = (timeCfg && typeof timeCfg.aliases === 'object' && timeCfg.aliases) || {};
        Object.keys(aliases).forEach((aliasId) => {
            const target = String(aliases[aliasId] || '');
            const targetFmt = formatMap[target];
            timeFormats.push({
                id: String(aliasId || ''),
                priority: Number((targetFmt && targetFmt.priority) || 0) - 1,
                protocols: Array.isArray(targetFmt && targetFmt.protocols) ? targetFmt.protocols : [],
                template: String((targetFmt && targetFmt.template) || ''),
                isAlias: true,
                aliasTo: target,
                placeholders: Array.isArray(targetFmt && targetFmt.placeholders) ? targetFmt.placeholders : []
            });
        });
        const proxyModes = [
            { id: 'path_no_scheme', name: '格式1', description: '单播代理/单播地址(去协议)' },
            { id: 'with_proto_segment', name: '格式2', description: '单播代理/{http|https|rtsp}/单播地址(去协议)' },
            { id: 'full_url', name: '格式3', description: '单播代理/完整单播地址(保留协议)' }
        ];
        return { baseRules, timeFormats, placeholderCatalog: placeholderCatalog.map(({ normalized, ...rest }) => rest), proxyModes };
    }

    isHttpUrl(url) {
        return /^https?:\/\//i.test(String(url || '').trim());
    }

    stripQuery(url) {
        const s = String(url || '');
        const i = s.indexOf('?');
        return i >= 0 ? s.slice(0, i) : s;
    }

    normalizeFmt(fmt, timeCfg) {
        const f = String(fmt || '').trim().toLowerCase() || String((timeCfg.defaults || {}).default_format || 'iso8601').toLowerCase();
        const aliases = (timeCfg && timeCfg.aliases) || {};
        return String(aliases[f] || f).toLowerCase();
    }

    parseUrl(rawUrl) {
        try {
            const u = new URL(String(rawUrl || '').trim());
            return { ok: true, u };
        } catch (e) {
            return { ok: false, error: e };
        }
    }

    matchRegion(ruleRegion = {}, ctxRegion = {}) {
        const keys = ['province', 'city', 'operator'];
        for (const k of keys) {
            const rv = String(ruleRegion[k] == null ? '*' : ruleRegion[k]).trim();
            if (!rv || rv === '*') continue;
            const cv = String(ctxRegion[k] == null ? '' : ctxRegion[k]).trim();
            if (!cv) continue;
            if (rv !== cv) return false;
        }
        return true;
    }

    applyQueryMode(urlObj, mode, whitelist = [], blacklist = []) {
        const m = String(mode || 'keep_all').toLowerCase();
        if (m === 'drop_all') {
            urlObj.search = '';
            return;
        }
        if (m === 'keep_all') return;
        if (m === 'keep_whitelist') {
            const allow = new Set((Array.isArray(whitelist) ? whitelist : []).map((x) => String(x || '').toLowerCase()).filter(Boolean));
            const out = new URLSearchParams();
            urlObj.searchParams.forEach((v, k) => {
                if (allow.has(String(k || '').toLowerCase())) out.append(k, v);
            });
            urlObj.search = out.toString() ? `?${out.toString()}` : '';
            return;
        }
        if (m === 'drop_blacklist') {
            const deny = new Set((Array.isArray(blacklist) ? blacklist : []).map((x) => String(x || '').toLowerCase()).filter(Boolean));
            const out = new URLSearchParams();
            urlObj.searchParams.forEach((v, k) => {
                if (!deny.has(String(k || '').toLowerCase())) out.append(k, v);
            });
            urlObj.search = out.toString() ? `?${out.toString()}` : '';
        }
    }

    renderTemplate(template, vars) {
        return String(template || '').replace(/\{([a-zA-Z0-9_]+)\}/g, (m, g1) => {
            if (Object.prototype.hasOwnProperty.call(vars, g1)) return String(vars[g1]);
            return m;
        });
    }

    resolveReplayBase(params = {}) {
        const liveUrl = String(params.liveUrl || '').trim();
        if (!liveUrl) return { success: false, errorCode: 'NO_MATCH_UNICAST', message: 'empty live url' };
        const parsed = this.parseUrl(liveUrl);
        if (!parsed.ok) return { success: false, errorCode: 'TEMPLATE_INVALID', message: 'invalid live url' };
        const cfg = this.getBaseRules();
        const defaults = cfg.defaults || {};
        const proto = String((params.protocol || parsed.u.protocol.replace(':', '') || '').toLowerCase());
        const scope = String(params.scope || 'internal').toLowerCase();
        const region = params.region || {};
        const rules = Array.isArray(cfg.rules) ? cfg.rules : [];
        const selection = this.getSelection();
        const forceRuleId = String((params.baseRuleId || ((selection.base && selection.base.mode === 'manual') ? selection.base.ruleId : '')) || '').trim();
        const forcePicked = forceRuleId ? rules.find((r) => r && r.enabled !== false && String(r.id || '') === forceRuleId) : null;
        const candidates = rules
            .filter((r) => r && r.enabled !== false)
            .filter((r) => {
                const rs = String(r.scope || '').trim().toLowerCase();
                if (!rs || rs === '*' || rs === 'all') return true;
                return rs === scope;
            })
            .filter((r) => this.matchRegion(r.region || {}, region))
            .filter((r) => {
                const match = r.match || {};
                const protocols = Array.isArray(match.protocols) ? match.protocols.map((x) => String(x || '').toLowerCase()) : [];
                if (protocols.length > 0 && !protocols.includes(proto)) return false;
                const hostRegex = String(match.host_regex || '.*');
                const pathRegex = String(match.path_regex || '.*');
                try {
                    if (!(new RegExp(hostRegex).test(parsed.u.host))) return false;
                    if (!(new RegExp(pathRegex).test(parsed.u.pathname))) return false;
                } catch (e) {
                    return false;
                }
                return true;
            })
            .sort((a, b) => Number(b.priority || 0) - Number(a.priority || 0));
        const picked = forcePicked || candidates[0] || null;
        const work = new URL(parsed.u.href);
        const pickedTransform = picked ? (picked.transform || {}) : {};
        const queryMode = String(pickedTransform.query_mode || defaults.query_mode || 'keep_all').toLowerCase();
        this.applyQueryMode(work, queryMode, pickedTransform.query_whitelist || [], pickedTransform.query_blacklist || []);
        const vars = {
            live_url: work.href,
            live_base: this.stripQuery(work.href),
            live_query: String(work.search || '').replace(/^\?/, ''),
            scheme: work.protocol.replace(':', ''),
            host: work.hostname,
            port: work.port || '',
            path: work.pathname,
            joiner: work.search ? '&' : '?'
        };
        const outputTemplate = String(pickedTransform.output_template || '{live_url}');
        const baseUrl = this.renderTemplate(outputTemplate, vars);
        if (!baseUrl) return { success: false, errorCode: 'TEMPLATE_INVALID', message: 'empty base by template' };
        return {
            success: true,
            baseUrl,
            baseRuleId: picked ? String(picked.id || '') : '',
            hitSource: picked ? (forcePicked ? 'manual_rule_selection' : 'region_rule') : 'default_baseline'
        };
    }

    formatTimeVars(startMs, endMs) {
        const pad = (n, w = 2) => String(n).padStart(w, '0');
        const asUtc = (ms) => {
            const d = new Date(ms);
            const y = d.getUTCFullYear();
            const M = pad(d.getUTCMonth() + 1);
            const D = pad(d.getUTCDate());
            const H = pad(d.getUTCHours());
            const m = pad(d.getUTCMinutes());
            const s = pad(d.getUTCSeconds());
            return { y, M, D, H, m, s };
        };
        const s1 = asUtc(startMs);
        const e1 = asUtc(endMs);
        const start14 = `${s1.y}${s1.M}${s1.D}${s1.H}${s1.m}${s1.s}`;
        const end14 = `${e1.y}${e1.M}${e1.D}${e1.H}${e1.m}${e1.s}`;
        const startS = String(Math.floor(startMs / 1000));
        const endS = String(Math.floor(endMs / 1000));
        const durationS = String(Math.max(0, Math.floor((endMs - startMs) / 1000)));
        return {
            start_utc_yyyymmdd_hhmmss: start14,
            end_utc_yyyymmdd_hhmmss: end14,
            start_utc_yyyymmdd_hhmmss_t: `${s1.y}${s1.M}${s1.D}T${s1.H}${s1.m}${s1.s}`,
            end_utc_yyyymmdd_hhmmss_t: `${e1.y}${e1.M}${e1.D}T${e1.H}${e1.m}${e1.s}`,
            start_iso8601: `${s1.y}-${s1.M}-${s1.D}T${s1.H}:${s1.m}:${s1.s}Z`,
            end_iso8601: `${e1.y}-${e1.M}-${e1.D}T${e1.H}:${e1.m}:${e1.s}Z`,
            start_iso8601_urlencoded: encodeURIComponent(`${s1.y}-${s1.M}-${s1.D}T${s1.H}:${s1.m}:${s1.s}Z`),
            end_iso8601_urlencoded: encodeURIComponent(`${e1.y}-${e1.M}-${e1.D}T${e1.H}:${e1.m}:${e1.s}Z`),
            start_unix_s: startS,
            end_unix_s: endS,
            start_unix_ms: String(startMs),
            end_unix_ms: String(endMs),
            start_hhmmss: `${s1.H}:${s1.m}:${s1.s}`,
            end_hhmmss: `${e1.H}:${e1.m}:${e1.s}`,
            start: start14,
            end: end14,
            timestamp: startS,
            end_timestamp: endS,
            duration: durationS
        };
    }

    normalizePattern(format, ext = {}) {
        const f = String(format || '');
        if (!f) return '';
        const alias = (ext && ext.pattern_aliases) || {};
        return Object.keys(alias).reduce((acc, key) => acc.replace(new RegExp(key, 'g'), String(alias[key] || '')), f);
    }

    formatByPattern(ms, pattern, forceUtc = false, ext = {}) {
        const p = this.normalizePattern(pattern, ext);
        const d = new Date(ms);
        const pad = (n, w = 2) => String(n).padStart(w, '0');
        const useUtc = forceUtc || /\|UTC$/i.test(p);
        const core = String(p).replace(/\|UTC$/i, '');
        const year = useUtc ? d.getUTCFullYear() : d.getFullYear();
        const month = pad((useUtc ? d.getUTCMonth() : d.getMonth()) + 1);
        const day = pad(useUtc ? d.getUTCDate() : d.getDate());
        const hour = pad(useUtc ? d.getUTCHours() : d.getHours());
        const minute = pad(useUtc ? d.getUTCMinutes() : d.getMinutes());
        const second = pad(useUtc ? d.getUTCSeconds() : d.getSeconds());
        const ms3 = pad(useUtc ? d.getUTCMilliseconds() : d.getMilliseconds(), 3);
        const offsetMinutes = -d.getTimezoneOffset();
        const offSign = offsetMinutes >= 0 ? '+' : '-';
        const offAbs = Math.abs(offsetMinutes);
        const offHH = pad(Math.floor(offAbs / 60));
        const offMM = pad(offAbs % 60);
        const zoneK = useUtc ? 'Z' : `${offSign}${offHH}:${offMM}`;
        const unixS = String(Math.floor(ms / 1000));
        const unixMs = String(ms);
        if (/^(timestamp|unix|epoch)$/i.test(core)) return unixS;
        if (/^unix_ms$/i.test(core)) return unixMs;
        return core
            .replace(/yyyy/g, String(year))
            .replace(/MM/g, month)
            .replace(/dd/g, day)
            .replace(/HH/g, hour)
            .replace(/mm/g, minute)
            .replace(/ss/g, second)
            .replace(/SSS/g, ms3)
            .replace(/K/g, zoneK);
    }

    renderRuntimeTimeTemplate(template, startMs, endMs, vars, ext = {}) {
        let out = String(template || '');
        out = out.replace(/\$\{\((b|e)\)([^}]+)\}/g, (_, which, fmt) => {
            const ms = which === 'b' ? startMs : endMs;
            return this.formatByPattern(ms, fmt, false, ext);
        });
        out = out.replace(/\{utcend:([^}]+)\}/g, (_, fmt) => this.formatByPattern(endMs, fmt, true, ext));
        out = out.replace(/\{utc:([^}]+)\}/g, (_, fmt) => this.formatByPattern(startMs, fmt, true, ext));
        const aliasDef = (ext && ext.runtime_alias_tokens) || {};
        const aliasMap = {};
        Object.keys(aliasDef).forEach((k) => {
            const varKey = String(aliasDef[k] || '');
            aliasMap[k] = Object.prototype.hasOwnProperty.call(vars, varKey) ? vars[varKey] : '';
        });
        Object.keys(aliasMap).forEach((k) => {
            out = out.split(k).join(String(aliasMap[k] || ''));
        });
        out = out.replace(/\$\{([a-zA-Z0-9_]+)\}/g, (m, g1) => (Object.prototype.hasOwnProperty.call(vars, g1) ? String(vars[g1]) : m));
        out = out.replace(/\{([a-zA-Z0-9_]+)\}/g, (m, g1) => (Object.prototype.hasOwnProperty.call(vars, g1) ? String(vars[g1]) : m));
        return out;
    }

    renderExportTimeTemplate(template, tokenMap, ext = {}) {
        let out = String(template || '');
        out = out.replace(/\$\{\((b|e)\)([^}]+)\}/g, (_, which, fmt) => {
            const t = which === 'b' ? 'b' : 'e';
            const f = this.normalizePattern(fmt, ext);
            if (/^(timestamp|unix|epoch)$/i.test(String(f))) return '${(' + t + ')unix_s|UTC}';
            if (/^unix_ms$/i.test(String(f))) return '${(' + t + ')unix_ms|UTC}';
            if (/^duration$/i.test(String(f))) return '${duration}';
            return '${(' + t + ')' + f + '}';
        });
        out = out.replace(/\{utcend:([^}]+)\}/g, (_, fmt) => '${(e)' + this.normalizePattern(fmt, ext) + '|UTC}');
        out = out.replace(/\{utc:([^}]+)\}/g, (_, fmt) => '${(b)' + this.normalizePattern(fmt, ext) + '|UTC}');
        const exportAlias = (ext && ext.export_alias_tokens) || {};
        Object.keys(exportAlias).forEach((k) => {
            out = out.split(k).join(String(exportAlias[k] || ''));
        });
        out = out.replace(/\$\{([a-zA-Z0-9_]+)\}/g, (m, g1) => (Object.prototype.hasOwnProperty.call(tokenMap, g1) ? String(tokenMap[g1]) : m));
        out = out.replace(/\{([a-zA-Z0-9_]+)\}/g, (m, g1) => (Object.prototype.hasOwnProperty.call(tokenMap, g1) ? String(tokenMap[g1]) : m));
        return out;
    }

    pickTimeFormat(fmt, proto, timeCfg) {
        const selection = this.getSelection();
        const forced = (selection.time && selection.time.mode === 'manual') ? String(selection.time.formatId || '').trim() : '';
        const useFmt = String(fmt || '').trim().toLowerCase() === 'default' && forced ? forced : fmt;
        const formatId = this.normalizeFmt(useFmt, timeCfg);
        const protocol = String(proto || 'http').toLowerCase();
        const list = Array.isArray(timeCfg.formats) ? timeCfg.formats : [];
        const hit = list.find((x) => x && x.enabled !== false && String(x.id || '').toLowerCase() === formatId);
        if (!hit) return { ok: false, errorCode: 'TIME_FORMAT_UNSUPPORTED', message: 'format not found' };
        const ps = Array.isArray(hit.protocols) ? hit.protocols.map((x) => String(x || '').toLowerCase()) : [];
        if (ps.length > 0 && !ps.includes(protocol)) return { ok: false, errorCode: 'TIME_FORMAT_UNSUPPORTED', message: 'protocol unsupported' };
        return { ok: true, fmt: formatId, rule: hit };
    }

    buildReplayUrl(params = {}) {
        const baseUrl = String(params.baseUrl || '').trim();
        if (!baseUrl) return { success: false, errorCode: 'NO_MATCH_UNICAST', message: 'empty base url' };
        const startMs = Number(params.startMs || 0);
        const endMs = Number(params.endMs || 0);
        if (!(startMs > 0 && endMs > 0 && endMs > startMs)) return { success: false, errorCode: 'TIME_FORMAT_UNSUPPORTED', message: 'invalid time' };
        const timeCfg = this.getTimeRules();
        const pick = this.pickTimeFormat(params.fmt, params.proto, timeCfg);
        if (!pick.ok) return { success: false, errorCode: pick.errorCode, message: pick.message };
        const vars = this.formatTimeVars(startMs, endMs);
        const tpl = String(pick.rule.template || '');
        const queryText = this.renderRuntimeTimeTemplate(tpl, startMs, endMs, vars, (timeCfg && timeCfg.placeholder_extensions) || {});
        if (/\{[a-zA-Z0-9_]+\}/.test(queryText) || /\$\{[a-zA-Z0-9_]+\}/.test(queryText)) {
            return { success: false, errorCode: 'TEMPLATE_INVALID', message: 'template contains unresolved token' };
        }
        const joiner = String(pick.rule.joiner || 'query').toLowerCase();
        const url = joiner === 'none' || !queryText ? baseUrl : (baseUrl + (baseUrl.includes('?') ? '&' : '?') + queryText);
        return { success: true, url, timeRuleId: pick.fmt };
    }

    buildCatchupSourceTemplate(params = {}) {
        const baseUrl = String(params.baseUrl || '').trim();
        if (!baseUrl) return { success: false, errorCode: 'NO_MATCH_UNICAST', message: 'empty base url' };
        const timeCfg = this.getTimeRules();
        const pick = this.pickTimeFormat(params.fmt, params.proto, timeCfg);
        if (!pick.ok) return { success: false, errorCode: pick.errorCode, message: pick.message };
        const tokenMap = (timeCfg && typeof timeCfg.export_token_map === 'object' && timeCfg.export_token_map) || {};
        const queryText = this.renderExportTimeTemplate(String(pick.rule.template || ''), tokenMap, (timeCfg && timeCfg.placeholder_extensions) || {});
        if (/\{start_[a-zA-Z0-9_]+\}/.test(queryText) || /\{end_[a-zA-Z0-9_]+\}/.test(queryText) || /\$\{start_[a-zA-Z0-9_]+\}/.test(queryText) || /\$\{end_[a-zA-Z0-9_]+\}/.test(queryText)) {
            return { success: false, errorCode: 'TEMPLATE_INVALID', message: 'template contains unresolved token' };
        }
        const joiner = String(pick.rule.joiner || 'query').toLowerCase();
        const source = joiner === 'none' || !queryText ? baseUrl : (baseUrl + (baseUrl.includes('?') ? '&' : '?') + queryText);
        return { success: true, source, timeRuleId: pick.fmt };
    }
}

module.exports = new ReplayRulesService();
