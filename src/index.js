const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const axios = require('axios');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs');

const cookieParser = require('cookie-parser');
const svgCaptcha = require('svg-captcha');
const packageJson = require('../package.json');
const app = express();
const port = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(bodyParser.json());
app.use(cookieParser());

// 鉴权中间件
const USERS_FILE = path.join(__dirname, '../data/users.json');
const SESSIONS = new Map(); // token -> { username, expires }
const SESSION_TTL = 30 * 60 * 1000; // 30 minutes
const CAPTCHA_STORE = new Map(); // id -> { text, expires }

function loadUsers() {
    return readJson(USERS_FILE, { username: 'admin', password: 'admin' });
}
function saveUsers(u) {
    writeJson(USERS_FILE, u);
}
// 初始化用户文件
if (!fs.existsSync(USERS_FILE)) {
    saveUsers({ username: 'admin', password: 'admin' });
}

// 检查是否登录
function requireAuth(req, res, next) {
    // 排除API接口（除了需要登录的接口）和静态资源（如果是登录页）
    // 但因为 express.static 在前面，这里主要拦截页面路由
    // 实际上我们需要拦截 /, /results.html, /results
    // 静态资源中 login.html 不需要拦截
    
    // 如果是 API 请求，通常由前端自行处理 401，这里只处理页面访问
    // 但用户要求 "不登录的时候不能访问页面功能"，意味着 index.html 和 results.html 需要保护
    
    // 检查 cookie
    const token = req.cookies['auth_token'];
    if (token && SESSIONS.has(token)) {
        const sess = SESSIONS.get(token);
        if (Date.now() < sess.expires) {
            // 续期
            sess.expires = Date.now() + SESSION_TTL;
            return next();
        } else {
            SESSIONS.delete(token);
        }
    }
    
    // API 请求返回 401
    if (req.path.startsWith('/api/') && !['/api/login', '/api/auth/check'].includes(req.path)) {
        // 排除导出接口
        if (req.path.startsWith('/api/export/')) return next();
        // 排除流代理
        if (req.path.startsWith('/api/proxy/')) return next();
        
        return res.status(401).json({ success: false, message: '未登录' });
    }
    
    // 页面请求重定向到登录页
    if (req.path === '/' || req.path === '/index.html' || req.path === '/results' || req.path === '/results.html') {
        return res.redirect('/login.html');
    }
    
    next();
}

// 验证码接口
app.get('/api/captcha', (req, res) => {
    const captcha = svgCaptcha.create({
        size: 4,
        ignoreChars: '0o1i',
        noise: 2,
        color: true,
        background: '#f0f0f0'
    });
    const id = 'cap-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    // 5分钟有效期
    CAPTCHA_STORE.set(id, { text: captcha.text.toLowerCase(), expires: Date.now() + 5 * 60 * 1000 });
    
    // 简单清理过期验证码
    if (CAPTCHA_STORE.size > 1000) {
        const now = Date.now();
        for (const [k, v] of CAPTCHA_STORE) {
            if (now > v.expires) CAPTCHA_STORE.delete(k);
        }
    }

    res.cookie('captcha_id', id, { httpOnly: true, maxAge: 5 * 60 * 1000 });
    res.type('svg');
    res.status(200).send(captcha.data);
});

// 登录接口
app.post('/api/login', (req, res) => {
    const { username, password, captcha } = req.body;
    
    // 验证验证码
    const captchaId = req.cookies['captcha_id'];
    if (!captchaId || !CAPTCHA_STORE.has(captchaId)) {
         return res.json({ success: false, message: '验证码失效，请刷新重试' });
    }
    const stored = CAPTCHA_STORE.get(captchaId);
    CAPTCHA_STORE.delete(captchaId); // 验证码一次性有效
    
    if (!captcha || captcha.toLowerCase() !== stored.text) {
         return res.json({ success: false, message: '验证码错误' });
    }

    const user = loadUsers();
    if (username === user.username && password === user.password) {
        const token = 'sess-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
        SESSIONS.set(token, { username, expires: Date.now() + SESSION_TTL });
        res.cookie('auth_token', token, { maxAge: SESSION_TTL, httpOnly: true });
        return res.json({ success: true });
    }
    res.json({ success: false, message: '用户名或密码错误' });
});

// 登出接口
app.post('/api/logout', (req, res) => {
    const token = req.cookies['auth_token'];
    if (token) SESSIONS.delete(token);
    res.clearCookie('auth_token');
    res.json({ success: true });
});

// 检查登录状态
app.get('/api/auth/check', (req, res) => {
    const token = req.cookies['auth_token'];
    if (token && SESSIONS.has(token)) {
        const sess = SESSIONS.get(token);
        if (Date.now() < sess.expires) {
            return res.json({ success: true, username: sess.username });
        }
    }
    res.json({ success: false });
});

// 修改密码
app.post('/api/auth/update', (req, res) => {
    const token = req.cookies['auth_token'];
    if (!token || !SESSIONS.has(token)) return res.status(401).json({ success: false, message: '未登录' });
    
    const { username, password, oldPassword } = req.body;
    const user = loadUsers();
    
    // 验证旧密码（如果需要更严格的安全，可以加这个字段，这里简化处理直接允许修改，因为已经登录了）
    // 但为了安全，通常需要验证旧密码
    if (user.password !== oldPassword) {
         return res.json({ success: false, message: '旧密码错误' });
    }
    
    if (username) user.username = username;
    if (password) user.password = password;
    saveUsers(user);
    
    // 更新 session
    const sess = SESSIONS.get(token);
    sess.username = user.username;
    
    res.json({ success: true, username: user.username });
});

// 应用鉴权中间件（注意：静态文件在前面已经托管，但我们希望保护特定的 HTML）
// 为了保护 index.html 和 results.html，我们需要在 express.static 之前拦截，或者在 static 之后处理
// 由于 express.static 会直接返回文件，所以必须放在 static 之前
// 但放在 static 之前会拦截 login.html css js 等资源
// 方案：只拦截特定路径
app.use(['/', '/index.html', '/results', '/results.html', '/api/*'], requireAuth);

app.use(express.static('public'));

// 存储组播地址列表
let multicastList = [];
let globalFcc = '';
const DATA_DIR = path.join(__dirname, '../data');
const DATA_FILE = path.join(DATA_DIR, 'streams.json');
const CFG_LOGO = path.join(DATA_DIR, 'logo_templates.json');
const CFG_FCC = path.join(DATA_DIR, 'fcc_servers.json');
const CFG_UDPXY = path.join(DATA_DIR, 'udpxy_servers.json');
const CFG_GROUPS = path.join(DATA_DIR, 'group_titles.json');
const CFG_GROUP_RULES = path.join(DATA_DIR, 'group_rules.json');
const CFG_EPG = path.join(DATA_DIR, 'epg_sources.json');
const CFG_PROXY = path.join(DATA_DIR, 'proxy_servers.json');
const CFG_APPSET = path.join(DATA_DIR, 'app_settings.json');
let settings = {
    globalFcc: '',
    fccServers: [],
    logoTemplate: 'http://12.12.12.177:9443/lcmyhome/TVlive/raw/branch/main/LOGO/{name}.png',
    groupTitles: ['默认'],
    externalUrl: '',
    internalUrl: '',
    useInternal: false,
    useExternal: false,
    securityToken: '',
    enableToken: false,
    proxyList: []
};

function normalizeProxyType(t) {
    const v = String(t || '').trim();
    if (v === '代理') return '代理';
    if (v === '外网') return '外网';
    // 兼容英文输入
    const low = v.toLowerCase();
    if (low === 'proxy') return '代理';
    if (low === 'external' || low === 'internet') return '外网';
    return '外网';
}
function getProxyByType(type) {
    const list = Array.isArray(settings.proxyList) ? settings.proxyList : [];
    const want = normalizeProxyType(type);
    return list.find(x => normalizeProxyType(x && x.type) === want) || null;
}

