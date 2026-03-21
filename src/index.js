const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const path = require('path');
const compression = require('compression');
const logger = require('./core/logger');
const config = require('./config');
const authRoutes = require('./routes/auth');
const streamRoutes = require('./routes/stream');
const exportRoutes = require('./routes/export');
const proxyRoutes = require('./routes/proxy');
const configRoutes = require('./routes/config');
const persistRoutes = require('./routes/persist');
const systemRoutes = require('./routes/system');
const logsRoutes = require('./routes/logs');
const webdavRoutes = require('./routes/webdav');
const epgRoutes = require('./routes/epg');
const catchupRoutes = require('./routes/catchup');
const playerRoutes = require('./routes/player');
const cdnRoutes = require('./routes/cdn');
const contributionsRoutes = require('./routes/contributions');
const storage = require('./storage');
const streamsReader = require('./storage/streams-reader');
const configReader = require('./storage/config-reader');
const logMask = require('./utils/log-mask');
const governance = require('./middleware/governance');
const opsObservability = require('./services/ops-observability');

const app = express();
const port = process.env.PORT || 3000;

// 全局状态变量
let multicastList = [];
let settings = {
    globalFcc: '',
    fccServers: [],
    logoTemplate: '',
    groupTitles: ['默认'],
    externalUrl: '',
    internalUrl: '',
    useInternal: false,
    useExternal: false,
    securityToken: '',
    enableToken: false,
    proxyList: [],
    webdavUrl: '',
    webdavUser: '',
    webdavPass: '',
    webdavRoot: '/',
    webdavInsecure: false
};

function pickLogoTemplate(logoCfg, appSettings) {
    const templates = Array.isArray(logoCfg && logoCfg.templates) ? logoCfg.templates : [];
    const currentId = String(appSettings && appSettings.logoTemplateCurrentId ? appSettings.logoTemplateCurrentId : logoCfg && logoCfg.currentId ? logoCfg.currentId : '');
    const byId = templates.find((t) => String(t && t.id ? t.id : '') === currentId);
    if (byId && byId.url) return String(byId.url);
    const first = templates.find((t) => t && t.url);
    if (first && first.url) return String(first.url);
    return settings.logoTemplate;
}

