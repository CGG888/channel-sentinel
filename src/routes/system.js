const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const packageJson = require('../../package.json');
const config = require('../config');
const streamsReader = require('../storage/streams-reader');
const configReader = require('../storage/config-reader');
const storageMode = require('../storage/mode');
const storage = require('../storage');
const logger = require('../core/logger');
const replayRules = require('../services/replay-rules');
const replayRulesRemote = require('../services/replay-rules-remote');
const opsObservability = require('../services/ops-observability');
const { wrapAsync } = require('../middleware/governance');
const DATA_DIR = path.join(__dirname, '../../data');
const STREAMS_FILE = path.join(DATA_DIR, 'streams.json');

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

// 系统信息接口
route('get', '/system/info', async (req, res) => {
    // 简单判断是否在Docker容器中：检查 /.dockerenv 文件
    const isDocker = fs.existsSync('/.dockerenv') || fs.existsSync('/run/.containerenv');
    return apiSuccess(res, {
        version: packageJson.version,
        author: 'cgg888',
        isDocker
    });
});

route('get', '/system/storage-status', async (req, res) => {
    try {
        const streams = (config.getConfig('streams') || {}).streams || [];
        const reconcile = await streamsReader.reconcileStreamsWithMemory(streams);
        const configReconcile = await configReader.reconcileConfigWithMemory({
            epgSources: config.getConfig('epgSources') || { sources: [] },
            proxyServers: config.getConfig('proxyServers') || { list: [] },
            fccServers: config.getConfig('fccServers') || { servers: [] },
            udpxyServers: config.getConfig('udpxyServers') || { servers: [] },
            groupTitles: config.getConfig('groupTitles') || { titles: [] },
            groupRules: config.getConfig('groupRules') || { rules: [] },
            logoTemplates: config.getConfig('logoTemplates') || { templates: [] }
        });
        const queueMetrics = typeof storage.snapshotMetrics === 'function' ? storage.snapshotMetrics() : null;
        return apiSuccess(res, {
            readMode: streamsReader.getReadMode(),
            writeMode: storageMode.getStorageMode(),
            reconcile,
            configReconcile,
            queueMetrics,
            needsRepair: !!(reconcile && reconcile.ok && reconcile.memory && reconcile.sqlite && reconcile.memory.count > 0 && reconcile.sqlite.count === 0)
        });
    } catch (e) {
        return apiFail(res, e.message || 'storage status error', 500, {
            readMode: streamsReader.getReadMode(),
            writeMode: storageMode.getStorageMode()
        });
    }
});

route('get', '/system/storage-metrics', async (req, res) => {
    const queueMetrics = typeof storage.snapshotMetrics === 'function' ? storage.snapshotMetrics() : null;
    return apiSuccess(res, {
        readMode: streamsReader.getReadMode(),
        writeMode: storageMode.getStorageMode(),
        queueMetrics
    });
});

route('post', '/system/storage-repair', async (req, res) => {
    try {
        await storage.init(config.getAllConfigs());
        const before = await streamsReader.reconcileStreamsWithMemory((config.getConfig('streams') || {}).streams || []);
        await storage.syncAll(config.getAllConfigs());
        const after = await streamsReader.reconcileStreamsWithMemory((config.getConfig('streams') || {}).streams || []);
        return apiSuccess(res, {
            readMode: streamsReader.getReadMode(),
            writeMode: storageMode.getStorageMode(),
            before,
            after
        });
    } catch (e) {
        req.log.error(`存储修复失败: ${e.message}`);
        return apiFail(res, e.message || 'storage repair error', 500, {
            readMode: streamsReader.getReadMode(),
            writeMode: storageMode.getStorageMode()
        });
    }
});

