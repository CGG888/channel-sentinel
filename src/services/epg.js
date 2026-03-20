const axios = require('axios');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { XMLParser } = require('fast-xml-parser');
const logger = require('../core/logger');
const config = require('../config');
const configReader = require('../storage/config-reader');

// 获取EPG目录路径
function getEpgDir() {
    const DATA_DIR = path.join(__dirname, '../../data');
    return path.join(DATA_DIR, 'epg');
}

// 确保EPG目录存在
function ensureEpgDir() {
    const epgDir = getEpgDir();
    try {
        if (!fs.existsSync(epgDir)) {
            fs.mkdirSync(epgDir, { recursive: true });
        }
    } catch(e) {
        // 忽略错误
    }
}

// 解析XMLTV日期时间格式
function parseXmltvDatetime(s) {
    const m = String(s || '').match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\s*([+\-]\d{4}|Z))?$/);
    if (!m) return null;
    const y = parseInt(m[1], 10), mo = parseInt(m[2], 10) - 1, d = parseInt(m[3], 10);
    const hh = parseInt(m[4], 10), mm = parseInt(m[5], 10), ss = parseInt(m[6], 10);
    let dt = Date.UTC(y, mo, d, hh, mm, ss);
    const tz = m[7] || null;
    if (tz && tz !== 'Z') {
        const sign = tz.startsWith('-') ? -1 : 1;
        const offH = parseInt(tz.slice(1, 3), 10);
        const offM = parseInt(tz.slice(3, 5), 10);
        const off = sign * (offH * 60 + offM) * 60 * 1000;
        dt -= off;
    }
    return new Date(dt).getTime();
}

// 获取EPG文件路径
function epgFileFor(id) {
    ensureEpgDir();
    const safe = String(id || 'default').replace(/[^a-zA-Z0-9_\-]/g, '');
    return path.join(getEpgDir(), `${safe}.xml`);
}

// 获取并存储XMLTV数据
async function fetchAndStoreXmltv(id, url) {
    ensureEpgDir();
    const resp = await axios.get(url, { responseType: 'arraybuffer', validateStatus: () => true });
    if (resp.status < 200 || resp.status >= 300) throw new Error('fetch epg failed');
    const buf = Buffer.from(resp.data);
    const ctype = (resp.headers && (resp.headers['content-type'] || resp.headers['Content-Type'])) || '';
    const isGz = /\.gz($|\?)/i.test(url) || /gzip/i.test(String(ctype));
    let xml = null;
    try {
        if (isGz) {
            xml = zlib.gunzipSync(buf).toString('utf-8');
        } else {
            xml = buf.toString('utf-8');
        }
    } catch(e) {
        // 回退：当标识为gz但非gz内容时，直接按文本处理
        xml = buf.toString('utf-8');
    }
    const file = epgFileFor(id);
    fs.writeFileSync(file, xml, 'utf-8');
    return file;
}

// 解析XML文件
function parseXmlFile(file) {
    const xml = fs.readFileSync(file, 'utf-8');
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
    const data = parser.parse(xml);
    const tv = data && (data.tv || data.TV || data.xmltv) ? (data.tv || data.TV || data.xmltv) : data;
    const channels = Array.isArray(tv && tv.channel) ? tv.channel : (tv && tv.channel ? [tv.channel] : []);
    const programmes = Array.isArray(tv && tv.programme) ? tv.programme : (tv && tv.programme ? [tv.programme] : []);
    return { channels, programmes };
}

// EPG缓存
const epgCache = new Map();