function ensureDataDir() {
    try { if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true }); } catch(e) {}
}
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
function writeJson(file, obj) {
    ensureDataDir();
    try { fs.writeFileSync(file, JSON.stringify(obj, null, 2), 'utf-8'); return true; } catch(e) { return false; }
}
function persistSave() {
    ensureDataDir();
    const payload = { streams: multicastList, settings: { ...settings, globalFcc } };
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(payload, null, 2), 'utf-8');
        const ts = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        const stamp = `${ts.getFullYear()}${pad(ts.getMonth()+1)}${pad(ts.getDate())}-${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}`;
        const verFile = path.join(DATA_DIR, `streams-${stamp}.json`);
        fs.writeFileSync(verFile, JSON.stringify(payload, null, 2), 'utf-8');
        return true;
    } catch(e) { return false; }
}
function persistLoad() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const txt = fs.readFileSync(DATA_FILE, 'utf-8');
            const json = JSON.parse(txt);
            multicastList = Array.isArray(json.streams) ? json.streams : [];
            globalFcc = json.settings && json.settings.globalFcc ? json.settings.globalFcc : '';
            if (json.settings) {
                settings.fccServers = Array.isArray(json.settings.fccServers) ? json.settings.fccServers : settings.fccServers;
                settings.logoTemplate = json.settings.logoTemplate || settings.logoTemplate;
                settings.groupTitles = Array.isArray(json.settings.groupTitles) ? json.settings.groupTitles : settings.groupTitles;
                settings.globalFcc = globalFcc;
                settings.externalUrl = json.settings.externalUrl || settings.externalUrl;
                settings.internalUrl = json.settings.internalUrl || settings.internalUrl;
                settings.useInternal = !!json.settings.useInternal;
                settings.useExternal = !!json.settings.useExternal;
                settings.securityToken = json.settings.securityToken || settings.securityToken;
                settings.enableToken = !!json.settings.enableToken;
                settings.proxyList = Array.isArray(json.settings.proxyList) ? json.settings.proxyList : settings.proxyList;
            }
            if (globalFcc) {
                const val = globalFcc.includes('=') ? globalFcc : `fcc=${globalFcc}`;
                multicastList = multicastList.map(s => ({ ...s, httpParam: val }));
            }
            return true;
        }
    } catch(e) {}
    return false;
}
persistLoad();
const logoConfig = readJson(CFG_LOGO, { templates: [settings.logoTemplate], current: settings.logoTemplate });
const fccConfig = readJson(CFG_FCC, { servers: settings.fccServers, currentId: '' });
const udpxyConfig = readJson(CFG_UDPXY, { servers: [], currentId: '' });
const groupConfig = readJson(CFG_GROUPS, { titles: settings.groupTitles });
const proxyConfig = readJson(CFG_PROXY, { list: settings.proxyList });
const appSetCfg = readJson(CFG_APPSET, {
    useInternal: settings.useInternal,
    useExternal: settings.useExternal,
    internalUrl: settings.internalUrl,
    externalUrl: settings.externalUrl,
    securityToken: settings.securityToken,
    enableToken: settings.enableToken
});
settings.logoTemplate = logoConfig.current || settings.logoTemplate;
settings.fccServers = Array.isArray(fccConfig.servers) ? fccConfig.servers : settings.fccServers;
settings.groupTitles = Array.isArray(groupConfig.titles)
    ? (typeof groupConfig.titles[0] === 'object' ? groupConfig.titles.map(x => x && x.name ? x.name : '') : groupConfig.titles)
    : settings.groupTitles;
settings.proxyList = Array.isArray(proxyConfig.list) ? proxyConfig.list : settings.proxyList;
settings.useInternal = !!appSetCfg.useInternal;
settings.useExternal = !!appSetCfg.useExternal;
settings.internalUrl = appSetCfg.internalUrl || settings.internalUrl;
settings.externalUrl = appSetCfg.externalUrl || settings.externalUrl;
settings.securityToken = appSetCfg.securityToken || settings.securityToken;
settings.enableToken = !!appSetCfg.enableToken;
if ((!Array.isArray(settings.proxyList) || settings.proxyList.length === 0) && settings.externalUrl) {
    const url = String(settings.externalUrl || '').trim();
    if (url) {
        settings.proxyList = [{ type: '外网', url }];
        writeJson(CFG_PROXY, { list: settings.proxyList });
    }
}
function listVersions() {
    ensureDataDir();
    const files = fs.readdirSync(DATA_DIR).filter(f => /^streams-\d{8}-\d{6}\.json$/.test(f));
    const entries = files.map(f => {
        const full = path.join(DATA_DIR, f);
        let time = 0;
        try { const st = fs.statSync(full); time = st.mtimeMs || 0; } catch(e) {}
        return { file: f, time };
    });
    entries.sort((a, b) => b.time - a.time);
    return entries;
}
function loadVersionFile(filename) {
    ensureDataDir();
    const full = path.join(DATA_DIR, filename);
    if (!fs.existsSync(full)) return false;
    try {
        const txt = fs.readFileSync(full, 'utf-8');
        const json = JSON.parse(txt);
        multicastList = Array.isArray(json.streams) ? json.streams : [];
        const s = json.settings || {};
        globalFcc = s.globalFcc || '';
        settings.fccServers = Array.isArray(s.fccServers) ? s.fccServers : settings.fccServers;
        settings.logoTemplate = s.logoTemplate || settings.logoTemplate;
        settings.groupTitles = Array.isArray(s.groupTitles) ? s.groupTitles : settings.groupTitles;
        settings.globalFcc = globalFcc;
        if (globalFcc) {
            const val = globalFcc.includes('=') ? globalFcc : `fcc=${globalFcc}`;
            multicastList = multicastList.map(ss => ({ ...ss, httpParam: val }));
        }
        return true;
    } catch(e) { return false; }
}

// ffprobe检测函数
// 缓存检测结果
const streamCache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5分钟缓存

function ffprobeCheck(fullUrl, callback) {
    // 检查缓存
    const now = Date.now();
    const cached = streamCache.get(fullUrl);
    if (cached && (now - cached.timestamp) < CACHE_DURATION) {
        return callback(cached.data);
    }

    // 使用json格式输出，便于解析
    const cmd = `ffprobe -v quiet -print_format json -select_streams v:0 -show_streams -show_programs -show_format "${fullUrl}"`;
    exec(cmd, { timeout: 8000 }, (error, stdout, stderr) => {
        let isAvailable = false;
        let frameRate = null;
        let bitRate = null;
        let resolution = null;
        let codec_name = null;
        let service_name = null;
        let raw = null;
        try {
            if (!error && stdout) {
                const json = JSON.parse(stdout);
                raw = json;
                if (json.streams && json.streams.length > 0) {
                    const stream = json.streams[0];
                    isAvailable = stream.codec_type === 'video';
                    codec_name = stream.codec_name || null;
                    if (stream.width && stream.height) {
                        resolution = `${stream.width}x${stream.height}`;
                    }
                    bitRate = stream.bit_rate ? parseInt(stream.bit_rate) : null;
                    // 帧率
                    if (stream.r_frame_rate && stream.r_frame_rate.includes('/')) {
                        const [num, den] = stream.r_frame_rate.split('/').map(Number);
                        if (!isNaN(num) && !isNaN(den) && den !== 0) {
                            frameRate = (num / den).toFixed(2);
                        }
                    }
                }
                if (json.programs && Array.isArray(json.programs)) {
                    for (const p of json.programs) {
                        if (p.tags && (p.tags.service_name || p.tags.title)) {
                            service_name = p.tags.service_name || p.tags.title;
                            break;
                        }
                    }
                }
                if (!service_name && json.format && json.format.tags) {
                    service_name = json.format.tags.service_name || json.format.tags.title || null;
                }
            }
        } catch (e) {
            // 解析异常
        }
        // 计算网速
        let speed = null;
        if (bitRate) {
            speed = (bitRate / 8 / 1024).toFixed(2) + ' KB/s';
        }
        const result = {
            isAvailable,
            frameRate,
            bitRate,
            speed,
            resolution,
            codec: codec_name,
            serviceName: service_name,
            raw // 返回原始ffprobe json数据，便于前端调试
        };
        // 缓存
        streamCache.set(fullUrl, { data: result, timestamp: Date.now() });
        callback(result);
    });
}