route('post', '/system/import-legacy', async (req, res) => {
    const sourceDir = String((req.body && req.body.sourceDir) || '').trim();
    const targetDir = sourceDir || DATA_DIR;

    // 验证目录存在
    if (!fs.existsSync(targetDir)) {
        return apiFail(res, '数据目录不存在：' + targetDir, 400);
    }

    // 读取旧 JSON 文件
    function readJson(name, fallback) {
        const f = path.join(targetDir, name);
        try {
            if (fs.existsSync(f)) {
                return JSON.parse(fs.readFileSync(f, 'utf-8'));
            }
        } catch (e) {
            req.log.warn(`读取旧数据文件失败 ${name}: ${e.message}`);
        }
        return fallback;
    }

    const streamsData = readJson('streams.json', null);
    const streamsCount = Array.isArray(streamsData && streamsData.streams) ? streamsData.streams.length : 0;

    if (streamsCount === 0) {
        return apiFail(res, '未找到可导入的频道数据（streams.json 为空或不存在）', 400);
    }

    try {
        // 构建迁移配置对象，字段映射与 ConfigManager 格式一致
        const configs = {
            streams: streamsData || { streams: [], settings: {} },
            appSettings: readJson('app_settings.json', {}),
            logoTemplates: readJson('logo_templates.json', { templates: [], currentId: '' }),
            fccServers: readJson('fcc_servers.json', { servers: [], currentId: '' }),
            udpxyServers: readJson('udpxy_servers.json', { servers: [], currentId: '' }),
            groupTitles: readJson('group_titles.json', { titles: [] }),
            groupRules: readJson('group_rules.json', { rules: [] }),
            epgSources: readJson('epg_sources.json', { sources: [] }),
            proxyServers: readJson('proxy_servers.json', { list: [] }),
            users: readJson('users.json', { username: 'admin', passwordHash: '' })
        };

        await storage.init(configs);

        // 清理 streams 中的冗余 raw 字段（SQLite 无此列）
        if (configs.streams && Array.isArray(configs.streams.streams)) {
            configs.streams.streams.forEach(s => {
                if (s.raw) delete s.raw;
            });
        }

        await storage.syncAll(configs);

        const after = await streamsReader.reconcileStreamsWithMemory(
            (config.getConfig('streams') || {}).streams || []
        );

        return apiSuccess(res, {
            sourceDir: targetDir,
            imported: {
                streams: streamsCount,
                appSettings: Object.keys(configs.appSettings).length,
                logoTemplates: (configs.logoTemplates && configs.logoTemplates.templates || []).length,
                fccServers: (configs.fccServers && configs.fccServers.servers || []).length,
                udpxyServers: (configs.udpxyServers && configs.udpxyServers.servers || []).length,
                groupTitles: (configs.groupTitles && configs.groupTitles.titles || []).length,
                groupRules: (configs.groupRules && configs.groupRules.rules || []).length,
                epgSources: (configs.epgSources && configs.epgSources.sources || []).length,
                proxyServers: (configs.proxyServers && configs.proxyServers.list || []).length
            },
            reconcile: after
        });
    } catch (e) {
        req.log.error(`旧数据导入失败: ${e.message}`);
        return apiFail(res, '导入失败：' + e.message, 500);
    }
});

route('get', '/system/replay-rules/status', async (req, res) => {
    try {
        const status = replayRules.getStatus();
        return apiSuccess(res, status);
    } catch (e) {
        return apiFail(res, e.message || 'replay rules status error', 500);
    }
});

route('get', '/system/replay-rules/snapshots', async (req, res) => {
    try {
        const limit = Math.max(1, Math.min(parseInt(String(req.query.limit || '20'), 10) || 20, 100));
        const snapshots = replayRules.getSnapshots(limit);
        return apiSuccess(res, { snapshots });
    } catch (e) {
        return apiFail(res, e.message || 'replay rules snapshots error', 500);
    }
});

route('post', '/system/replay-rules/snapshot', async (req, res) => {
    try {
        const reason = String((req.body && req.body.reason) || 'manual').trim() || 'manual';
        const snapshot = replayRules.createSnapshot(reason);
        req.log.info(`回放规则快照已创建: ${snapshot.snapshotId}`);
        return apiSuccess(res, { snapshot });
    } catch (e) {
        req.log.error(`创建回放规则快照失败: ${e.message}`);
        return apiFail(res, e.message || 'create snapshot failed', 500);
    }
});

route('post', '/system/replay-rules/rollback', async (req, res) => {
    try {
        const snapshotId = String((req.body && req.body.snapshotId) || '').trim();
        const rollback = replayRules.rollbackToSnapshot(snapshotId);
        if (!rollback.success) {
            return apiFail(res, rollback.message || 'rollback failed', 400);
        }
        req.log.warn(`回放规则已回滚到快照: ${rollback.snapshotId}`);
        return apiSuccess(res, rollback);
    } catch (e) {
        req.log.error(`回放规则回滚失败: ${e.message}`);
        return apiFail(res, e.message || 'rollback failed', 500);
    }
});

route('get', '/system/replay-rules/hits', async (req, res) => {
    try {
        const limit = Math.max(1, Math.min(parseInt(String(req.query.limit || '100'), 10) || 100, 500));
        const hitLogs = replayRules.getHitLogs(limit);
        return apiSuccess(res, { count: hitLogs.length, hitLogs });
    } catch (e) {
        return apiFail(res, e.message || 'replay hits error', 500);
    }
});

