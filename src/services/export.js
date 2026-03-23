const config = require('../config');
const logger = require('../core/logger');
const replayRules = require('./replay-rules');

class ExportService {
    constructor() {
        this.settings = config.getConfig('appSettings');
        this.streams = config.getConfig('streams');
    }

    /**
     * 获取质量标签
     * @param {string} resolution 分辨率
     * @returns {string} 质量标签
     */
    qualityLabelBackend(resolution) {
        const r = (resolution || '').toLowerCase();
        if (r === '720x576' || r === '1280x720') return '标清';
        if (r === '1920x1080') return '高清';
        if (r === '3840x2160') return '超高清';
        return '未知';
    }

    is4kStream(stream) {
        const r = String(stream && stream.resolution ? stream.resolution : '').trim().toLowerCase();
        if (r === '3840x2160' || r === '4096x2160') return true;
        const nm = String((stream && (stream.tvgName || stream.name)) || '').toUpperCase();
        return /(?:^|[\s\-_])4K(?:$|[\s\-_])/.test(nm) || /2160P/.test(nm);
    }

    baseChannelName(stream) {
        const raw = String((stream && (stream.tvgName || stream.name)) || '').trim();
        return raw
            .replace(/\s+/g, ' ')
            .replace(/(?:\s*[-_])?\s*(4K|2160P)\s*$/i, '')
            .trim() || raw;
    }

    exportChannelName(stream) {
        const base = this.baseChannelName(stream);
        if (this.is4kStream(stream)) return /4K$/i.test(base) ? base : `${base} 4K`;
        return base;
    }

    inferGroupByName(name, fallback = '') {
        const nm = String(name || '');
        if (/CCTV/i.test(nm)) return '央视频道';
        if (/卫视/.test(nm)) return '卫视频道';
        if (/(凤凰|翡翠|本港台|港台|TVB|明珠)/i.test(nm)) return '港台频道';
        if (/(少儿|卡通|动漫)/.test(nm)) return '少儿频道';
        if (/(购物|导购)/.test(nm)) return '购物频道';
        return fallback || '未分类频道';
    }

    exportGroupTitle(stream) {
        const raw = String((stream && stream.groupTitle) || '').trim();
        const is4k = this.is4kStream(stream);
        if (is4k) return '4K频道';
        if (/4K/.test(raw)) return this.inferGroupByName(this.exportChannelName(stream), '卫视频道');
        return raw || this.inferGroupByName(this.exportChannelName(stream), '未分类频道');
    }

    /**
     * 根据状态过滤流列表
     * @param {Array} list 流列表
     * @param {string} status 状态: 'all', 'online', 'offline'
     * @returns {Array} 过滤后的列表
     */
    filterByStatus(list, status) {
        if (status === 'online') return list.filter(s => s.isAvailable);
        if (status === 'offline') return list.filter(s => !s.isAvailable);
        return list;
    }

    /**
     * 是否为HTTP URL
     * @param {string} url URL
     * @returns {boolean}
     */
    isHttpUrl(url) {
        return /^https?:\/\//i.test(String(url || '').trim());
    }

    /**
     * 是否为组播流
     * @param {Object} stream 流对象
     * @returns {boolean}
     */
    isMulticastStream(stream) {
        const u = String(stream.multicastUrl || '').trim();
        const scheme = u.split(':')[0].toLowerCase();
        return !!stream.udpxyUrl || scheme === 'rtp' || scheme === 'udp';
    }

    /**
     * 从字符串中提取CCTV编号
     * @param {string} str 字符串
     * @returns {number|null} CCTV编号
     */
    cctvNumberFrom(str) {
        const m = String(str || '').toUpperCase().match(/CCTV[ -]?(\d{1,2})/);
        if (!m) return null;
        const n = parseInt(m[1], 10);
        if (!isNaN(n) && n >= 1 && n <= 17) return n;
        return null;
    }