// 单条检测用ffprobe
app.post('/api/check-stream', async (req, res) => {
    let { udpxyUrl, multicastUrl, name } = req.body;
    udpxyUrl = String(udpxyUrl || '').trim();
    multicastUrl = String(multicastUrl || '').trim();
    const fullUrl = `${udpxyUrl}/rtp/${multicastUrl.replace('rtp://', '')}`;
    ffprobeCheck(fullUrl, ({ isAvailable, frameRate, bitRate, speed, resolution, codec, serviceName, raw }) => {
        // 更新或添加组播地址
        const existingIndex = multicastList.findIndex(item => 
            String(item.udpxyUrl || '').trim() === udpxyUrl && String(item.multicastUrl || '').trim() === multicastUrl
        );
        const detectFields = {
            udpxyUrl,
            multicastUrl,
            isAvailable,
            lastChecked: new Date().toISOString(),
            frameRate,
            bitRate,
            speed,
            resolution,
            codec
        };
        if (existingIndex !== -1) {
            const prev = multicastList[existingIndex];
            // 只更新状态字段，保留原有名称、分组、Logo等信息
            multicastList[existingIndex] = { ...prev, ...detectFields };
        } else {
            multicastList.push({
                ...detectFields,
                name: name || serviceName || '',
                tvgId: '',
                tvgName: '',
                logo: '',
                groupTitle: '',
                catchupFormat: '',
                catchupBase: '',
                httpParam: ''
            });
        }
        res.json({
            success: true,
            isAvailable,
            frameRate: frameRate || '-',
            bitRate: bitRate ? (bitRate / 1000000).toFixed(2) + 'Mbps' : '-',
            speed,
            resolution: resolution || '-',
            codec: codec || '-',
            name: existingIndex !== -1 ? multicastList[existingIndex].name : (name || serviceName || ''),
            raw, // 返回原始数据
            message: isAvailable ? '流可访问' : '流不可访问'
        });
    });
});
app.post('/api/check-http-stream', async (req, res) => {
    let { url, name } = req.body;
    url = String(url || '').trim();
    ffprobeCheck(url, ({ isAvailable, frameRate, bitRate, speed, resolution, codec, serviceName, raw }) => {
        const existingIndex = multicastList.findIndex(item => String(item.multicastUrl || '').trim() === url);
        const detectFields = {
            udpxyUrl: '',
            multicastUrl: url,
            isAvailable,
            lastChecked: new Date().toISOString(),
            frameRate,
            bitRate,
            speed,
            resolution,
            codec
        };
        if (existingIndex !== -1) {
            const prev = multicastList[existingIndex];
            // 只更新状态字段，保留原有名称、分组、Logo等信息
            multicastList[existingIndex] = { ...prev, ...detectFields };
        } else {
            multicastList.push({
                ...detectFields,
                name: name || serviceName || '',
                tvgId: '',
                tvgName: '',
                logo: '',
                groupTitle: '',
                catchupFormat: '',
                catchupBase: '',
                httpParam: prevGlobalParam()
            });
        }
        res.json({
            success: true,
            isAvailable,
            frameRate: frameRate || '-',
            bitRate: bitRate ? (bitRate / 1000000).toFixed(2) + 'Mbps' : '-',
            speed,
            resolution: resolution || '-',
            codec: codec || '-',
            name: existingIndex !== -1 ? multicastList[existingIndex].name : (name || serviceName || ''),
            raw,
            message: isAvailable ? '流可访问' : '流不可访问'
        });
    });
});
app.post('/api/fetch-text', async (req, res) => {
    const { urls } = req.body || {};
    if (!Array.isArray(urls) || urls.length === 0) {
        return res.status(400).json({ success: false, message: 'urls必须为非空数组' });
    }
    const results = [];
    for (const u of urls) {
        if (typeof u !== 'string' || !/^https?:\/\//i.test(u)) {
            results.push({ url: u, ok: false, status: 'invalid', text: '' });
            continue;
        }
        try {
            const r = await fetch(u);
            const text = await r.text();
            results.push({ url: u, ok: true, status: r.status, text });
        } catch (e) {
            results.push({ url: u, ok: false, status: 'error', text: '' });
        }
    }
    res.json({ success: true, results });
});
function prevGlobalParam() {
    if (!globalFcc) return '';
    const val = globalFcc.includes('=') ? globalFcc : `fcc=${globalFcc}`;
    return val;
}

// 批量检测用ffprobe并发，返回进度和详细信息
app.post('/api/check-streams-batch', async (req, res) => {
    let { udpxyUrl, multicastList: batchList } = req.body;
    udpxyUrl = String(udpxyUrl || '').trim();
    if (!Array.isArray(batchList)) {
        return res.status(400).json({ success: false, message: 'multicastList必须为数组' });
    }
    // 兼容前端传参格式
    const fixedList = batchList.map(item => {
        if (typeof item === 'string') {
            const [name, multicastUrl] = item.split(',');
            return { name: name ? name.trim() : '', multicastUrl: multicastUrl ? multicastUrl.trim() : '' };
        }
        if (item && typeof item === 'object') {
            return { ...item, multicastUrl: String(item.multicastUrl || '').trim() };
        }
        return item;
    }).filter(item => item.multicastUrl && item.multicastUrl.startsWith('rtp://'));
    if (fixedList.length === 0) {
        return res.status(400).json({ success: false, message: '无有效组播地址' });
    }
    const limit = 5;
    let idx = 0;
    const results = [];
    let finished = 0;
    async function runNext(progressCallback) {
        if (idx >= fixedList.length) return;
        const item = fixedList[idx++];
        const multicastUrl = item.multicastUrl || item;
        const name = item.name || '';
        const fullUrl = `${udpxyUrl}/rtp/${multicastUrl.replace('rtp://', '')}`;
        await new Promise((resolve) => {
            ffprobeCheck(fullUrl, ({ isAvailable, frameRate, bitRate, speed, resolution, codec, serviceName }) => {
                results.push({
                    ...item,
                    udpxyUrl,
                    multicastUrl,
                    isAvailable,
                    lastChecked: new Date().toISOString(),
                    frameRate: frameRate || '-',
                    bitRate: bitRate ? (bitRate / 1000000).toFixed(2) + 'Mbps' : '-',
                    speed,
                    resolution: resolution || '-',
                    codec: codec || 'h264',
                    name: name || serviceName || '',
                    message: isAvailable ? '流可访问' : '流不可访问'
                });
                finished++;
                if (progressCallback) progressCallback(finished, fixedList.length, name, multicastUrl, frameRate, bitRate, speed);
                resolve();
            });
        });
        await runNext(progressCallback);
    }
    await Promise.all(Array(limit).fill(0).map(() => runNext(null)));
    // 合并到全局multicastList
    results.forEach(result => {
        const existingIndex = multicastList.findIndex(item =>
            String(item.udpxyUrl || '').trim() === udpxyUrl && String(item.multicastUrl || '').trim() === result.multicastUrl
        );
        if (existingIndex !== -1) {
            const prev = multicastList[existingIndex];
            // 只更新状态字段
            multicastList[existingIndex] = {
                ...prev,
                udpxyUrl,
                multicastUrl: result.multicastUrl,
                isAvailable: result.isAvailable,
                lastChecked: result.lastChecked,
                frameRate: result.frameRate,
                bitRate: result.bitRate,
                speed: result.speed,
                resolution: result.resolution,
                codec: result.codec
            };
        } else {
            multicastList.push({
                udpxyUrl,
                multicastUrl: result.multicastUrl,
                isAvailable: result.isAvailable,
                lastChecked: result.lastChecked,
                frameRate: result.frameRate,
                bitRate: result.bitRate,
                speed: result.speed,
                resolution: result.resolution,
                codec: result.codec,
                name: result.name || '',
                tvgId: '',
                tvgName: '',
                logo: '',
                groupTitle: '',
                catchupFormat: '',
                catchupBase: '',
                httpParam: prevGlobalParam()
            });
        }
    });
    res.json({ success: true, results });
});

