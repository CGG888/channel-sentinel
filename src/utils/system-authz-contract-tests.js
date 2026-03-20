const DEFAULT_BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3000';
const DEFAULT_TIMEOUT_MS = Number(process.env.CONTRACT_TIMEOUT_MS || 3000);

function normalizeBaseUrl(baseUrl) {
    return String(baseUrl || DEFAULT_BASE_URL).trim().replace(/\/+$/, '');
}

async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...options, signal: controller.signal, redirect: 'manual' });
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

async function testSystemInfoPublic(baseUrl) {
    const resp = await fetchWithTimeout(`${baseUrl}/api/system/info`);
    expect(resp.status === 200, `system/info status 期望 200, 实际 ${resp.status}`);
    const body = await readJsonSafe(resp);
    expect(body.data && body.data.success === true, `system/info success 契约不满足: ${body.raw}`);
    expect(typeof body.data.version === 'string', `system/info version 缺失: ${body.raw}`);
}

async function testConfigAppSettingsPublic(baseUrl) {
    const resp = await fetchWithTimeout(`${baseUrl}/api/config/app-settings`);
    expect(resp.status === 200, `config/app-settings status 期望 200, 实际 ${resp.status}`);
    const body = await readJsonSafe(resp);
    expect(body.data && body.data.success === true, `config/app-settings success 契约不满足: ${body.raw}`);
    expect(body.data && typeof body.data.appSettings === 'object', `config/app-settings appSettings 缺失: ${body.raw}`);
}

async function testPersistListPublic(baseUrl) {
    const resp = await fetchWithTimeout(`${baseUrl}/api/persist/list`);
    expect(resp.status === 200, `persist/list status 期望 200, 实际 ${resp.status}`);
    const body = await readJsonSafe(resp);
    expect(body.data && body.data.success === true, `persist/list success 契约不满足: ${body.raw}`);
    expect(Array.isArray(body.data.versions), `persist/list versions 非数组: ${body.raw}`);
}

async function testSystemStorageStatusAuthz(baseUrl) {
    const resp = await fetchWithTimeout(`${baseUrl}/api/system/storage-status`);
    expect(resp.status === 401, `system/storage-status 未登录 status 期望 401, 实际 ${resp.status}`);
    const body = await readJsonSafe(resp);
    expect(body.data && body.data.success === false, `system/storage-status 未登录契约不满足: ${body.raw}`);
}

async function testLogsLevelAuthz(baseUrl) {
    const resp = await fetchWithTimeout(`${baseUrl}/api/logs/level`);
    expect(resp.status === 401, `logs/level 未登录 status 期望 401, 实际 ${resp.status}`);
    const body = await readJsonSafe(resp);
    expect(body.data && body.data.success === false, `logs/level 未登录契约不满足: ${body.raw}`);
}

async function testCatchupProfileAuthz(baseUrl) {
    const resp = await fetchWithTimeout(`${baseUrl}/api/catchup/profile?scope=internal`);
    expect(resp.status === 401, `catchup/profile 未登录 status 期望 401, 实际 ${resp.status}`);
    const body = await readJsonSafe(resp);
    expect(body.data && body.data.success === false, `catchup/profile 未登录契约不满足: ${body.raw}`);
}

async function testEpgProgramsAuthz(baseUrl) {
    const resp = await fetchWithTimeout(`${baseUrl}/api/epg/programs?scope=internal`);
    expect(resp.status === 401, `epg/programs 未登录 status 期望 401, 实际 ${resp.status}`);
    const body = await readJsonSafe(resp);
    expect(body.data && body.data.success === false, `epg/programs 未登录契约不满足: ${body.raw}`);
}

async function main() {
    const baseUrl = normalizeBaseUrl(process.env.BASE_URL);
    await testSystemInfoPublic(baseUrl);
    await testConfigAppSettingsPublic(baseUrl);
    await testPersistListPublic(baseUrl);
    await testSystemStorageStatusAuthz(baseUrl);
    await testLogsLevelAuthz(baseUrl);
    await testCatchupProfileAuthz(baseUrl);
    await testEpgProgramsAuthz(baseUrl);
    console.log('system-authz-contract-tests: ok');
}

main().catch((error) => {
    console.error('system-authz-contract-tests: failed', error && error.stack ? error.stack : error);
    process.exit(1);
});