    /**
     * 根据元数据查找单播匹配
     * @param {string} name 名称
     * @param {string} resolution 分辨率
     * @param {string} frameRate 帧率
     * @returns {Object|null} 匹配的流
     */
    findUnicastMatchByMeta(name, resolution, frameRate) {
        const nm = String(name || '').trim();
        const rs = String(resolution || '').trim();
        const frStr = String(frameRate || '').trim();
        const frNum = frStr ? (parseFloat(frStr) || null) : null;
        const streamsCfg = config.getConfig('streams') || {};
        const list = Array.isArray(streamsCfg.streams) ? streamsCfg.streams : [];
        const candidates = list.filter(x => this.isHttpUrl(x.multicastUrl));
        
        const fullNameEq = (x) => String(x.tvgName || x.name || '').trim() === nm;
        const normalizeName = (s) => String(s || '').trim().replace(/\s+/g, '').replace(/4K$/i, '');
        const nmBase = normalizeName(nm);
        const fullNameBaseEq = (x) => normalizeName(String(x.tvgName || x.name || '').trim()) === nmBase;
        const eqRes = (x) => String(x.resolution || '').trim() === rs;
        const eqFps = (x) => {
            const xf = String(x.frameRate || '').trim();
            if (!xf || !frStr) return false;
            const a = parseFloat(xf);
            const b = frNum;
            if (!isNaN(a) && b !== null) return Math.abs(a - b) <= 0.1;
            return xf === frStr;
        };
        const areaOf = (r) => {
            const m = String(r || '').trim().match(/^(\d+)\s*x\s*(\d+)$/i);
            if (!m) return 0;
            const w = parseInt(m[1], 10);
            const h = parseInt(m[2], 10);
            if (isNaN(w) || isNaN(h)) return 0;
            return w * h;
        };
        
        let nameCandidates = candidates.filter(fullNameEq);
        if (nameCandidates.length === 0) {
            nameCandidates = candidates.filter(fullNameBaseEq);
        }
        if (nameCandidates.length === 0) return null;
        
        const exactRF = nameCandidates.filter(x => eqRes(x) && eqFps(x));
        if (exactRF.length > 0) return exactRF[0];
        
        const exactR = nameCandidates.filter(x => eqRes(x));
        if (exactR.length > 0) {
            const withFps = exactR.filter(x => eqFps(x));
            if (withFps.length > 0) return withFps[0];
            return exactR[0];
        }
        
        const is4k = rs === '3840x2160';
        const fourK = nameCandidates.filter(x => String(x.resolution || '').trim() === '3840x2160');
        const withFps = nameCandidates.filter(x => eqFps(x));
        
        if (is4k) {
            if (withFps.length > 0) {
                const fourKFps = withFps.filter(x => String(x.resolution || '').trim() === '3840x2160');
                if (fourKFps.length > 0) return fourKFps[0];
                withFps.sort((a, b) => areaOf(b.resolution) - areaOf(a.resolution));
                return withFps[0];
            }
            if (fourK.length > 0) return fourK[0];
            const sorted = [...nameCandidates].sort((a, b) => areaOf(b.resolution) - areaOf(a.resolution));
            return sorted[0];
        } else {
            if (withFps.length > 0) {
                withFps.sort((a, b) => areaOf(b.resolution) - areaOf(a.resolution));
                return withFps[0];
            }
            const sorted = [...nameCandidates].sort((a, b) => areaOf(b.resolution) - areaOf(a.resolution));
            return sorted[0];
        }
    }

    /**
     * 构建单播回放基础URL
     * @param {string} scope 范围: 'internal' 或 'external'
     * @param {string} unicastUrl 单播URL
     * @param {string} proto 协议: 'http' 或 'rtsp'
     * @returns {string} 回放基础URL
     */
    buildUnicastCatchupBase(scope, unicastUrl, proto = 'http') {
        const raw = String(unicastUrl || '').trim();
        if (!raw) return '';
        if (proto === 'rtsp') {
            return this.stripQuery(raw);
        }
        if (scope === 'external') {
            const proxyBase = this.getProxyByType('单播代理');
            const merged = this.buildExternalUnicastUrl(this.stripQuery(raw), proxyBase && proxyBase.url ? proxyBase.url : '');
            if (merged) return merged;
        }
        return this.stripQuery(raw);
    }

    /**
     * 获取分组排序
     * @param {Object} stream 流对象
     * @returns {number} 排序值
     */
    groupRankOf(stream) {
        const GROUP_ORDER = ['4K频道', '央视频道', '湖南频道', '卫视频道', '港台频道', '数字频道', '少儿频道', '购物频道', '预留频道', '未分类频道'];
        const g = this.exportGroupTitle(stream);
        const i = GROUP_ORDER.indexOf(g);
        return i === -1 ? GROUP_ORDER.length : i;
    }