async function hydrateConfigsFromSqlite(appSettingsSnapshot = {}) {
    const fccRaw = config.getConfig('fccServers') || { servers: [], currentId: '' };
    const fccCfg = await configReader.loadFccServersFallback(fccRaw);
    const fccCurrentId = String(appSettingsSnapshot.fccCurrentId || fccCfg.currentId || '');
    config.updateConfig('fccServers', { servers: Array.isArray(fccCfg.servers) ? fccCfg.servers : [], currentId: fccCurrentId });

    const udpxyRaw = config.getConfig('udpxyServers') || { servers: [], currentId: '' };
    const udpxyCfg = await configReader.loadUdpxyServersFallback(udpxyRaw);
    const udpxyCurrentId = String(appSettingsSnapshot.udpxyCurrentId || udpxyCfg.currentId || '');
    config.updateConfig('udpxyServers', { servers: Array.isArray(udpxyCfg.servers) ? udpxyCfg.servers : [], currentId: udpxyCurrentId });

    const logoRaw = config.getConfig('logoTemplates') || { templates: [], currentId: '' };
    const logoCfg = await configReader.loadLogoTemplatesFallback(logoRaw);
    const logoCurrentId = String(appSettingsSnapshot.logoTemplateCurrentId || logoCfg.currentId || '');
    config.updateConfig('logoTemplates', { templates: Array.isArray(logoCfg.templates) ? logoCfg.templates : [], currentId: logoCurrentId });

    const groupTitlesRaw = config.getConfig('groupTitles') || { titles: [] };
    const groupTitlesCfg = await configReader.loadGroupTitlesFallback(groupTitlesRaw);
    config.updateConfig('groupTitles', { titles: Array.isArray(groupTitlesCfg.titles) ? groupTitlesCfg.titles : [] });

    const groupRulesRaw = config.getConfig('groupRules') || { rules: [] };
    const groupRulesCfg = await configReader.loadGroupRulesFallback(groupRulesRaw);
    config.updateConfig('groupRules', { rules: Array.isArray(groupRulesCfg.rules) ? groupRulesCfg.rules : [] });

    const proxyRaw = config.getConfig('proxyServers') || { list: [] };
    const proxyCfg = await configReader.loadProxyServersFallback(proxyRaw);
    config.updateConfig('proxyServers', { list: Array.isArray(proxyCfg.list) ? proxyCfg.list : [] });

    const epgRaw = config.getConfig('epgSources') || { sources: [] };
    const epgCfg = await configReader.loadEpgSourcesFallback(epgRaw);
    config.updateConfig('epgSources', { sources: Array.isArray(epgCfg.sources) ? epgCfg.sources : [] });

    const usersRaw = config.getConfig('users') || { username: 'admin', passwordHash: '' };
    const usersCfg = await configReader.loadUsersFallback(usersRaw);
    config.updateConfig('users', usersCfg || usersRaw);

    const groupTitlesNameList = (Array.isArray(groupTitlesCfg.titles) ? groupTitlesCfg.titles : [])
        .map((x) => (typeof x === 'string' ? x : String(x && x.name ? x.name : '')))
        .filter((x) => x);
    settings = {
        ...settings,
        fccServers: Array.isArray(fccCfg.servers) ? fccCfg.servers : [],
        groupTitles: groupTitlesNameList.length > 0 ? groupTitlesNameList : settings.groupTitles,
        proxyList: Array.isArray(proxyCfg.list) ? proxyCfg.list : [],
        logoTemplate: pickLogoTemplate(logoCfg, appSettingsSnapshot)
    };

    logger.info('启动阶段配置已从SQLite回填到内存', 'Storage', {
        fcc: Array.isArray(fccCfg.servers) ? fccCfg.servers.length : 0,
        udpxy: Array.isArray(udpxyCfg.servers) ? udpxyCfg.servers.length : 0,
        logo: Array.isArray(logoCfg.templates) ? logoCfg.templates.length : 0,
        groupTitles: Array.isArray(groupTitlesCfg.titles) ? groupTitlesCfg.titles.length : 0,
        groupRules: Array.isArray(groupRulesCfg.rules) ? groupRulesCfg.rules.length : 0,
        proxy: Array.isArray(proxyCfg.list) ? proxyCfg.list.length : 0,
        epg: Array.isArray(epgCfg.sources) ? epgCfg.sources.length : 0
    });
}

// 初始化持久化模块
persistRoutes.setupPersistModule(
    () => multicastList,
    (streams) => { multicastList = streams; },
    () => settings,
    (newSettings) => { settings = { ...settings, ...newSettings }; }
);

// 请求日志中间件
app.use(governance.requestContext);
app.use(governance.attachResponseHelpers);
app.use((req, res, next) => {
    const start = Date.now();
    const { method, originalUrl, ip } = req;
    
    const originalEnd = res.end;
    res.end = function(...args) {
        const duration = Date.now() - start;
        const status = res.statusCode;
        const skip = originalUrl.includes('.js') || originalUrl.includes('.css') || originalUrl.startsWith('/img') || originalUrl.startsWith('/vendor');
        if (!skip) {
            const mod = req.domain || governance.resolveDomain(originalUrl || '');
            const safeUrl = logMask.maskText(originalUrl);
            const msg = `${method} ${safeUrl} ${status} ${duration}ms ${ip}`;
            if (status >= 500) logger.error(msg, mod, null, req.reqId || '');
            else if (status >= 400) logger.warn(msg, mod, null, req.reqId || '');
            else logger.info(msg, mod, null, req.reqId || '');
            opsObservability.recordRequest(mod, status, duration, safeUrl);
        }
        originalEnd.apply(res, args);
    };
    next();
});

// 中间件
app.use(cors());
app.use(bodyParser.json());
app.use(cookieParser());

// 压缩中间件
app.use(compression({ filter: (req, res) => {
    const type = res.getHeader('Content-Type') || '';
    if (String(req.path || '').startsWith('/api/logs/stream')) return false;
    if (String(req.path || '').startsWith('/api/proxy/')) return false;
    return /json|text|javascript|svg|xml|css|html/i.test(String(type));
}}));

// 静态文件服务
app.use('/vendor', express.static(path.join(__dirname, '../public/vendor'), { maxAge: '30d', immutable: true }));
app.use('/docs', express.static(path.join(__dirname, '../docs')));

