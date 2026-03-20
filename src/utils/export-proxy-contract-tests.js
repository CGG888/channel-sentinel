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
    const txt = await resp.text();
    try {
        return { data: JSON.parse(txt), raw: txt };
    } catch (e) {
        return { data: null, raw: txt };
    }
}

function expect(condition, message) {
    if (!condition) throw new Error(message);
}

async function testExportJson(baseUrl) {
    const resp = await fetchWithTimeout(`${baseUrl}/api/export/json?scope=internal&status=all`);
    expect(resp.status === 200, `export/json status 期望 200, 实际 ${resp.status}`);
    const body = await readJsonSafe(resp);
    expect(body.data && body.data.success === true, `export/json success 契约不满足: ${body.raw}`);
    expect(Array.isArray(body.data.streams), `export/json streams 非数组: ${body.raw}`);
}

async function testExportTvbox(baseUrl) {
    const resp = await fetchWithTimeout(`${baseUrl}/api/export/tvbox?scope=internal&status=all`);
    expect(resp.status === 200, `export/tvbox status 期望 200, 实际 ${resp.status}`);
    const body = await readJsonSafe(resp);
    expect(body.data && body.data.success === true, `export/tvbox success 契约不满足: ${body.raw}`);
    expect(Array.isArray(body.data.lives), `export/tvbox lives 非数组: ${body.raw}`);
}

async function testExportXtream(baseUrl) {
    const resp = await fetchWithTimeout(`${baseUrl}/api/export/xtream?scope=internal&status=all`);
    expect(resp.status === 200, `export/xtream status 期望 200, 实际 ${resp.status}`);
    const body = await readJsonSafe(resp);
    expect(body.data && body.data.success === true, `export/xtream success 契约不满足: ${body.raw}`);
    expect(Array.isArray(body.data.live_streams), `export/xtream live_streams 非数组: ${body.raw}`);
}

async function testProxyInvalidUrl(baseUrl) {
    const streamResp = await fetchWithTimeout(`${baseUrl}/api/proxy/stream`);
    expect(streamResp.status === 400, `proxy/stream 无url status 期望 400, 实际 ${streamResp.status}`);
    const streamText = await streamResp.text();
    expect(/invalid url/i.test(streamText), `proxy/stream 无url 返回异常: ${streamText}`);

    const hlsResp = await fetchWithTimeout(`${baseUrl}/api/proxy/hls`);
    expect(hlsResp.status === 400, `proxy/hls 无url status 期望 400, 实际 ${hlsResp.status}`);
    const hlsText = await hlsResp.text();
    expect(/invalid url/i.test(hlsText), `proxy/hls 无url 返回异常: ${hlsText}`);
}

async function main() {
    const baseUrl = normalizeBaseUrl(process.env.BASE_URL);
    await testExportJson(baseUrl);
    await testExportTvbox(baseUrl);
    await testExportXtream(baseUrl);
    await testProxyInvalidUrl(baseUrl);
    console.log('export-proxy-contract-tests: ok');
}

main().catch((error) => {
    console.error('export-proxy-contract-tests: failed', error && error.stack ? error.stack : error);
    process.exit(1);
});