// 从本地或远程加载XMLTV数据
async function loadXmltvFromLocalOrRemote(source, maxAgeMs = 60 * 60 * 1000, forceRefresh = false) {
    const id = source.id || 'epg';
    const url = source.url;
    const now = Date.now();
    const cacheKey = `local:${id}`;
    
    if (!forceRefresh) {
        const cached = epgCache.get(cacheKey);
        if (cached && now - cached.ts < maxAgeMs) return cached.data;
    }

    const f = epgFileFor(id);
    let needRefresh = true;
    
    if (!forceRefresh) {
        try {
            if (fs.existsSync(f)) {
                const stat = fs.statSync(f);
                if (now - stat.mtimeMs < maxAgeMs) needRefresh = false;
            }
        } catch(e) {}
    }

    if (needRefresh) {
        try {
            await fetchAndStoreXmltv(id, url);
        } catch(e) {
            // 如果远端失败且本地存在旧文件，则继续用旧文件
        }
    }
    if (!fs.existsSync(f)) throw new Error('no epg file');
    const norm = parseXmlFile(f);
    epgCache.set(cacheKey, { ts: now, data: norm });
    return norm;
}

// 格式化UTC时间
function formatUtc(dt, fmt) {
    const d = new Date(dt);
    const pad = (n, w=2) => String(n).padStart(w, '0');
    const y = d.getUTCFullYear();
    const M = pad(d.getUTCMonth() + 1);
    const D = pad(d.getUTCDate());
    const H = pad(d.getUTCHours());
    const m = pad(d.getUTCMinutes());
    const s = pad(d.getUTCSeconds());
    if (fmt === 'yyyyMMddHHmmss') return `${y}${M}${D}${H}${m}${s}`;
    if (fmt === 'yyyy-MM-ddTHH:mm:ssZ') return `${y}-${M}-${D}T${H}:${m}:${s}Z`;
    if (fmt === 'HH:mm:ss') return `${H}:${m}:${s}`;
    if (fmt === 'unix_s') return Math.floor(d.getTime() / 1000).toString();
    if (fmt === 'unix_ms') return d.getTime().toString();
    return `${y}${M}${D}${H}${m}${s}`;
}

// 获取EPG源列表
async function getEpgSources() {
    const epgCfgRaw = config.getConfig('epgSources');
    const epgCfg = await configReader.loadEpgSourcesFallback(epgCfgRaw);
    const epgListRaw = Array.isArray(epgCfg.sources) ? epgCfg.sources : [];
    const epgList = epgListRaw.map(x => ({
        id: x && x.id ? x.id : ('epg-' + Math.random().toString(36).slice(2) + Date.now().toString(36)),
        name: x && x.name ? x.name : '未命名EPG',
        url: x && x.url ? x.url : '',
        scope: (x && x.scope === '外网' || x && x.scope === '外网EPG') ? '外网EPG' : '内网EPG'
    })).filter(x => x.url);
    return epgList;
}

// 根据范围选择EPG源
async function pickEpgSource(scope, epgId = '') {
    const epgList = await getEpgSources();
    
    let pick = null;
    if (epgId) {
        pick = epgList.find(x => x.id === epgId) || null;
    }
    if (!pick) {
        pick = (scope === 'external' ? (epgList.find(x => x.scope === '外网EPG') || null) : (epgList.find(x => x.scope === '内网EPG') || null)) || null;
    }
    
    return pick;
}

