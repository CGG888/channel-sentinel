const DEFAULT_BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3000';
const DEFAULT_TIMEOUT_MS = Number(process.env.CONTRACT_TIMEOUT_MS || 3000);

function normalizeBaseUrl(baseUrl) {
    return String(baseUrl || DEFAULT_BASE_URL).trim().replace(/\/+$/, '');
}

async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

async function readJsonSafe(resp) {
    const text = await resp.text();
    try {
        return { data: JSON.parse(text), raw: text };
    } catch (e) {
        return { data: null, raw: text };
    }
}

function expect(condition, message) {
    if (!condition) throw new Error(message);
}

async function expectUnauthorizedJson(baseUrl, path, options = {}) {
    const resp = await fetchWithTimeout(`${baseUrl}${path}`, options);
    expect(resp.status === 401, `${path} 未登录 status 期望 401, 实际 ${resp.status}`);
    const body = await readJsonSafe(resp);
    expect(body.data && body.data.success === false, `${path} 未登录契约不满足: ${body.raw}`);
    return body;
}

async function testDashboardAuthz(baseUrl) {
    await expectUnauthorizedJson(baseUrl, '/api/system/ops/dashboard');
}

async function testSopAuthz(baseUrl) {
    await expectUnauthorizedJson(baseUrl, '/api/system/ops/sop?domain=logs');
}

async function testLowFrequencyGovernanceAuthz(baseUrl) {
    await expectUnauthorizedJson(baseUrl, '/api/system/ops/low-frequency-governance');
}

async function testIncidentCreateAuthz(baseUrl) {
    await expectUnauthorizedJson(baseUrl, '/api/system/ops/incident', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            domain: 'logs',
            severity: 'medium',
            source: 'contract-test',
            summary: 'contract incident'
        })
    });
}

async function testIncidentResolveAuthz(baseUrl) {
    await expectUnauthorizedJson(baseUrl, '/api/system/ops/incident/inc-demo/resolve', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ note: 'contract close' })
    });
}

async function testLogsDomainMetricsAuthz(baseUrl) {
    await expectUnauthorizedJson(baseUrl, '/api/logs/domain-metrics');
}

async function main() {
    const baseUrl = normalizeBaseUrl(process.env.BASE_URL);
    await testDashboardAuthz(baseUrl);
    await testSopAuthz(baseUrl);
    await testLowFrequencyGovernanceAuthz(baseUrl);
    await testIncidentCreateAuthz(baseUrl);
    await testIncidentResolveAuthz(baseUrl);
    await testLogsDomainMetricsAuthz(baseUrl);
    console.log('ops-governance-contract-tests: ok');
}

main().catch((error) => {
    console.error('ops-governance-contract-tests: failed', error && error.stack ? error.stack : error);
    process.exit(1);
});