// favicon
app.get('/favicon.ico', async (req, res) => {
    try {
        const iconPath = path.join(__dirname, '../public/Sentinel.png');
        await require('fs').promises.access(iconPath);
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
        res.sendFile(iconPath);
    } catch (e) {
        res.status(404).end();
    }
});

app.use(authRoutes.requireAuth);

// 静态文件
app.use(express.static('public', {
    maxAge: '7d',
    setHeaders: (res, p) => {
        if (p.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
            res.setHeader('Pragma', 'no-cache');
            res.setHeader('Expires', '0');
        }
    }
}));

// API路由
app.use('/api', authRoutes.router);
app.use('/api', streamRoutes);
app.use('/api', exportRoutes);
app.use('/api', proxyRoutes);
app.use('/api', configRoutes);
app.use('/api/persist', persistRoutes.router);
app.use('/api', systemRoutes);
app.use('/api', logsRoutes);
app.use('/api', cdnRoutes);
app.use('/api', contributionsRoutes);
app.use('/api', webdavRoutes);
app.use('/api', epgRoutes);
app.use('/api', catchupRoutes);
app.use('/api', playerRoutes);

// 提供前端页面
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.get('/results', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/results.html'));
});

// 全局错误处理
app.use((err, req, res, next) => {
    const domain = (req && req.domain) || 'App';
    const reqId = (req && req.reqId) || '';
    logger.error(`未捕获异常: ${err && err.stack ? err.stack : err}`, domain, null, reqId);
    if (res && typeof res.apiFail === 'function') {
        return res.apiFail('服务器内部错误', 500);
    }
    res.status(500).json({ success: false, message: '服务器内部错误' });
});

async function bootstrap() {
    try {
        await storage.init();
        let sqliteStreams = await streamsReader.readStreamsFromSqlite();
        const memoryStreamsCfg = config.getConfig('streams') || { streams: [], settings: {} };
        const memoryStreams = Array.isArray(memoryStreamsCfg.streams) ? memoryStreamsCfg.streams : [];
        if ((!Array.isArray(sqliteStreams) || sqliteStreams.length === 0) && Array.isArray(memoryStreams) && memoryStreams.length > 0) {
            await storage.syncConfig('streams', {
                streams: memoryStreams,
                settings: memoryStreamsCfg.settings || {}
            });
            sqliteStreams = await streamsReader.readStreamsFromSqlite();
        }
        if (Array.isArray(sqliteStreams)) {
            const streamsCfg = config.getConfig('streams') || { streams: [], settings: {} };
            config.updateConfig('streams', { ...streamsCfg, streams: sqliteStreams });
            multicastList = sqliteStreams;
            const globalFcc = (streamsCfg.settings && streamsCfg.settings.globalFcc) ? streamsCfg.settings.globalFcc : '';
            if (globalFcc) settings.globalFcc = globalFcc;
        }
        const appSettingsMemory = config.getConfig('appSettings') || {};
        const appSettingsMerged = await configReader.loadAppSettingsFallback(appSettingsMemory);
        if (appSettingsMerged && typeof appSettingsMerged === 'object') {
            const nextAppSettings = { ...appSettingsMemory, ...appSettingsMerged, storageMode: 'sqlite' };
            if (typeof nextAppSettings.securityToken === 'string' && nextAppSettings.securityToken.startsWith('enc:v1:') && typeof config.decryptSecret === 'function') {
                nextAppSettings.securityToken = config.decryptSecret(nextAppSettings.securityToken) || '';
            }
            if (typeof nextAppSettings.webdavPass === 'string' && nextAppSettings.webdavPass.startsWith('enc:v1:') && typeof config.decryptSecret === 'function') {
                nextAppSettings.webdavPass = config.decryptSecret(nextAppSettings.webdavPass) || '';
            }
            config.updateConfig('appSettings', nextAppSettings);
            settings = { ...settings, ...nextAppSettings };
            await hydrateConfigsFromSqlite(nextAppSettings);
        }
    } catch (e) {
        logger.error(`SQLite初始化异常，继续以JSON模式运行: ${e.message}`, 'Storage');
    }
    app.listen(port, () => {
        logger.info(`服务器启动成功，运行在 http://localhost:${port}`);
    });
}

bootstrap();