// 获取节目列表
async function getPrograms(scope, channelId, channelName, dateStr, epgId, forceRefresh = false) {
    const pick = await pickEpgSource(scope, epgId);
    if (!pick) {
        return { success: false, message: 'No EPG source found', programs: [], channel: null };
    }
    
    try {
        const tv = await loadXmltvFromLocalOrRemote(pick, 60 * 60 * 1000, forceRefresh);
        const chans = tv.channels || [];
        const progs = tv.programmes || [];
        
        let ch = null;
        if (channelId) ch = chans.find(c => String(c && c['@_id']).trim() === channelId) || null;
        if (!ch && channelName) {
            const nm = String(channelName).trim();
            const normalize = s => String(s || '').trim().toUpperCase()
                .replace(/HD/g, '')
                .replace(/4K/g, '')
                .replace(/高清/g, '')
                .replace(/频道/g, '')
                .replace(/[^A-Z0-9\u4e00-\u9fa5]/g, '');
            const target = normalize(nm);

            ch = chans.find(c => {
                const arr = [];
                if (Array.isArray(c['display-name'])) arr.push(...c['display-name']);
                if (c['display-name'] && typeof c['display-name'] === 'object' && c['display-name']['#text']) arr.push(c['display-name']['#text']);
                const names = arr.map(x => (typeof x === 'string') ? x : (x && x['#text'] ? x['#text'] : '')).filter(Boolean);
                return names.some(n => normalize(n) === target);
            }) || null;
        }
        
        const chId = ch ? String(ch['@_id'] || '').trim() : (channelId || '');
        const day = dateStr ? new Date(dateStr + 'T00:00:00Z') : new Date(new Date().toISOString().slice(0,10) + 'T00:00:00Z');
        const startDay = day.getTime();
        const endDay = startDay + 24 * 60 * 60 * 1000;
        
        const list = progs.filter(p => {
            if (chId && String(p['@_channel'] || '').trim() !== chId) return false;
            const st = parseXmltvDatetime(p['@_start']);
            const en = parseXmltvDatetime(p['@_stop'] || p['@_end'] || '');
            if (st == null) return false;
            const e = en != null ? en : (st + 60 * 60 * 1000);
            return !(e <= startDay || st >= endDay);
        }).map(p => {
            const st = parseXmltvDatetime(p['@_start']);
            const en = parseXmltvDatetime(p['@_stop'] || p['@_end'] || '');
            let title = '';
            if (typeof p.title === 'string') title = p.title;
            else if (Array.isArray(p.title)) title = p.title.map(x => (typeof x === 'string') ? x : (x && x['#text'] ? x['#text'] : '')).filter(Boolean)[0] || '';
            else if (p.title && p.title['#text']) title = p.title['#text'];
            let desc = '';
            if (typeof p.desc === 'string') desc = p.desc;
            else if (Array.isArray(p.desc)) desc = p.desc.map(x => (typeof x === 'string') ? x : (x && x['#text'] ? x['#text'] : '')).filter(Boolean)[0] || '';
            else if (p.desc && p.desc['#text']) desc = p.desc['#text'];
            return { startMs: st, endMs: en != null ? en : (st + 3600000), title, desc };
        }).sort((a,b)=>a.startMs-b.startMs);
        
        return {
            success: true,
            channel: ch ? { id: chId, names: ch['display-name'] } : null,
            programs: list,
            epgName: pick.name,
            epgId: pick.id
        };
    } catch (e) {
        logger.error(`获取EPG节目失败: ${e.message}`, 'EPG');
        return { success: false, message: '获取节目失败', programs: [], channel: null };
    }
}

// 刷新EPG数据
async function refreshEpgData(scope, id) {
    const epgList = await getEpgSources();
    let targets = epgList;
    
    if (typeof scope === 'string') {
        if (scope.toLowerCase() === 'internal') targets = epgList.filter(x => x.scope === '内网EPG');
        else if (scope.toLowerCase() === 'external') targets = epgList.filter(x => x.scope === '外网EPG');
    }
    
    if (typeof id === 'string' && id) {
        const t = epgList.find(x => x.id === id);
        targets = t ? [t] : [];
    }
    
    const results = [];
    for (const s of targets) {
        try {
            const f = await fetchAndStoreXmltv(s.id, s.url);
            results.push({ id: s.id, ok: true, file: path.basename(f) });
            logger.info(`EPG刷新成功: ${s.name} (${s.id})`, 'EPG');
        } catch(e) {
            results.push({ id: s.id, ok: false, error: 'fetch failed' });
            logger.error(`EPG刷新失败: ${s.name} (${s.id}) - ${e.message}`, 'EPG');
        }
    }
    
    return { success: true, results };
}

module.exports = {
    parseXmltvDatetime,
    epgFileFor,
    fetchAndStoreXmltv,
    parseXmlFile,
    loadXmltvFromLocalOrRemote,
    formatUtc,
    getEpgSources,
    pickEpgSource,
    getPrograms,
    refreshEpgData
};
