/**
 * 远程规则服务
 * 通过 Cloudflare Worker 代理获取 GitHub 规则文件
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const storage = require('../storage');
const cdnManager = require('./cdn-manager');

// Cloudflare Worker 地址
const WORKER_BASE_URL = process.env.GITHUB_OAUTH_WORKER_URL || 'https://github-oauth.channel-sentinel.top';

// GitHub 仓库信息
const GITHUB_OWNER = 'CGG888';
const GITHUB_REPO = 'channel-sentinel';
const RULES_BRANCH = 'main';

/**
 * 计算文件 SHA256 哈希值
 */
function computeFileHash(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
    } catch (e) {
        return null;
    }
}

/**
 * 获取当前本地状态（从 state 文件读取）
 */
function getLocalState() {
    try {
        const replayRules = require('./replay-rules');
        const state = replayRules.stateManager.loadState();
        if (!state || !state.current) return null;
        return {
            baseRulesVersion: state.current.baseRulesVersion || '',
            timeRulesVersion: state.current.timeRulesVersion || '',
            baseRulesHash: state.current.baseRulesHash || '',
            timeRulesHash: state.current.timeRulesHash || '',
            updatedAt: state.current.updatedAt || ''
        };
    } catch (e) {
        console.error('[RemoteRules] getLocalState error:', e);
        return null;
    }
}

/**
 * 获取远程 rules.json 索引
 */
async function fetchRulesIndex() {
    const rulesIndexUrl = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${RULES_BRANCH}/rules/rules.json`;

    try {
        // 1. 尝试使用 CDN 获取
        try {
            const response = await cdnManager.fetchViaCdn(rulesIndexUrl, {
                headers: { 'Accept': 'application/json' }
            });

            if (response.ok) {
                const data = await response.json();
                return { success: true, data };
            }
        } catch (cdnErr) {
            console.warn('[RemoteRules] CDN fetch failed:', cdnErr.message);
        }

        // 2. 直接获取（fallback）
        const directResponse = await fetch(rulesIndexUrl);
        if (directResponse.ok) {
            const data = await directResponse.json();
            return { success: true, data };
        }

        return { success: false, message: 'Failed to fetch rules index' };

    } catch (e) {
        console.error('[RemoteRules] fetchRulesIndex error:', e);
        return { success: false, message: e.message };
    }
}

/**
 * 获取远程规则文件
 */
async function fetchRemoteRule(ruleType, version) {
    const url = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${RULES_BRANCH}/rules/${version}/${ruleType}.json`;

    try {
        // 1. 尝试 CDN
        try {
            const response = await cdnManager.fetchViaCdn(url);
            if (response.ok) {
                const data = await response.json();
                return { success: true, data, url };
            }
        } catch (cdnErr) {
            console.warn('[RemoteRules] CDN fetch failed:', cdnErr.message);
        }

        // 2. 直接获取
        const directResponse = await fetch(url);
        if (directResponse.ok) {
            const data = await directResponse.json();
            return { success: true, data, url };
        }

        return { success: false, message: 'Failed to fetch rule file' };
    } catch (e) {
        console.error('[RemoteRules] fetchRemoteRule error:', e);
        return { success: false, message: e.message };
    }
}

/**
 * 检查是否有更新
 * 通过比对远程最新版本 hash 与本地 state hash 判断
 */
async function checkForUpdate() {
    const indexResult = await fetchRulesIndex();

    if (!indexResult.success) {
        return { hasUpdate: false, message: indexResult.message };
    }

    const index = indexResult.data;
    const latestVersion = index.latest;
    const localState = getLocalState();

    // 获取版本详情
    const versionInfo = index.versions.find(v => v.version === latestVersion);

    // 如果没有本地状态，说明从未更新过，有更新
    if (!localState || !localState.baseRulesHash) {
        return {
            hasUpdate: true,
            latestVersion,
            currentVersion: '无',
            changelog: versionInfo?.changelog || [],
            urls: index.urls || {}
        };
    }

    // 下载最新版本，计算 hash 进行比对
    const baseResult = await fetchRemoteRule('replay_base_rules', latestVersion);
    if (!baseResult.success) {
        return { hasUpdate: false, message: '检查更新失败: ' + baseResult.message };
    }

    const remoteBaseContent = JSON.stringify(baseResult.data, null, 2);
    const remoteBaseHash = crypto.createHash('sha256').update(remoteBaseContent, 'utf8').digest('hex');

    // 比对 hash
    if (remoteBaseHash !== localState.baseRulesHash) {
        return {
            hasUpdate: true,
            latestVersion,
            currentVersion: localState.baseRulesVersion || '未知',
            changelog: versionInfo?.changelog || [],
            urls: index.urls || {}
        };
    }

    return {
        hasUpdate: false,
        latestVersion,
        currentVersion: localState.baseRulesVersion || latestVersion
    };
}

/**
 * 应用远程规则（下载并写入 rules/1.0.0/）
 * @param {string} version - 要应用的远程版本
 * @param {boolean} force - 是否强制覆盖本地修改
 */