// 获取所有组播地址
app.get('/api/streams', (req, res) => {
    res.json({ success: true, streams: multicastList });
});

function qualityLabelBackend(resolution) {
    const r = (resolution || '').toLowerCase();
    if (r === '720x576' || r === '1280x720') return '标清';
    if (r === '1920x1080') return '高清';
    if (r === '3840x2160') return '超高清';
    return '未知';
}
function filterByStatus(list, status) {
    if (status === 'online') return list.filter(s => s.isAvailable);
    if (status === 'offline') return list.filter(s => !s.isAvailable);
    return list;
}
function isHttpUrl(u) {
    return /^https?:\/\//i.test(String(u || '').trim());
}
function isMulticastStream(s) {
    const u = String(s.multicastUrl || '').trim();
    const scheme = u.split(':')[0].toLowerCase();
    return !!s.udpxyUrl || scheme === 'rtp' || scheme === 'udp';
}
function cctvNumberFrom(str) {
    const m = String(str || '').toUpperCase().match(/CCTV[ -]?(\d{1,2})/);
    if (!m) return null;
    const n = parseInt(m[1], 10);
    if (!isNaN(n) && n >= 1 && n <= 17) return n;
    return null;
}
function findUnicastMatchByMeta(name, resolution, frameRate) {
    const nm = String(name || '').trim();
    const rs = String(resolution || '').trim();
    const frStr = String(frameRate || '').trim();
    const frNum = frStr ? (parseFloat(frStr) || null) : null;
    const list = Array.isArray(multicastList) ? multicastList : [];
    const candidates = list.filter(x => isHttpUrl(x.multicastUrl));
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
function buildUnicastCatchupBase(scope, unicastUrl) {
    const raw = String(unicastUrl || '').trim();
    if (!raw) return '';
    if (scope === 'external') {
        const proxyBase = getProxyByType('代理');
        let pb = proxyBase && proxyBase.url ? proxyBase.url : '';
        if (pb && !/^https?:\/\//i.test(pb)) pb = 'http://' + pb.replace(/^\/+/, '');
        if (pb) return pb + '/' + stripScheme(stripQuery(raw));
    }
    return stripQuery(raw);
}
const GROUP_ORDER = ['4K频道','央视频道','湖南频道','卫视频道','港台频道','数字频道','少儿频道','购物频道','预留频道','未分类频道'];
function groupRankOf(s) {
    const g = (s.groupTitle || '').trim() || '未分类频道';
    const i = GROUP_ORDER.indexOf(g);
    return i === -1 ? GROUP_ORDER.length : i;
}
function parseCCTVNum(s) {
    const str = String((s.tvgName || s.name || '')).toUpperCase();
    const m = str.match(/CCTV[ -]?(\d+)(?:\+)?/);
    return m ? parseInt(m[1], 10) : Number.POSITIVE_INFINITY;
}
function getQualityScore(s) {
    // 基础分数：组播(2000) > 单播(0)
    let score = isMulticastStream(s) ? 2000 : 0;
    
    // 分辨率分数：4K(500) > 1080P(300) > 720P(100) > 其他(0)
    const res = (s.resolution || '').toLowerCase();
    if (res === '3840x2160') score += 500;
    else if (res === '1920x1080') score += 300;
    else if (res === '1280x720') score += 100;
    
    // 帧率分数：50fps(50) > 25fps(25) > 其他(0)
    const fps = parseFloat(s.frameRate || '0');
    if (!isNaN(fps)) score += fps;
    
    return score;
}
function sortStreamsForExport(list) {
    return [...list].sort((a, b) => {
        const ra = groupRankOf(a);
        const rb = groupRankOf(b);
        if (ra !== rb) return ra - rb;
        const ga = (a.groupTitle || '').trim();
        const gb = (b.groupTitle || '').trim();
        if (ga === '央视频道' && gb === '央视频道') {
            const ca = parseCCTVNum(a);
            const cb = parseCCTVNum(b);
            if (ca !== cb) return ca - cb;
        }
        const na = (a.name || a.tvgName || '');
        const nb = (b.name || b.tvgName || '');
        // 同名频道按质量排序
        if (na === nb) {
            return getQualityScore(b) - getQualityScore(a);
        }
        return na.localeCompare(nb, 'zh', { numeric: true, sensitivity: 'base' });
    });
}
function filterHttpParam(paramStr) {
    const s = String(paramStr || '').trim();
    if (!s) return '';
    const pairs = s.split('&').map(x => x.trim()).filter(Boolean);
    const filtered = pairs.filter(p => {
        const k = p.split('=')[0].toLowerCase();
        return k !== 'zte_offset' && k !== 'ispcode' && k !== 'starttime';
    });
    return filtered.join('&');
}
function stripScheme(urlStr) {
    return String(urlStr || '').replace(/^https?:\/\//i, '');
}
function stripQuery(urlStr) {
    const s = String(urlStr || '');
    const i = s.indexOf('?');
    return i >= 0 ? s.slice(0, i) : s;
}
app.get('/api/export/txt', (req, res) => {
    // Token validation logic moved to common function or executed here
    const scope = String(req.query.scope || 'internal').toLowerCase();
    if (scope === 'external' && settings.enableToken && settings.securityToken) {
        const token = String(req.query.token || '').trim();
        if (token !== settings.securityToken) {
            return res.status(403).send('Access Denied: Invalid Token');
        }
    }
    const udpxyCfg = readJson(CFG_UDPXY, { servers: [], currentId: '' });
    const udpxyServers = Array.isArray(udpxyCfg.servers) ? udpxyCfg.servers : [];
    const udpxyCurr = udpxyServers.find(x => x.id === udpxyCfg.currentId) || null;
    const udpxyCurrUrl = udpxyCurr ? (udpxyCurr.url || '') : '';
    const status = String(req.query.status || 'all').toLowerCase();
    const stripSuffixParam = String(req.query.stripSuffix || '').toLowerCase();
    const noSuffix = stripSuffixParam === '1' || stripSuffixParam === 'true' || stripSuffixParam === 'yes';
    const filtered = filterByStatus(multicastList, status);
    const ordered = sortStreamsForExport(filtered);
    const content = ordered.map(s => {
        const q = qualityLabelBackend(s.resolution);
        const nm = s.name || '';
        const u = String(s.multicastUrl || '').trim();
        const scheme = u.split(':')[0].toLowerCase();
        const isMulticast = !!s.udpxyUrl || scheme === 'rtp' || scheme === 'udp';
        let httpUrlBase = '';
        if (isMulticast) {
            const extBase = getProxyByType('外网');
            if (scope === 'external' && !(extBase && extBase.url)) return null;
            let base = '';
            if (scope === 'external') {
                base = extBase.url;
            } else {
                base = udpxyCurrUrl || '';
            }
            if (!base) return null;
            if (base && !/^https?:\/\//i.test(base)) base = 'http://' + base.replace(/^\/+/, '');
            const path = '/rtp/' + u.replace(/^rtp:\/\//i, '').replace(/^udp:\/\//i, '');
            httpUrlBase = `${base}${path}`;
        } else {
            const proxyBase = getProxyByType('代理');
            if (scope === 'external' && !(proxyBase && proxyBase.url)) return null;
            let base = scope === 'external' ? (proxyBase.url || '') : '';
            if (scope === 'external' && base && !/^https?:\/\//i.test(base)) base = 'http://' + base.replace(/^\/+/, '');
            httpUrlBase = scope === 'external' ? (base + '/' + stripScheme(u)) : u;
        }
        const suf = noSuffix ? '' : (`$${q}-${s.frameRate ? `${s.frameRate}fps` : '-'}`);
        const hp = filterHttpParam(s.httpParam || '');
        const httpUrl = (isMulticast && hp) ? (httpUrlBase + '?' + hp + suf) : (httpUrlBase + suf);
        return `${nm},${httpUrl},${q}`;
    }).filter(Boolean).join('\r\n');
    res.type('text/plain; charset=utf-8').send(content);
});
app.get('/api/export/m3u', (req, res) => {
    const scope = String(req.query.scope || 'internal').toLowerCase();
    if (scope === 'external' && settings.enableToken && settings.securityToken) {
        const token = String(req.query.token || '').trim();
        if (token !== settings.securityToken) {
            return res.status(403).send('Access Denied: Invalid Token');
        }
    }
    const status = String(req.query.status || 'all').toLowerCase();
    const fmt = String(req.query.fmt || 'default').toLowerCase();
    const stripSuffixParam = String(req.query.stripSuffix || '').toLowerCase();
    const noSuffix = (fmt === 'default') || stripSuffixParam === '1' || stripSuffixParam === 'true' || stripSuffixParam === 'yes';
    const udpxyCfg = readJson(CFG_UDPXY, { servers: [], currentId: '' });
    const udpxyServers = Array.isArray(udpxyCfg.servers) ? udpxyCfg.servers : [];
    const udpxyCurr = udpxyServers.find(x => x.id === udpxyCfg.currentId) || null;
    const udpxyCurrUrl = udpxyCurr ? (udpxyCurr.url || '') : '';
    const defLogo = { templates: [{ id: 'ltpl-default', name: '默认模板', url: settings.logoTemplate, category: '内网' }], currentId: 'ltpl-default' };
    const logoCfg = readJson(CFG_LOGO, defLogo);
    const logoListRaw = Array.isArray(logoCfg.templates) ? logoCfg.templates : [];
    const logoList = logoListRaw.map(t => {
        if (typeof t === 'string') return { id: 'ltpl-' + Math.random().toString(36).slice(2) + Date.now().toString(36), name: '未命名模板', url: t, category: '内网' };
        return { id: t.id || ('ltpl-' + Math.random().toString(36).slice(2) + Date.now().toString(36)), name: t.name || '未命名模板', url: t.url || '', category: typeof t.category === 'string' ? t.category : '内网' };
    }).filter(x => x.url);
    const pickLogoTpl = (scope === 'external' ? (logoList.find(x => x.category === '外网') || null) : (logoList.find(x => x.category === '内网') || null)) || null;
    const defEpg = { sources: [] };
    const epgCfg = readJson(CFG_EPG, defEpg);
    const epgListRaw = Array.isArray(epgCfg.sources) ? epgCfg.sources : [];
    const epgList = epgListRaw.map(x => ({
        id: x && x.id ? x.id : ('epg-' + Math.random().toString(36).slice(2) + Date.now().toString(36)),
        name: x && x.name ? x.name : '未命名EPG',
        url: x && x.url ? x.url : '',
        scope: (x && x.scope === '外网') ? '外网' : '内网'
    })).filter(x => x.url);
    const pickEpg = (scope === 'external' ? (epgList.find(x => x.scope === '外网') || null) : (epgList.find(x => x.scope === '内网') || null)) || null;
    const filtered = filterByStatus(multicastList, status);
    const ordered = sortStreamsForExport(filtered);
    const epgHeaderUrl = pickEpg ? pickEpg.url : '';
    const head = '#EXTM3U' + (epgHeaderUrl ? (' x-tvg-url="' + epgHeaderUrl + '"') : '') + '\r\n';
    const body = ordered.map(s => {
        const q = qualityLabelBackend(s.resolution);
        const fpsStr = s.frameRate ? `${s.frameRate}fps` : '-';
        const suffix = noSuffix ? '' : (`$${q}-${fpsStr}`);
        const u = String(s.multicastUrl || '').trim();
        const scheme = u.split(':')[0].toLowerCase();
        const isMulticast = !!s.udpxyUrl || scheme === 'rtp' || scheme === 'udp';
        let httpUrlBase = '';
        if (isMulticast) {
            const extBase = getProxyByType('外网');
            if (scope === 'external' && !(extBase && extBase.url)) return null;
            let base = '';
            if (scope === 'external') {
                base = extBase.url;
            } else {
                base = udpxyCurrUrl || '';
            }
            if (!base) return null;
            if (base && !/^https?:\/\//i.test(base)) base = 'http://' + base.replace(/^\/+/, '');
            const path = '/rtp/' + u.replace(/^rtp:\/\//i, '').replace(/^udp:\/\//i, '');
            httpUrlBase = `${base}${path}`;
        } else {
            const proxyBase = getProxyByType('代理');
            if (scope === 'external' && !(proxyBase && proxyBase.url)) return null;
            let base = scope === 'external' ? (proxyBase.url || '') : '';
            if (scope === 'external' && base && !/^https?:\/\//i.test(base)) base = 'http://' + base.replace(/^\/+/, '');
            httpUrlBase = scope === 'external' ? (base + '/' + stripScheme(u)) : u;
        }
        const hp = filterHttpParam(s.httpParam || '');
        const httpUrl = (isMulticast && hp) ? (httpUrlBase + '?' + hp + suffix) : (httpUrlBase + suffix);
        const tvgId = s.tvgId || '';
        const tvgName = s.tvgName || s.name || '';
        let tvgLogo = s.logo || '';
        const logoTpl = pickLogoTpl ? pickLogoTpl.url : settings.logoTemplate;
        if (logoTpl && tvgName) tvgLogo = logoTpl.replace('{name}', tvgName);
        const groupTitle = s.groupTitle || '';
        let catchupAttr = '';
        let unicastBase = '';
        if (!isMulticast) {
            unicastBase = buildUnicastCatchupBase(scope, s.multicastUrl || '');
        } else {
            const match = findUnicastMatchByMeta(s.tvgName || s.name || '', s.resolution || '', s.frameRate);
            if (match && isHttpUrl(match.multicastUrl)) {
                unicastBase = buildUnicastCatchupBase(scope, match.multicastUrl || '');
            }
        }
        if (!unicastBase && s.catchupBase && fmt === 'default') {
            let cb = s.catchupBase;
            if (scope === 'external') {
                const proxyBase = getProxyByType('代理');
                let pb = proxyBase && proxyBase.url ? proxyBase.url : '';
                if (pb && !/^https?:\/\//i.test(pb)) pb = 'http://' + pb.replace(/^\/+/, '');
                if (pb) cb = pb + cb;
            }
            unicastBase = cb;
        }
        if (unicastBase) {
            if (fmt === 'ku9') {
                catchupAttr = ` catchup="default" catchup-source="${unicastBase}?starttime=${'${(b)yyyyMMdd|UTC}'}T${'${(b)HHmmss|UTC}'}&endtime=${'${(e)yyyyMMdd|UTC}'}T${'${(e)HHmmss|UTC}'}"`;
            } else if (fmt === 'mytv') {
                catchupAttr = ` catchup="default" catchup-source="${unicastBase}?starttime={utc:yyyyMMddHHmmss}&endtime={utcend:yyyyMMddHHmmss}"`;
            } else {
                catchupAttr = '';
            }
        }
        const line1 = `#EXTINF:-1 tvg-id="${tvgId}" tvg-name="${tvgName}" tvg-logo="${tvgLogo}" group-title="${groupTitle}"${catchupAttr},${s.name || ''}`;
        return `${line1}\r\n${httpUrl}`;
    }).filter(Boolean).join('\r\n');
    res.type('text/plain; charset=utf-8').send(head + body);
});
app.get('/api/export/json', (req, res) => {
    const scope = String(req.query.scope || 'internal').toLowerCase();
    if (scope === 'external' && settings.enableToken && settings.securityToken) {
        const token = String(req.query.token || '').trim();
        if (token !== settings.securityToken) {
            return res.status(403).json({ success: false, message: 'Access Denied: Invalid Token' });
        }
    }
    const status = String(req.query.status || 'all').toLowerCase();
    const udpxyCfg = readJson(CFG_UDPXY, { servers: [], currentId: '' });
    const udpxyServers = Array.isArray(udpxyCfg.servers) ? udpxyCfg.servers : [];
    const udpxyCurr = udpxyServers.find(x => x.id === udpxyCfg.currentId) || null;
    const udpxyCurrUrl = udpxyCurr ? (udpxyCurr.url || '') : '';
    const baseList = filterByStatus(multicastList, status);
    const orderedList = sortStreamsForExport(baseList);
    const filtered = orderedList.map(s => {
        const name = s.name || '';
        const udpxyUrl = s.udpxyUrl || '';
        const multicastUrl = s.multicastUrl || '';
        const httpUrl = (function(){
            const u = String(s.multicastUrl || '').trim();
            const scheme = u.split(':')[0].toLowerCase();
            const isMulticast = !!s.udpxyUrl || scheme === 'rtp' || scheme === 'udp';
            let base = '';
            if (isMulticast) {
                const extBase = getProxyByType('外网');
                if (scope === 'external' && !(extBase && extBase.url)) return null;
                let b = '';
                if (scope === 'external') {
                    b = extBase.url;
                } else {
                    b = udpxyCurrUrl || '';
                }
                if (!b) return null;
                if (b && !/^https?:\/\//i.test(b)) b = 'http://' + b.replace(/^\/+/, '');
                const path = '/rtp/' + u.replace(/^rtp:\/\//i, '').replace(/^udp:\/\//i, '');
                base = `${b}${path}`;
            } else {
                const proxyBase = getProxyByType('代理');
                if (scope === 'external' && !(proxyBase && proxyBase.url)) return null;
                let b = scope === 'external' ? (proxyBase.url || '') : '';
                if (scope === 'external' && b && !/^https?:\/\//i.test(b)) b = 'http://' + b.replace(/^\/+/, '');
                base = scope === 'external' ? (b + '/' + stripScheme(u)) : u;
            }
            const suf = `$${qualityLabelBackend(s.resolution)}-${s.frameRate ? `${s.frameRate}fps` : '-'}`;
            const hp = filterHttpParam(s.httpParam || '');
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
            groupTitle: s.groupTitle || '',
            catchupFormat: s.catchupFormat || '',
            catchupBase: s.catchupBase || '',
            httpParam: s.httpParam || ''
        };
    }).filter(Boolean);
    res.json({ success: true, count: filtered.length, streams: filtered });
});

// 批量删除组播地址
app.post('/api/streams/batch-delete', (req, res) => {
    const { indices } = req.body;
    if (!Array.isArray(indices)) {
        return res.status(400).json({ success: false, message: 'indices必须为数组' });
    }
    // 去重并降序排序，防止索引偏移
    const sorted = [...new Set(indices)].filter(i => typeof i === 'number').sort((a, b) => b - a);
    let count = 0;
    for (const idx of sorted) {
        if (idx >= 0 && idx < multicastList.length) {
            multicastList.splice(idx, 1);
            count++;
        }
    }
    res.json({ success: true, count, message: `已删除 ${count} 条记录` });
});

// 删除组播地址
app.delete('/api/stream/:index', (req, res) => {
    const index = parseInt(req.params.index);
    if (index >= 0 && index < multicastList.length) {
        multicastList.splice(index, 1);
        res.json({ success: true, message: '删除成功' });
    } else {
        res.status(400).json({ success: false, message: '无效的索引' });
    }
});
// 清空所有组播地址
app.delete('/api/streams', (req, res) => {
    multicastList = [];
    res.json({ success: true, message: '已清空所有检测结果' });
});

// 新增：强制刷新检测，前端传递force参数，后端清空所有检测数据
app.post('/api/force-refresh', (req, res) => {
    multicastList = [];
    streamCache.clear();
    res.json({ success: true, message: '已强制清空所有检测数据' });
});

// 更新流的元数据
app.post('/api/stream/update', (req, res) => {
    const { udpxyUrl, multicastUrl, update } = req.body || {};
    if (!multicastUrl || typeof update !== 'object') {
        return res.status(400).json({ success: false, message: '缺少必要参数' });
    }
    let index = -1;
    if (udpxyUrl) {
        index = multicastList.findIndex(item => item.udpxyUrl === udpxyUrl && item.multicastUrl === multicastUrl);
    }
    if (index === -1) {
        index = multicastList.findIndex(item => item.multicastUrl === multicastUrl);
    }
    if (index === -1) {
        const obj = {
            udpxyUrl,
            multicastUrl,
            isAvailable: false,
            lastChecked: new Date().toISOString()
        };
        multicastList.push(obj);
        index = multicastList.length - 1;
    }
    multicastList[index] = { ...multicastList[index], ...update };
    res.json({ success: true, stream: multicastList[index] });
});

app.post('/api/set-fcc', (req, res) => {
    const { fcc } = req.body || {};
    if (!fcc || typeof fcc !== 'string') {
        return res.status(400).json({ success: false, message: '缺少fcc参数' });
    }
    globalFcc = fcc;
    settings.globalFcc = fcc;
    const val = fcc.includes('=') ? fcc : `fcc=${fcc}`;
    multicastList = multicastList.map(s => {
        const u = String(s.multicastUrl || '').trim();
        const scheme = u.split(':')[0].toLowerCase();
        const isMulticast = !!s.udpxyUrl || scheme === 'rtp' || scheme === 'udp';
        return { ...s, httpParam: isMulticast ? val : '' };
    });
    res.json({ success: true, globalFcc: val, count: multicastList.length });
});

app.post('/api/persist/save', (req, res) => {
    const ok = persistSave();
    if (ok) return res.json({ success: true });
    res.status(500).json({ success: false, message: '保存失败' });
});

app.post('/api/persist/load', (req, res) => {
    const ok = persistLoad();
    if (ok) return res.json({ success: true, streams: multicastList, settings: { globalFcc } });
    res.status(404).json({ success: false, message: '未找到持久化文件' });
});
app.post('/api/persist/delete', (req, res) => {
    ensureDataDir();
    try {
        if (fs.existsSync(DATA_FILE)) fs.unlinkSync(DATA_FILE);
        return res.json({ success: true });
    } catch(e) { return res.status(500).json({ success: false, message: '删除失败' }); }
});
app.get('/api/persist/list', (req, res) => {
    try { return res.json({ success: true, versions: listVersions() }); } catch(e) { res.status(500).json({ success: false }); }
});
app.post('/api/persist/load-version', (req, res) => {
    const { filename } = req.body || {};
    if (!filename) return res.status(400).json({ success: false, message: '缺少filename' });
    const ok = loadVersionFile(filename);
    if (ok) return res.json({ success: true, streams: multicastList, settings });
    res.status(404).json({ success: false, message: '版本文件不存在或读取失败' });
});
app.post('/api/persist/delete-version', (req, res) => {
    const { filename } = req.body || {};
    if (!filename) return res.status(400).json({ success: false, message: '缺少filename' });
    ensureDataDir();
    const full = path.join(DATA_DIR, filename);
    try {
        if (fs.existsSync(full)) {
            fs.unlinkSync(full);
            return res.json({ success: true });
        } else {
            return res.status(404).json({ success: false, message: '文件不存在' });
        }
    } catch(e) { return res.status(500).json({ success: false, message: '删除失败' }); }
});
app.get('/api/config/logo-templates', (req, res) => {
    const defId = 'ltpl-default';
    const cfg = readJson(CFG_LOGO, { templates: [{ id: defId, name: '默认模板', url: settings.logoTemplate }], currentId: defId });
    const listRaw = Array.isArray(cfg.templates) ? cfg.templates : [];
    const listObj = listRaw.map(t => {
        if (typeof t === 'string') {
            return { id: 'ltpl-' + Math.random().toString(36).slice(2) + Date.now().toString(36), name: '未命名模板', url: t, category: '内网' };
        }
        return { id: t.id || ('ltpl-' + Math.random().toString(36).slice(2) + Date.now().toString(36)), name: t.name || '未命名模板', url: t.url || '', category: typeof t.category === 'string' ? t.category : '内网' };
    }).filter(x => x.url);
    let currId = typeof cfg.currentId === 'string' ? cfg.currentId : '';
    let currUrl = '';
    if (!currId && typeof cfg.current === 'string') {
        const it = listObj.find(x => x.url === cfg.current);
        currId = it ? it.id : '';
    }
    if (!currId && listObj[0]) currId = listObj[0].id;
    const currItem = listObj.find(x => x.id === currId) || listObj[0] || null;
    currUrl = currItem ? currItem.url : settings.logoTemplate;
    const listStr = listObj.map(x => x.url);
    res.json({ success: true, templates: listStr, current: currUrl, templatesObj: listObj, currentId: currId });
});
app.post('/api/config/logo-templates', (req, res) => {
    const { templates, current, templatesObj, currentId } = req.body || {};
    let listObj = Array.isArray(templatesObj) ? templatesObj.map(t => ({
        id: t && t.id ? t.id : ('ltpl-' + Math.random().toString(36).slice(2) + Date.now().toString(36)),
        name: t && t.name ? t.name : '未命名模板',
        url: t && t.url ? t.url : '',
        category: t && typeof t.category === 'string' ? t.category : '内网'
    })) : [];
    if (listObj.length === 0) {
        const listStr = Array.isArray(templates) ? templates : [];
        listObj = listStr.filter(u => typeof u === 'string' && u).map(u => ({
            id: 'ltpl-' + Math.random().toString(36).slice(2) + Date.now().toString(36),
            name: '未命名模板',
            url: u,
            category: '内网'
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
    writeJson(CFG_LOGO, { templates: listObj, currentId: currId });
    settings.logoTemplate = currUrl || settings.logoTemplate;
    res.json({ success: true });
});
app.get('/api/config/fcc-servers', (req, res) => {
    const cfg = readJson(CFG_FCC, { servers: settings.fccServers, currentId: '' });
    res.json({ success: true, servers: Array.isArray(cfg.servers) ? cfg.servers : [], currentId: cfg.currentId || '' });
});
app.post('/api/config/fcc-servers', (req, res) => {
    const { servers, currentId } = req.body || {};
    const list = Array.isArray(servers) ? servers : [];
    writeJson(CFG_FCC, { servers: list, currentId: typeof currentId === 'string' ? currentId : '' });
    settings.fccServers = list;
    res.json({ success: true });
});
app.get('/api/config/udpxy-servers', (req, res) => {
    const cfg = readJson(CFG_UDPXY, { servers: [], currentId: '' });
    res.json({ success: true, servers: Array.isArray(cfg.servers) ? cfg.servers : [], currentId: cfg.currentId || '' });
});
app.post('/api/config/udpxy-servers', (req, res) => {
    const { servers, currentId } = req.body || {};
    const list = Array.isArray(servers) ? servers : [];
    writeJson(CFG_UDPXY, { servers: list, currentId: typeof currentId === 'string' ? currentId : '' });
    res.json({ success: true });
});
app.get('/api/config/group-titles', (req, res) => {
    const cfg = readJson(CFG_GROUPS, { titles: settings.groupTitles });
    const raw = Array.isArray(cfg.titles) ? cfg.titles : [];
    const titlesObj = raw.map(x => {
        if (typeof x === 'string') return { name: x, color: '' };
        return { name: x && x.name ? x.name : '未命名分组', color: x && x.color ? x.color : '' };
    }).filter(x => x.name);
    const titles = titlesObj.map(x => x.name);
    res.json({ success: true, titles, titlesObj });
});
app.post('/api/config/group-titles', (req, res) => {
    const { titles, titlesObj } = req.body || {};
    let listObj = Array.isArray(titlesObj) ? titlesObj.map(x => ({
        name: x && x.name ? x.name : '未命名分组',
        color: x && x.color ? x.color : ''
    })).filter(x => x.name) : [];
    if (listObj.length === 0) {
        const names = Array.isArray(titles) ? titles : [];
        listObj = names.filter(n => typeof n === 'string' && n).map(n => ({ name: n, color: '' }));
    }
    writeJson(CFG_GROUPS, { titles: listObj });
    settings.groupTitles = listObj.map(x => x.name);
    res.json({ success: true });
});
app.get('/api/config/group-rules', (req, res) => {
    const cfg = readJson(CFG_GROUP_RULES, { rules: [] });
    const rules = Array.isArray(cfg.rules) ? cfg.rules : [];
    const normalized = rules.map(r => ({
        name: r && r.name ? r.name : '',
        matchers: Array.isArray(r && r.matchers) ? r.matchers : []
    })).filter(x => x.name);
    res.json({ success: true, rules: normalized });
});
app.post('/api/config/group-rules', (req, res) => {
    const { rules } = req.body || {};
    const list = Array.isArray(rules) ? rules.map(r => ({
        name: r && r.name ? r.name : '',
        matchers: Array.isArray(r && r.matchers) ? r.matchers.map(m => ({
            field: m && m.field ? m.field : 'name',
            op: m && m.op ? m.op : 'contains',
            value: m && m.value ? String(m.value) : ''
        })).filter(m => m.value) : []
    })).filter(x => x.name) : [];
    writeJson(CFG_GROUP_RULES, { rules: list });
    res.json({ success: true });
});
app.get('/api/settings', (req, res) => {
    res.json({ success: true, settings });
});
app.post('/api/settings/update', (req, res) => {
    const { fccServers, logoTemplate, groupTitles, globalFcc: gf, externalUrl, internalUrl, useInternal, useExternal, securityToken, enableToken, proxyList } = req.body || {};
    if (Array.isArray(fccServers)) settings.fccServers = fccServers;
    if (typeof logoTemplate === 'string') settings.logoTemplate = logoTemplate;
    if (Array.isArray(groupTitles)) settings.groupTitles = groupTitles;
    if (typeof externalUrl === 'string') settings.externalUrl = externalUrl;
    if (typeof internalUrl === 'string') settings.internalUrl = internalUrl;
    if (typeof useInternal === 'boolean') settings.useInternal = useInternal;
    if (typeof useExternal === 'boolean') settings.useExternal = useExternal;
    if (typeof securityToken === 'string') settings.securityToken = securityToken;
    if (typeof enableToken === 'boolean') settings.enableToken = enableToken;
    if (typeof externalUrl === 'string' || typeof internalUrl === 'string' || typeof useInternal === 'boolean' || typeof useExternal === 'boolean' || typeof securityToken === 'string' || typeof enableToken === 'boolean') {
        writeJson(CFG_APPSET, {
            useInternal: settings.useInternal,
            useExternal: settings.useExternal,
            internalUrl: settings.internalUrl,
            externalUrl: settings.externalUrl,
            securityToken: settings.securityToken,
            enableToken: settings.enableToken
        });
    }
    if (Array.isArray(proxyList)) {
        settings.proxyList = proxyList.map(x => ({
            type: normalizeProxyType(x && x.type),
            url: x && x.url ? x.url.trim() : ''
        })).filter(x => !!x.url);
        writeJson(CFG_PROXY, { list: settings.proxyList });
    }
    if (typeof gf === 'string') {
        globalFcc = gf;
        settings.globalFcc = gf;
        const val = gf.includes('=') ? gf : `fcc=${gf}`;
        multicastList = multicastList.map(s => ({ ...s, httpParam: val }));
    }
    res.json({ success: true, settings });
});
app.post('/api/settings/rename-group', (req, res) => {
    const { from, to } = req.body || {};
    if (!from || !to) return res.status(400).json({ success: false, message: '缺少分组名称' });
    let updated = 0;
    multicastList = multicastList.map(s => {
        if ((s.groupTitle || '') === from) {
            updated++;
            return { ...s, groupTitle: to };
        }
        return s;
    });
    if (Array.isArray(settings.groupTitles)) {
        const idx = settings.groupTitles.findIndex(g => g === from);
        if (idx !== -1) settings.groupTitles[idx] = to;
    }
    res.json({ success: true, updated, groupTitles: settings.groupTitles });
});

// 代理列表配置
app.get('/api/config/proxies', (req, res) => {
    const cfg = readJson(CFG_PROXY, { list: settings.proxyList });
    res.json({ success: true, list: Array.isArray(cfg.list) ? cfg.list : [] });
});
app.post('/api/config/proxies', (req, res) => {
    const { list } = req.body || {};
    const arr = Array.isArray(list) ? list.map(x => ({
        type: normalizeProxyType(x && x.type),
        url: x && x.url ? x.url.trim() : ''
    })).filter(x => !!x.url) : [];
    writeJson(CFG_PROXY, { list: arr });
    settings.proxyList = arr;
    res.json({ success: true });
});

app.get('/api/config/app-settings', (req, res) => {
    const cfg = readJson(CFG_APPSET, {
        useInternal: settings.useInternal,
        useExternal: settings.useExternal,
        internalUrl: settings.internalUrl,
        externalUrl: settings.externalUrl,
        securityToken: settings.securityToken,
        enableToken: settings.enableToken
    });
    res.json({ success: true, appSettings: cfg });
});
app.post('/api/config/app-settings', (req, res) => {
    const { useInternal, useExternal, internalUrl, externalUrl, securityToken, enableToken } = req.body || {};
    if (typeof useInternal === 'boolean') settings.useInternal = useInternal;
    if (typeof useExternal === 'boolean') settings.useExternal = useExternal;
    if (typeof internalUrl === 'string') settings.internalUrl = internalUrl.trim();
    if (typeof externalUrl === 'string') settings.externalUrl = externalUrl.trim();
    if (typeof securityToken === 'string') settings.securityToken = securityToken.trim();
    if (typeof enableToken === 'boolean') settings.enableToken = enableToken;
    writeJson(CFG_APPSET, {
        useInternal: settings.useInternal,
        useExternal: settings.useExternal,
        internalUrl: settings.internalUrl,
        externalUrl: settings.externalUrl,
        securityToken: settings.securityToken,
        enableToken: settings.enableToken
    });
    res.json({ success: true });
});
app.get('/api/config/epg-sources', (req, res) => {
  const cfg = readJson(CFG_EPG, { sources: [] });
  const list = Array.isArray(cfg.sources) ? cfg.sources : [];
  const normalized = list.map(x => ({
    id: x && x.id ? x.id : ('epg-' + Math.random().toString(36).slice(2) + Date.now().toString(36)),
    name: x && x.name ? x.name : '未命名EPG',
    url: x && x.url ? x.url : '',
    scope: (x && x.scope === '外网') ? '外网' : '内网'
  })).filter(x => !!x.url);
  res.json({ success: true, sources: normalized });
});
app.post('/api/config/epg-sources', (req, res) => {
  const { sources } = req.body || {};
  const list = Array.isArray(sources) ? sources.map(x => ({
    id: x && x.id ? x.id : ('epg-' + Math.random().toString(36).slice(2) + Date.now().toString(36)),
    name: x && x.name ? x.name : '未命名EPG',
    url: x && x.url ? x.url : '',
    scope: (x && x.scope === '外网') ? '外网' : '内网'
  })).filter(x => !!x.url) : [];
  writeJson(CFG_EPG, { sources: list });
  res.json({ success: true });
});

// 简单流代理（用于HLS播放跨域绕过）
app.get('/api/proxy/stream', async (req, res) => {
    try {
        const url = String(req.query.url || '').trim();
        if (!/^https?:\/\//i.test(url)) {
            return res.status(400).send('invalid url');
        }
        const hdrs = {};
        ['range','referer','user-agent','origin','accept','accept-encoding','accept-language','cookie'].forEach(h => {
            const v = req.headers[h];
            if (v) hdrs[h] = v;
        });
        const resp = await axios.get(url, { responseType: 'stream', headers: hdrs, validateStatus: () => true });
        res.status(resp.status);
        const ct = resp.headers && (resp.headers['content-type'] || resp.headers['Content-Type']);
        if (ct) res.set('Content-Type', ct);
        const ar = resp.headers && (resp.headers['accept-ranges'] || resp.headers['Accept-Ranges']);
        if (ar) res.set('Accept-Ranges', ar);
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Access-Control-Expose-Headers', '*');
        resp.data.pipe(res);
    } catch (e) {
        res.status(502).send('proxy error');
    }
});

// 系统信息接口
app.get('/api/system/info', (req, res) => {
    // 简单判断是否在Docker容器中：检查 /.dockerenv 文件
    const isDocker = fs.existsSync('/.dockerenv') || fs.existsSync('/run/.containerenv');
    res.json({
        success: true,
        version: packageJson.version,
        author: 'cgg888', // 暂时硬编码，也可以从 package.json 获取
        isDocker
    });
});

// 系统更新接口
app.post('/api/system/update', (req, res) => {
    // 简单判断是否在Docker容器中
    const isDocker = fs.existsSync('/.dockerenv') || fs.existsSync('/run/.containerenv');
    // 检查是否挂载了 .git 目录（开发模式）
    const hasGit = fs.existsSync(path.join(__dirname, '../.git'));
    
    if (isDocker && !hasGit) {
        return res.json({ success: false, message: 'Docker 环境请手动拉取新镜像更新：docker-compose pull && docker-compose up -d' });
    }

    // 本地源码更新：执行 git pull
    // 注意：需要系统安装了 git，且当前目录是 git 仓库
    exec('git pull', { cwd: path.join(__dirname, '../') }, (error, stdout, stderr) => {
        if (error) {
            console.error(`更新失败: ${error}`);
            return res.json({ success: false, message: `更新失败: ${error.message}` });
        }
        console.log(`git pull output: ${stdout}`);
        // 更新成功后，理论上需要重启服务。
        // 这里返回成功，由前端提示用户重启或刷新
        res.json({ success: true, message: '更新成功，请手动重启服务生效！\n' + stdout });
    });
});

// 提供前端页面
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});
app.get('/results', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/results.html'));
});

app.listen(port, () => {
    console.log(`服务器运行在 http://localhost:${port}`);
});
