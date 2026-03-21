/**
 * 远程规则服务
 * 通过 Cloudflare Worker 代理获取 GitHub 规则文件
 */

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
 * 获取当前规则版本
 */
async function getCurrentVersion() {
    try {
        const versions = await storage.getRuleVersions();
        if (versions && versions.length > 0) {
            return versions[0].version;
        }
    } catch (e) {
        console.error('[RemoteRules] getCurrentVersion error:', e);
    }
    return null;
}

/**
 * 获取远程 rules.json 索引
 */
async function fetchRulesIndex() {
    const rulesIndexUrl = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${RULES_BRANCH}/rules/rules.json`;

    try {
        // 尝试使用 CDN/Worker 获取
        const response = await cdnManager.fetchViaCdn(rulesIndexUrl, {
            headers: { 'Accept': 'application/json' }
        });

        if (response.ok) {
            const data = await response.json();
            return { success: true, data };
        }

        // 直接获取（fallback）
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
        const response = await cdnManager.fetchViaCdn(url);
        if (response.ok) {
            const data = await response.json();
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
 */
async function checkForUpdate() {
    const indexResult = await fetchRulesIndex();

    if (!indexResult.success) {
        return { hasUpdate: false, message: indexResult.message };
    }

    const index = indexResult.data;
    const latestVersion = index.latest;
    const currentVersion = await getCurrentVersion();

    if (!currentVersion || latestVersion !== currentVersion) {
        // 获取版本详情
        const versionInfo = index.versions.find(v => v.version === latestVersion);
        return {
            hasUpdate: true,
            latestVersion,
            currentVersion: currentVersion || '无',
            changelog: versionInfo?.changelog || [],
            urls: index.urls || {}
        };
    }

    return { hasUpdate: false, latestVersion, currentVersion };
}

/**
 * 应用远程规则
 */
async function applyRemoteRules(version) {
    // 获取规则文件
    const baseResult = await fetchRemoteRule('replay_base_rules', version);
    const timeResult = await fetchRemoteRule('time_placeholder_rules', version);

    if (!baseResult.success) {
        return { success: false, message: 'Failed to fetch base rules: ' + baseResult.message };
    }

    // 创建快照
    const snapshotId = await createSnapshot();

    try {
        // 应用规则（这里需要根据实际的规则更新逻辑进行调整）
        // 由于这是现有系统的扩展，我们需要调用现有的规则服务

        // 存储版本信息
        await storage.addRuleVersion({
            version: version,
            published_at: new Date().toISOString(),
            changelog: '',
            total_rules: Array.isArray(baseResult.data) ? baseResult.data.length : 0,
            github_pr_url: `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/tree/${RULES_BRANCH}/rules/${version}`
        });

        return {
            success: true,
            version,
            snapshotId,
            baseRulesCount: Array.isArray(baseResult.data) ? baseResult.data.length : 0,
            timeRulesCount: timeResult.success && Array.isArray(timeResult.data) ? timeResult.data.length : 0
        };

    } catch (e) {
        console.error('[RemoteRules] applyRemoteRules error:', e);
        // 如果应用失败，回滚
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
 */
async function getRulesLibrary() {
    const indexResult = await fetchRulesIndex();

    if (!indexResult.success) {
        return { success: false, library: null, message: indexResult.message };
    }

    const index = indexResult.data;

    // 获取内置规则版本
    const localVersions = await storage.getRuleVersions();
    const localVersionMap = {};
    if (localVersions) {
        localVersions.forEach(v => {
            localVersionMap[v.version] = v;
        });
    }

    // 合并信息
    const library = {
        latest: index.latest,
        versions: index.versions.map(v => ({
            ...v,
            isLocal: !!localVersionMap[v.version],
            appliedAt: localVersionMap[v.version]?.published_at || null
        }))
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