route('get', '/system/replay-rules/catalog', async (req, res) => {
    try {
        const catalog = replayRules.getCatalog();
        return apiSuccess(res, catalog);
    } catch (e) {
        return apiFail(res, e.message || 'replay rules catalog error', 500);
    }
});

route('get', '/system/replay-rules/selection', async (req, res) => {
    try {
        const selection = replayRules.getSelection();
        return apiSuccess(res, { selection });
    } catch (e) {
        return apiFail(res, e.message || 'replay rules selection error', 500);
    }
});

route('post', '/system/replay-rules/selection', async (req, res) => {
    try {
        const body = req.body || {};
        const selection = replayRules.updateSelection({
            base: body.base || {},
            time: body.time || {},
            proxy: body.proxy || {}
        });
        return apiSuccess(res, { selection });
    } catch (e) {
        return apiFail(res, e.message || 'replay rules selection update error', 500);
    }
});

route('get', '/system/ops/dashboard', async (req, res) => {
    const metrics = opsObservability.getDomainMetrics();
    const incidents = opsObservability.getIncidentSummary(100);
    return apiSuccess(res, {
        generatedAt: new Date().toISOString(),
        metrics,
        incidents
    });
});

route('get', '/system/ops/sop', async (req, res) => {
    const domain = String(req.query.domain || '').trim();
    if (!domain) {
        return apiSuccess(res, { sops: opsObservability.getAllSops() });
    }
    return apiSuccess(res, { sop: opsObservability.getSopByDomain(domain) });
});

route('get', '/system/ops/low-frequency-governance', async (req, res) => {
    const whitelist = String(req.query.whitelist || '').trim();
    const lowRequestThreshold = Number(req.query.lowRequestThreshold || 30);
    const latencyThresholdMs = Number(req.query.latencyThresholdMs || 3000);
    const governance = opsObservability.getLowFrequencyGovernance({
        whitelist,
        lowRequestThreshold,
        latencyThresholdMs
    });
    return apiSuccess(res, { governance });
});

route('post', '/system/ops/incident', async (req, res) => {
    const body = req.body || {};
    const summary = String(body.summary || '').trim();
    if (!summary) {
        return apiFail(res, 'summary 不能为空', 400);
    }
    const incident = opsObservability.openIncident({
        domain: body.domain,
        severity: body.severity,
        summary,
        source: body.source || 'manual'
    });
    req.log.warn(`运维事件已创建: ${incident.id}`, { domain: incident.domain, severity: incident.severity });
    return apiSuccess(res, { incident }, 201);
});

route('post', '/system/ops/incident/:id/resolve', async (req, res) => {
    const incident = opsObservability.resolveIncident(req.params.id, String((req.body && req.body.note) || ''));
    if (!incident) {
        return apiFail(res, 'incident 不存在', 404);
    }
    req.log.info(`运维事件已关闭: ${incident.id}`, { domain: incident.domain });
    return apiSuccess(res, { incident });
});