    /**
     * 解析CCTV编号
     * @param {Object} stream 流对象
     * @returns {number} CCTV编号或无穷大
     */
    parseCCTVNum(stream) {
        const str = String((stream.tvgName || stream.name || '')).toUpperCase();
        const m = str.match(/CCTV[ -]?(\d+)(?:\+)?/);
        return m ? parseInt(m[1], 10) : Number.POSITIVE_INFINITY;
    }

    /**
     * 获取质量分数
     * @param {Object} stream 流对象
     * @returns {number} 质量分数
     */
    getQualityScore(stream) {
        // 基础分数：组播(2000) > 单播(0)
        let score = this.isMulticastStream(stream) ? 2000 : 0;
        
        // 分辨率分数：4K(500) > 1080P(300) > 720P(100) > 其他(0)
        const res = (stream.resolution || '').toLowerCase();
        if (res === '3840x2160') score += 500;
        else if (res === '1920x1080') score += 300;
        else if (res === '1280x720') score += 100;
        
        // 帧率分数：50fps(50) > 25fps(25) > 其他(0)
        const fps = parseFloat(stream.frameRate || '0');
        if (!isNaN(fps)) score += fps;
        
        return score;
    }

    /**
     * 为导出排序流
     * @param {Array} list 流列表
     * @returns {Array} 排序后的列表
     */
    sortStreamsForExport(list) {
        return [...list].sort((a, b) => {
            const ra = this.groupRankOf(a);
            const rb = this.groupRankOf(b);
            if (ra !== rb) return ra - rb;
            
            const ga = this.exportGroupTitle(a);
            const gb = this.exportGroupTitle(b);
            if (ga === '央视频道' && gb === '央视频道') {
                const ca = this.parseCCTVNum(a);
                const cb = this.parseCCTVNum(b);
                if (ca !== cb) return ca - cb;
            }
            
            const na = this.exportChannelName(a);
            const nb = this.exportChannelName(b);
            // 同名频道按质量排序
            if (na === nb) {
                return this.getQualityScore(b) - this.getQualityScore(a);
            }
            return na.localeCompare(nb, 'zh', { numeric: true, sensitivity: 'base' });
        });
    }

    /**
     * 过滤HTTP参数
     * @param {string} paramStr 参数字符串
     * @returns {string} 过滤后的参数字符串
     */
    filterHttpParam(paramStr) {
        const s = String(paramStr || '').trim();
        if (!s) return '';
        const pairs = s.split('&').map(x => x.trim()).filter(Boolean);
        const filtered = pairs.filter(p => {
            const k = p.split('=')[0].toLowerCase();
            return k !== 'zte_offset' && k !== 'ispcode' && k !== 'starttime';
        });
        return filtered.join('&');
    }

    /**
     * 去除URL的协议部分
     * @param {string} urlStr URL字符串
     * @returns {string} 去除协议后的字符串
     */
    stripScheme(urlStr) {
        return String(urlStr || '').replace(/^https?:\/\//i, '');
    }

    stripAnyScheme(urlStr) {
        return String(urlStr || '').replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, '');
    }