async function applyRemoteRules(version, force) {
    // 避免循环依赖，延迟加载
    const replayRules = require('./replay-rules');

    // 0. 检测本地是否被修改（通过 hash），除非 force=true
    if (!force) {
        const state = replayRules.stateManager.loadState();
        const currentBaseHash = computeFileHash(replayRules.baseRulesPath);
        const currentTimeHash = computeFileHash(replayRules.timeRulesPath);

        if (state.current && state.current.baseRulesHash && currentBaseHash !== state.current.baseRulesHash) {
            return {
                success: false,
                code: 'LOCAL_MODIFIED',
                message: '检测到本地基础规则已被修改，覆盖将丢失这些变更',
                localHash: currentBaseHash,
                expectedHash: state.current.baseRulesHash
            };
        }

        if (state.current && state.current.timeRulesHash && currentTimeHash !== state.current.timeRulesHash) {
            return {
                success: false,
                code: 'LOCAL_MODIFIED',
                message: '检测到本地时间规则已被修改，覆盖将丢失这些变更',
                localHash: currentTimeHash,
                expectedHash: state.current.timeRulesHash
            };
        }
    }

    // 1. 下载远程规则
    const baseResult = await fetchRemoteRule('replay_base_rules', version);
    const timeResult = await fetchRemoteRule('time_placeholder_rules', version);

    if (!baseResult.success) {
        return { success: false, message: '下载基础规则失败: ' + baseResult.message };
    }

    // 2. 创建快照（在写入前备份当前文件）
    const snapshotId = await createSnapshot();

    try {
        // 3. 写入本地文件
        const baseContent = JSON.stringify(baseResult.data, null, 2);
        const timeContent = timeResult.success ? JSON.stringify(timeResult.data, null, 2) : '{}';
        fs.writeFileSync(replayRules.baseRulesPath, baseContent, 'utf8');
        fs.writeFileSync(replayRules.timeRulesPath, timeContent, 'utf8');

        // 4. 计算新 hash
        const newBaseHash = crypto.createHash('sha256').update(baseContent, 'utf8').digest('hex');
        const newTimeHash = crypto.createHash('sha256').update(timeContent, 'utf8').digest('hex');

        // 5. 重置 replay-rules 内存缓存
        replayRules.resetCache();

        // 6. 更新 state（含新 hash）
        const updatedState = replayRules.stateManager.loadState();
        updatedState.current = {
            snapshotId,
            baseRulesVersion: (baseResult.data.meta && baseResult.data.meta.rules_version) ? baseResult.data.meta.rules_version : version,
            timeRulesVersion: (timeResult.data && timeResult.data.meta && timeResult.data.meta.rules_version) ? timeResult.data.meta.rules_version : version,
            baseRulesHash: newBaseHash,
            timeRulesHash: newTimeHash,
            updatedAt: new Date().toISOString()
        };
        replayRules.stateManager.saveState(updatedState);

        // 7. 存储版本信息到 SQLite
        const baseRulesCount = Array.isArray(baseResult.data.rules) ? baseResult.data.rules.length : 0;
        await storage.addRuleVersion({
            version: version,
            published_at: new Date().toISOString(),
            changelog: '',
            total_rules: baseRulesCount,
            github_pr_url: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/tree/${RULES_BRANCH}/rules/${version}`
        });

        return {
            success: true,
            version,
            snapshotId,
            baseRulesCount,
            timeRulesCount: Array.isArray(timeResult.data && timeResult.data.formats) ? timeResult.data.formats.length : 0
        };

    } catch (e) {
        console.error('[RemoteRules] applyRemoteRules error:', e);
        // 失败时回滚
        if (snapshotId) {
            await rollbackToSnapshot(snapshotId);
        }
        return { success: false, message: e.message };
    }
}

/**
 * 创建本地快照
 */
async function createSnapshot() {
    const replayRules = require('./replay-rules');
    try {
        const result = await replayRules.createSnapshot('remote_update');
        return result.snapshotId || null;
    } catch (e) {
        console.error('[RemoteRules] createSnapshot error:', e);
        return null;
    }
}

/**
 * 回滚到快照
 */
async function rollbackToSnapshot(snapshotId) {
    const replayRules = require('./replay-rules');
    try {
        await replayRules.rollback(snapshotId);
    } catch (e) {
        console.error('[RemoteRules] rollback error:', e);
    }
}

/**
 * 获取规则库信息
 * isLocal 判断：比较本地 state 的 baseRulesVersion 与远程版本的 meta.rules_version
 */
async function getRulesLibrary() {
    const indexResult = await fetchRulesIndex();

    if (!indexResult.success) {
        return { success: false, library: null, message: indexResult.message };
    }

    const index = indexResult.data;
    const localState = getLocalState();

    // 合并信息
    const library = {
        latest: index.latest,
        currentApplied: localState ? {
            baseRulesVersion: localState.baseRulesVersion,
            timeRulesVersion: localState.timeRulesVersion,
            baseRulesHash: localState.baseRulesHash,
            timeRulesHash: localState.timeRulesHash,
            updatedAt: localState.updatedAt
        } : null,
        versions: index.versions.map(v => {
            // isLocal：通过 hash 判断（下载远程该版本的规则文件，计算 hash，与本地 state 的 hash 比对）
            // 注意：不能依赖 rules.json 的 meta.rules_version（不存在），也不能依赖 version 字符串（与 rules_version 格式不同）
            const isLocal = !!(localState && localState.baseRulesHash && localState.timeRulesHash);

            return {
                version: v.version,
                changelog: v.changelog || [],
                isLocal,
                appliedAt: isLocal ? (localState.updatedAt || null) : null
            };
        })
    };

    return { success: true, library };
}

module.exports = {
    checkForUpdate,
    applyRemoteRules,
    getRulesLibrary,
    fetchRulesIndex,
    fetchRemoteRule
};