// 系统更新接口
route('post', '/system/update', async (req, res) => {
    req.log.info('收到系统更新请求');
    
    const isDocker = fs.existsSync('/.dockerenv') || fs.existsSync('/run/.containerenv');
    const cwd = path.join(__dirname, '../../');
    const hasGit = fs.existsSync(path.join(cwd, '.git'));
    
    if (isDocker && !hasGit) {
        req.log.warn('Docker环境无.git挂载，无法自动更新');
        return apiFail(res, 'Docker 环境请手动拉取新镜像更新：docker-compose pull && docker-compose up -d', 400);
    }
    
    const run = (cmd) => new Promise((resolve, reject) => {
        exec(cmd, { cwd }, (error, stdout, stderr) => {
            if (error) return reject(new Error(stderr || error.message));
            resolve((stdout || '').trim());
        });
    });
    
    const targetTag = String((req.body && req.body.targetTag) || '').trim();
    const remoteUrl = 'https://github.com/cgg888/channel-sentinel.git';
    
    try {
        await run('git --version');
    } catch (e) {
        return apiFail(res, '未检测到 git，请先在系统安装 Git 后再尝试更新。', 400);
    }
    
    try {
        await run('git rev-parse --is-inside-work-tree');
    } catch (e) {
        return apiFail(res, '当前目录不是 Git 仓库，无法自动更新。请使用 Docker 镜像或 git clone 部署。', 400);
    }
    
    try {
        let cur = '';
        try { 
            cur = await run('git remote get-url origin'); 
        } catch(e){}
        
        if (!cur) {
            await run(`git remote add origin ${remoteUrl}`);
        } else if (cur.indexOf('cgg888/channel-sentinel') === -1) {
            await run(`git remote set-url origin ${remoteUrl}`);
        }
        
        await run('git fetch origin --tags --prune');
    } catch (e) {
        return apiFail(res, '获取远程失败：' + e.message, 500);
    }
    
    // 若指定了目标 tag，直接切换到该版本，跳过上游分支设置
    if (targetTag && /^v?\d+\.\d+\.\d+/.test(targetTag)) {
        try {
            const tag = targetTag.replace(/^v/i, 'v');
            // 先尝试将工作区非提交内容保存到 stash，避免"untracked would be overwritten"错误
            let stashMsg = '';
            try {
                const ts = new Date().toISOString().replace(/[:.]/g, '-');
                stashMsg = await run(`git stash push -u -m "auto-update-backup ${ts}"`) || '';
            } catch(e) {
                // 忽略 stash 失败，继续尝试强制切换
            }
            
            await run(`git checkout -f -B release tags/${tag}`);
            const rev = await run('git rev-parse --short HEAD');
            const tip = stashMsg ? '\n已将本地未提交改动保存到 git stash（auto-update-backup），如需恢复可手动 git stash list/apply。' : '';
            
            return apiSuccess(res, { message: '已切换到版本 ' + tag + '（' + rev + '）。请手动重启服务生效。' + tip });
        } catch (e) {
            return apiFail(res, '切换到目标版本失败：' + e.message, 500);
        }
    }
    
    let branch = 'main';
    try { 
        branch = (await run('git rev-parse --abbrev-ref HEAD')) || 'main'; 
    } catch(e){}
    
    let hasUpstream = true;
    try { 
        await run('git rev-parse --abbrev-ref --symbolic-full-name @{u}'); 
    } catch(e){ 
        hasUpstream = false; 
    }
    
    if (!hasUpstream) {
        try {
            const remotes = (await run('git remote')) || '';
            if (!/\borigin\b/m.test(remotes)) {
                return apiFail(res, '未配置 origin 远程，无法自动更新。请先配置远程仓库。', 400);
            }
            
            await run('git fetch origin --prune');
            let upstream = '';
            
            try {
                const m = await run('git ls-remote --heads origin main');
                if (m && m.length) upstream = 'main';
            } catch(e){}
            
            if (!upstream) {
                try {
                    const ms = await run('git ls-remote --heads origin master');
                    if (ms && ms.length) upstream = 'master';
                } catch(e){}
            }
            
            if (!upstream) {
                return apiFail(res, '无法检测到 origin/main 或 origin/master。请检查远程分支后再试。', 400);
            }
            
            try { 
                await run(`git branch --set-upstream-to=origin/${upstream} ${branch}`); 
            } catch(e){ 
                await run(`git branch --set-upstream-to=origin/${upstream}`); 
            }
        } catch (e) {
            return apiFail(res, '设置上游分支失败：' + e.message, 500);
        }
    }
    
    try {
        const stdout = await run('git pull --ff-only');
        return apiSuccess(res, { message: '更新成功，请手动重启服务生效！\n' + stdout });
    } catch (e) {
        return apiFail(res, '更新失败：' + e.message, 500);
    }
});

// 远程规则更新接口
route('get', '/replay-rules/check-update', async (req, res) => {
    try {
        const result = await replayRulesRemote.checkForUpdate();
        return apiSuccess(res, result);
    } catch (e) {
        return apiFail(res, e.message || 'check update failed', 500);
    }
});

route('post', '/replay-rules/apply-remote', async (req, res) => {
    try {
        const version = String((req.body && req.body.version) || '').trim();
        if (!version) {
            return apiFail(res, 'version is required', 400);
        }
        const result = await replayRulesRemote.applyRemoteRules(version);
        if (result.success) {
            return apiSuccess(res, result);
        }
        return apiFail(res, result.message || 'apply failed', 400);
    } catch (e) {
        return apiFail(res, e.message || 'apply remote rules failed', 500);
    }
});

route('get', '/replay-rules/library', async (req, res) => {
    try {
        const result = await replayRulesRemote.getRulesLibrary();
        if (result.success) {
            return apiSuccess(res, result.library);
        }
        return apiFail(res, result.message || 'get library failed', 500);
    } catch (e) {
        return apiFail(res, e.message || 'get library failed', 500);
    }
});

module.exports = router;