    getUrlScheme(urlStr, fallback = 'http') {
        const m = String(urlStr || '').trim().match(/^([a-zA-Z][a-zA-Z0-9+.-]*):\/\//);
        return m && m[1] ? String(m[1]).toLowerCase() : String(fallback || 'http').toLowerCase();
    }

    /**
     * 去除URL的查询参数部分
     * @param {string} urlStr URL字符串
     * @returns {string} 去除查询参数后的URL
     */
    stripQuery(urlStr) {
        const s = String(urlStr || '');
        const i = s.indexOf('?');
        return i >= 0 ? s.slice(0, i) : s;
    }

    /**
     * 标准化代理类型
     * @param {string} type 代理类型
     * @returns {string} 标准化后的代理类型
     */
    normalizeProxyType(type) {
        const v = String(type || '').trim();
        if (v === '代理' || v === '单播代理') return '单播代理';
        if (v === '外网' || v === '组播代理') return '组播代理';
        // 兼容英文输入
        const low = v.toLowerCase();
        if (low === 'proxy') return '单播代理';
        if (low === 'external' || low === 'internet') return '组播代理';
        return '组播代理';
    }

    /**
     * 根据类型获取代理配置
     * @param {string} type 代理类型
     * @returns {Object|null} 代理配置
     */
    getProxyByType(type) {
        const proxyList = config.getConfig('proxyServers').list || [];
        const list = Array.isArray(proxyList) ? proxyList : [];
        const want = this.normalizeProxyType(type);
        return list.find(x => this.normalizeProxyType(x && x.type) === want) || null;
    }

    getUnicastProxyMode() {
        try {
            const sel = replayRules.getSelection ? replayRules.getSelection() : {};
            const mode = String(sel && sel.proxy && sel.proxy.mode || 'path_no_scheme').toLowerCase();
            if (mode === 'with_proto_segment' || mode === 'full_url') return mode;
        } catch (e) {}
        return 'path_no_scheme';
    }

    normalizeBaseUrl(base) {
        let b = String(base || '').trim();
        if (!b) return '';
        if (!/^https?:\/\//i.test(b)) b = 'http://' + b.replace(/^\/+/, '');
        return b;
    }

    buildExternalUnicastUrl(rawUrl, proxyBaseUrl, options = {}) {
        const raw = String(rawUrl || '').trim();
        if (!raw) return '';
        const pb = this.normalizeBaseUrl(proxyBaseUrl).replace(/\/+$/, '');
        if (!pb) return raw;
        const proxyModeRaw = String(options.proxyMode || this.getUnicastProxyMode()).trim().toLowerCase();
        const proxyMode = ['path_no_scheme', 'with_proto_segment', 'full_url'].includes(proxyModeRaw) ? proxyModeRaw : 'path_no_scheme';
        const defaultScheme = String(options.defaultScheme || this.getUrlScheme(raw, 'http')).toLowerCase();
        const rawNoScheme = this.stripAnyScheme(raw).replace(/^\/+/, '');
        const rawWithScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(raw) ? raw : (defaultScheme + '://' + rawNoScheme);
        if (!this.isHttpUrl(raw) && !/^rtsp:\/\//i.test(raw)) return pb + (raw.startsWith('/') ? raw : ('/' + raw));
        try {
            const pbo = new URL(pb);
            const ro = new URL(rawWithScheme);
            if (pbo.origin === ro.origin) return raw;
        } catch (e) {}
        if (raw.toLowerCase().startsWith((pb + '/').toLowerCase())) return raw;
        if (proxyMode === 'full_url') return pb + '/' + rawWithScheme;
        if (proxyMode === 'with_proto_segment') return pb + '/' + this.getUrlScheme(rawWithScheme, defaultScheme) + '/' + rawNoScheme;
        return pb + '/' + rawNoScheme;
    }

    resolveReplayBaseByLiveUrl(scope, liveUrl, proto = 'http') {
        const live = String(liveUrl || '').trim();
        if (!live) return '';
        const resolved = replayRules.resolveReplayBase({
            liveUrl: live,
            scope,
            protocol: proto
        });
        if (!resolved.success || !resolved.baseUrl) return '';
        if (scope !== 'external') return resolved.baseUrl;
        const proxyBase = this.getProxyByType('单播代理');
        return this.buildExternalUnicastUrl(resolved.baseUrl, (proxyBase && proxyBase.url) || '');
    }

    /**
     * 生成TXT格式导出内容
     * @param {Array} streams 流列表
     * @param {Object} options 选项
     * @param {string} options.scope 范围: 'internal' 或 'external'
     * @param {string} options.status 状态: 'all', 'online', 'offline'
     * @param {boolean} options.stripSuffix 是否去除后缀
     * @returns {string} TXT内容
     */
    generateTxtExport(streams, options = {}) {
        const { scope = 'internal', status = 'all', stripSuffix = false } = options;
        const udpxyCfg = config.getConfig('udpxyServers');
        const udpxyServers = Array.isArray(udpxyCfg.servers) ? udpxyCfg.servers : [];
        const appSettings = config.getConfig('appSettings') || {};
        const currentId = String(udpxyCfg.currentId || appSettings.udpxyCurrentId || '');
        const udpxyCurr = udpxyServers.find(x => x.id === currentId) || udpxyServers[0] || null;
        const udpxyCurrUrl = udpxyCurr ? (udpxyCurr.url || '') : '';
        
        const filtered = this.filterByStatus(streams, status);
        const ordered = this.sortStreamsForExport(filtered);
        
        const lines = [];
        let lastGroup = null;
        
        ordered.forEach(s => {
            const nm = this.exportChannelName(s);
            const u = String(s.multicastUrl || '').trim();
            const scheme = u.split(':')[0].toLowerCase();
            const isMulticast = !!s.udpxyUrl || scheme === 'rtp' || scheme === 'udp';
            let httpUrlBase = '';
            
            if (isMulticast) {
                const extBase = this.getProxyByType('组播代理');
                let base = '';
                if (scope === 'external') {
                    base = (extBase && extBase.url) ? extBase.url : (((config.getConfig('appSettings') || {}).externalUrl) || udpxyCurrUrl || '');
                } else {
                    base = udpxyCurrUrl || '';
                }
                if (!base) {
                    httpUrlBase = u;
                } else {
                    base = this.normalizeBaseUrl(base);
                    const path = '/rtp/' + u.replace(/^rtp:\/\//i, '').replace(/^udp:\/\//i, '');
                    httpUrlBase = `${base}${path}`;
                }
            } else {
                const proxyBase = this.getProxyByType('单播代理');
                if (scope === 'external') {
                    httpUrlBase = this.buildExternalUnicastUrl(u, (proxyBase && proxyBase.url) || '');
                } else {
                    httpUrlBase = u;
                }
            }
            
            const hp = this.filterHttpParam(s.httpParam || '');
            const httpUrl = (isMulticast && hp) ? (httpUrlBase + '?' + hp) : (httpUrlBase);
            const grp = this.exportGroupTitle(s);
            
            if (grp !== lastGroup) {
                lines.push(`${grp},#genre#`);
                lastGroup = grp;
            }
            lines.push(`${nm},${httpUrl}`);
        });
        
        return lines.join('\r\n');
    }

    /**
     * 生成M3U格式导出内容
     * @param {Array} streams 流列表
     * @param {Object} options 选项
     * @param {string} options.scope 范围: 'internal' 或 'external'
     * @param {string} options.status 状态: 'all', 'online', 'offline'
     * @param {string} options.fmt 回放格式
     * @param {string} options.proto 协议: 'http' 或 'rtsp'
     * @param {boolean} options.stripSuffix 是否去除后缀
     * @returns {string} M3U内容
     */
    generateM3uExport(streams, options = {}) {
        const { scope = 'internal', status = 'all', fmt = 'default', proto = 'http', stripSuffix = false } = options;
        const noSuffix = (fmt === 'default') || stripSuffix;
        const udpxyCfg = config.getConfig('udpxyServers');
        const udpxyServers = Array.isArray(udpxyCfg.servers) ? udpxyCfg.servers : [];
        const appSettings = config.getConfig('appSettings') || {};
        const currentId = String(udpxyCfg.currentId || appSettings.udpxyCurrentId || '');
        const udpxyCurr = udpxyServers.find(x => x.id === currentId) || udpxyServers[0] || null;
        const udpxyCurrUrl = udpxyCurr ? (udpxyCurr.url || '') : '';
        
        const logoCfg = config.getConfig('logoTemplates');
        const logoListRaw = Array.isArray(logoCfg.templates) ? logoCfg.templates : [];
        const logoList = logoListRaw.map(t => {
            if (typeof t === 'string') return { id: 'ltpl-' + Math.random().toString(36).slice(2) + Date.now().toString(36), name: '未命名模板', url: t, category: '内网台标' };
            return { id: t.id || ('ltpl-' + Math.random().toString(36).slice(2) + Date.now().toString(36)), name: t.name || '未命名模板', url: t.url || '', category: typeof t.category === 'string' ? (t.category === '内网' ? '内网台标' : (t.category === '外网' ? '外网台标' : t.category)) : '内网台标' };
        }).filter(x => x.url);
        
        const pickLogoTpl = (scope === 'external' ? (logoList.find(x => x.category === '外网台标') || null) : (logoList.find(x => x.category === '内网台标') || null)) || null;
        
        const epgCfg = config.getConfig('epgSources');
        const epgListRaw = Array.isArray(epgCfg.sources) ? epgCfg.sources : [];
        const epgList = epgListRaw.map(x => ({
            id: x && x.id ? x.id : ('epg-' + Math.random().toString(36).slice(2) + Date.now().toString(36)),
            name: x && x.name ? x.name : '未命名EPG',
            url: x && x.url ? x.url : '',
            scope: (x && x.scope === '外网' || x && x.scope === '外网EPG') ? '外网EPG' : '内网EPG'
        })).filter(x => x.url);
        
        const pickEpg = (scope === 'external' ? (epgList.find(x => x.scope === '外网EPG') || null) : (epgList.find(x => x.scope === '内网EPG') || null)) || null;
        
        const filtered = this.filterByStatus(streams, status);
        const ordered = this.sortStreamsForExport(filtered);
        
        const epgHeaderUrl = pickEpg ? pickEpg.url : '';
        const head = '#EXTM3U' + (epgHeaderUrl ? (' x-tvg-url="' + epgHeaderUrl + '"') : '') + '\r\n';
        
        const body = ordered.map(s => {
            const q = this.qualityLabelBackend(s.resolution);
            const fpsStr = s.frameRate ? `${s.frameRate}fps` : '-';
            const u = String(s.multicastUrl || '').trim();
            const scheme = u.split(':')[0].toLowerCase();
            const isMulticast = !!s.udpxyUrl || scheme === 'rtp' || scheme === 'udp';
            const suffix = noSuffix ? '' : (isMulticast ? (`$组播${q}-${fpsStr}`) : (`$单播${q}-${fpsStr}`));
            let httpUrlBase = '';
            
            if (isMulticast) {
                const extBase = this.getProxyByType('组播代理');
                let base = '';
                if (scope === 'external') {
                    base = (extBase && extBase.url) ? extBase.url : (((config.getConfig('appSettings') || {}).externalUrl) || udpxyCurrUrl || '');
                } else {
                    base = udpxyCurrUrl || '';
                }
                if (!base) {
                    httpUrlBase = u;
                } else {
                    base = this.normalizeBaseUrl(base);
                    const path = '/rtp/' + u.replace(/^rtp:\/\//i, '').replace(/^udp:\/\//i, '');
                    httpUrlBase = `${base}${path}`;
                }
            } else {
                const proxyBase = this.getProxyByType('单播代理');
                if (scope === 'external') {
                    httpUrlBase = this.buildExternalUnicastUrl(u, (proxyBase && proxyBase.url) || '');
                } else {
                    httpUrlBase = u;
                }
            }
            
            const hp = this.filterHttpParam(s.httpParam || '');
            const httpUrl = (isMulticast && hp) ? (httpUrlBase + '?' + hp + suffix) : (httpUrlBase + suffix);
            const tvgId = s.tvgId || '';
            const tvgName = this.exportChannelName(s);
            let tvgLogo = s.logo || '';
            const logoTpl = pickLogoTpl ? pickLogoTpl.url : this.settings.logoTemplate;
            if (logoTpl && tvgName) {
                const logoName = tvgName.replace(/\s+/g, '');
                tvgLogo = logoTpl.replace('{name}', logoName);
            }
            const groupTitle = this.exportGroupTitle(s);
            let catchupAttr = '';
            let unicastBase = '';
            
            if (!isMulticast) {
                unicastBase = this.resolveReplayBaseByLiveUrl(scope, s.multicastUrl || '', proto);
            } else {
                const match = this.findUnicastMatchByMeta(s.tvgName || s.name || '', s.resolution || '', s.frameRate);
                if (match && this.isHttpUrl(match.multicastUrl)) {
                    unicastBase = this.resolveReplayBaseByLiveUrl(scope, match.multicastUrl || '', proto);
                }
            }
            
            if (s.m3uCatchupSource) {
                const cu = String(s.m3uCatchupSource || '').trim();
                const ck = String(s.m3uCatchup || 'default').trim() || 'default';
                catchupAttr = ` catchup="${ck}" catchup-source="${cu}"`;
            } else if (!unicastBase && s.catchupBase && fmt === 'default') {
                let cb = s.catchupBase;
                if (scope === 'external') {
                    const proxyBase = this.getProxyByType('单播代理');
                    cb = this.buildExternalUnicastUrl(cb, proxyBase && proxyBase.url ? proxyBase.url : '');
                }
                unicastBase = cb;
            }
            
            if (!catchupAttr && unicastBase) {
                catchupAttr = this.generateCatchupAttribute(unicastBase, fmt, proto);
            }
            
            const line1 = `#EXTINF:-1 tvg-id="${tvgId}" tvg-name="${tvgName}" tvg-logo="${tvgLogo}" group-title="${groupTitle}"${catchupAttr},${this.exportChannelName(s)}`;
            return `${line1}\r\n${httpUrl}`;
        }).filter(Boolean).join('\r\n');
        
        return head + body;
    }

    /**
     * 生成回放属性
     * @param {string} unicastBase 单播基础URL
     * @param {string} fmt 回放格式
     * @returns {string} 回放属性字符串
     */
    generateCatchupAttribute(unicastBase, fmt, proto = 'http') {
        if (String(fmt || '').toLowerCase() === 'default') return '';
        const built = replayRules.buildCatchupSourceTemplate({
            baseUrl: unicastBase,
            fmt,
            proto
        });
        if (!built.success || !built.source) {
            replayRules.trackHit({
                type: 'export_m3u',
                scope: '',
                fmt,
                proto,
                success: false,
                errorCode: built.errorCode || ''
            });
            return '';
        }
        replayRules.trackHit({
            type: 'export_m3u',
            scope: '',
            fmt,
            proto,
            timeRuleId: built.timeRuleId || '',
            success: true
        });
        return ` catchup="default" catchup-source="${built.source}"`;
    }

    /**
     * 生成JSON格式导出内容
     * @param {Array} streams 流列表
     * @param {Object} options 选项
     * @param {string} options.scope 范围: 'internal' 或 'external'
     * @param {string} options.status 状态: 'all', 'online', 'offline'
     * @returns {Array} JSON格式的流列表
     */
    generateJsonExport(streams, options = {}) {
        const { scope = 'internal', status = 'all' } = options;
        const udpxyCfg = config.getConfig('udpxyServers');
        const udpxyServers = Array.isArray(udpxyCfg.servers) ? udpxyCfg.servers : [];
        const appSettings = config.getConfig('appSettings') || {};
        const currentId = String(udpxyCfg.currentId || appSettings.udpxyCurrentId || '');
        const udpxyCurr = udpxyServers.find(x => x.id === currentId) || udpxyServers[0] || null;
        const udpxyCurrUrl = udpxyCurr ? (udpxyCurr.url || '') : '';
        
        const baseList = this.filterByStatus(streams, status);
        const orderedList = this.sortStreamsForExport(baseList);
        
        const filtered = orderedList.map(s => {
            const name = this.exportChannelName(s);
            const udpxyUrl = s.udpxyUrl || '';
            const multicastUrl = s.multicastUrl || '';
            const httpUrl = (() => {
                const u = String(s.multicastUrl || '').trim();
                const scheme = u.split(':')[0].toLowerCase();
                const isMulticast = !!s.udpxyUrl || scheme === 'rtp' || scheme === 'udp';
                let base = '';
                if (isMulticast) {
                    const extBase = this.getProxyByType('组播代理');
                    let b = '';
                    if (scope === 'external') {
                        b = (extBase && extBase.url) ? extBase.url : (((config.getConfig('appSettings') || {}).externalUrl) || udpxyCurrUrl || '');
                    } else {
                        b = udpxyCurrUrl || '';
                    }
                    if (!b) {
                        base = u;
                    } else {
                        b = this.normalizeBaseUrl(b);
                        const path = '/rtp/' + u.replace(/^rtp:\/\//i, '').replace(/^udp:\/\//i, '');
                        base = `${b}${path}`;
                    }
                } else {
                    const proxyBase = this.getProxyByType('单播代理');
                    if (scope === 'external') {
                        base = this.buildExternalUnicastUrl(u, (proxyBase && proxyBase.url) || '');
                    } else {
                        base = u;
                    }
                }
                const suf = `$${this.qualityLabelBackend(s.resolution)}-${s.frameRate ? `${s.frameRate}fps` : '-'}`;
                const hp = this.filterHttpParam(s.httpParam || '');
                return (isMulticast && hp) ? (base + '?' + hp + suf) : (base + suf);
            })();
            
            if (httpUrl === null) return null;
            
            return {
                name,
                udpxyUrl,
                multicastUrl,
                httpUrl,
                isAvailable: !!s.isAvailable,
                resolution: s.resolution || '',
                frameRate: s.frameRate || '',
                codec: s.codec || '',
                tvgId: s.tvgId || '',
                tvgName: s.tvgName || '',
                logo: s.logo || '',
                groupTitle: this.exportGroupTitle(s),
                catchupFormat: s.catchupFormat || '',
                catchupBase: s.catchupBase || '',
                httpParam: s.httpParam || ''
            };
        }).filter(Boolean);
        
        return filtered;
    }
}

// 创建单例实例
const exportService = new ExportService();

module.exports = exportService;
