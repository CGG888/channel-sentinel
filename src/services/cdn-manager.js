/**
 * CDN 管理服务
 * 负责 CDN 的检测、排序、选择和请求封装
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// 内置 CDN 列表
const BUILT_IN_CDNS = [
    { id: 'gh-proxy-org', name: 'gh-proxy.org', url: 'https://gh-proxy.org/', type: 'built-in', priority: 1 },
    { id: 'hk-gh-proxy-org', name: 'hk.gh-proxy.org', url: 'https://hk.gh-proxy.org/', type: 'built-in', priority: 2 },
    { id: 'cdn-gh-proxy-org', name: 'cdn.gh-proxy.org', url: 'https://cdn.gh-proxy.org/', type: 'built-in', priority: 3 }
];

// CDN 配置文件路径
const getConfigPath = () => path.join(__dirname, '../../data/cdn-config.json');

// 获取 CDN 配置
function getConfig() {
    try {
        const configPath = getConfigPath();
        if (fs.existsSync(configPath)) {
            return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        }
    } catch (e) {
        console.error('[CDN] 读取配置失败:', e.message);
    }
    return {
        enabled: true,
        autoSelect: true,
        selected: BUILT_IN_CDNS[0].url,
        customCdns: [],
        rankedList: []
    };
}

// 保存 CDN 配置
function saveConfig(config) {
    try {
        const configPath = getConfigPath();
        const dataDir = path.dirname(configPath);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        return true;
    } catch (e) {
        console.error('[CDN] 保存配置失败:', e.message);
        return false;
    }
}

// 测试单个 CDN 的延迟和可用性
async function testCdn(cdnUrl) {
    const start = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    try {
        // 使用 cdn 的 /ip 端点进行测试（大多数代理服务都支持）
        const testUrl = cdnUrl.endsWith('/') ? cdnUrl + 'ip' : cdnUrl + '/ip';
        const response = await fetch(testUrl, {
            method: 'HEAD',
            signal: controller.signal
        });
        clearTimeout(timeout);
        const latency = Date.now() - start;
        return {
            available: response.ok,
            latency: latency,
            status: response.status
        };
    } catch (e) {
        clearTimeout(timeout);
        return {
            available: false,
            latency: Infinity,
            error: e.message
        };
    }
}

// 检测所有 CDN
async function detectAllCdns() {
    const config = getConfig();
    const allCdns = [
        ...BUILT_IN_CDNS,
        ...config.customCdns.map((url, i) => ({
            id: `custom-${i}`,
            name: url,
            url: url,
            type: 'custom',
            priority: 100 + i
        }))
    ];

    // 并发测试所有 CDN
    const results = await Promise.all(
        allCdns.map(async (cdn) => {
            const testResult = await testCdn(cdn.url);
            return {
                ...cdn,
                available: testResult.available,
                latency: testResult.latency,
                error: testResult.error
            };
        })
    );

    // 按延迟排序（可用的排前面）
    const sorted = results
        .filter(x => x.available)
        .sort((a, b) => a.latency - b.latency);

    // 不可用的放后面
    const unavailable = results
        .filter(x => !x.available)
        .sort((a, b) => a.priority - b.priority);

    return [...sorted, ...unavailable];
}

// 自动选择最佳 CDN
async function autoSelectBestCdn() {
    const ranked = await detectAllCdns();
    const available = ranked.filter(x => x.available);

    if (available.length === 0) {
        return BUILT_IN_CDNS[0].url; // 默认返回第一个内置 CDN
    }

    return available[0].url;
}

// 获取当前选中的 CDN
async function getSelectedCdn() {
    const config = getConfig();

    if (!config.enabled) {
        return null; // CDN 禁用
    }

    if (config.autoSelect) {
        // 自动选择：返回排序后的第一个可用 CDN
        const ranked = await detectAllCdns();
        const available = ranked.filter(x => x.available);
        return available.length > 0 ? available[0].url : config.selected;
    }

    // 手动选择：返回用户选中的 CDN
    return config.selected;
}

// 添加自定义 CDN
async function addCustomCdn(url) {
    if (!url || typeof url !== 'string') {
        return { success: false, message: '无效的 CDN 地址' };
    }

    // 规范化 URL
    let normalizedUrl = url.trim();
    if (!normalizedUrl.endsWith('/')) {
        normalizedUrl += '/';
    }
    if (!normalizedUrl.startsWith('https://') && !normalizedUrl.startsWith('http://')) {
        normalizedUrl = 'https://' + normalizedUrl;
    }

    const config = getConfig();

    // 检查是否已存在
    const exists = [...BUILT_IN_CDNS, ...config.customCdns].some(c => c.url === normalizedUrl);
    if (exists) {
        return { success: false, message: '该 CDN 已存在' };
    }

    // 测试新 CDN 是否可用
    const testResult = await testCdn(normalizedUrl);
    if (!testResult.available) {
        return { success: false, message: 'CDN 不可用: ' + (testResult.error || '连接失败') };
    }

    config.customCdns.push(normalizedUrl);
    saveConfig(config);

    return {
        success: true,
        message: '自定义 CDN 添加成功',
        cdn: { url: normalizedUrl, latency: testResult.latency }
    };
}

// 删除自定义 CDN
async function removeCustomCdn(url) {
    const config = getConfig();
    const index = config.customCdns.indexOf(url);
    if (index === -1) {
        return { success: false, message: 'CDN 不存在' };
    }

    config.customCdns.splice(index, 1);
    saveConfig(config);

    return { success: true, message: 'CDN 已删除' };
}

// 通过 CDN 代理请求
async function fetchViaCdn(targetUrl, options = {}) {
    const cdn = await getSelectedCdn();

    if (!cdn) {
        // CDN 禁用，直接请求
        return fetch(targetUrl, options);
    }

    // 构建 CDN URL
    const proxyUrl = cdn + encodeURIComponent(targetUrl);

    const defaultHeaders = {
        'Accept': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28'
    };

    if (options.headers) {
        Object.assign(defaultHeaders, options.headers);
    }

    const fetchOptions = {
        ...options,
        headers: defaultHeaders
    };

    try {
        const response = await fetch(proxyUrl, fetchOptions);
        return response;
    } catch (e) {
        console.error('[CDN] 请求失败:', e.message);

        // 尝试不使用 CDN 直接请求
        console.log('[CDN] 尝试直接请求...');
        return fetch(targetUrl, options);
    }
}

// 获取 CDN 列表（带状态）
async function getCdnList() {
    const config = getConfig();
    const ranked = await detectAllCdns();

    // 合并配置中的自定义 CDN 状态
    const customCdnsWithStatus = config.customCdns.map(url => {
        const found = ranked.find(r => r.url === url);
        return found || { url, available: false, latency: Infinity, type: 'custom' };
    });

    const builtInWithStatus = BUILT_IN_CDNS.map(cdn => {
        const found = ranked.find(r => r.url === cdn.url);
        return found || { ...cdn, available: false, latency: Infinity };
    });

    return {
        enabled: config.enabled,
        autoSelect: config.autoSelect,
        selected: config.selected,
        builtInCdns: builtInWithStatus,
        customCdns: customCdnsWithStatus,
        rankedList: ranked.slice(0, 5) // 返回前5个
    };
}

// 更新 CDN 设置
function updateCdnSettings(settings) {
    const config = getConfig();

    if (typeof settings.enabled === 'boolean') {
        config.enabled = settings.enabled;
    }
    if (typeof settings.autoSelect === 'boolean') {
        config.autoSelect = settings.autoSelect;
    }
    if (typeof settings.selected === 'string' && settings.selected) {
        // 验证选中的 CDN 是否有效
        const allCdns = [...BUILT_IN_CDNS, ...config.customCdns.map(u => ({ url: u }))];
        const valid = allCdns.some(c => c.url === settings.selected);
        if (valid) {
            config.selected = settings.selected;
        }
    }

    saveConfig(config);
    return { success: true, config };
}

module.exports = {
    getCdnList,
    detectAllCdns,
    getSelectedCdn,
    addCustomCdn,
    removeCustomCdn,
    fetchViaCdn,
    updateCdnSettings,
    BUILT_IN_CDNS
};
