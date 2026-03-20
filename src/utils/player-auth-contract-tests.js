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

async function testCaptcha(baseUrl) {
    const resp = await fetchWithTimeout(`${baseUrl}/api/captcha`, { method: 'GET', redirect: 'manual' });
    expect(resp.status === 200, `captcha status 期望 200, 实际 ${resp.status}`);
    const ctype = String(resp.headers.get('content-type') || '');
    expect(ctype.includes('svg'), `captcha content-type 非 svg: ${ctype}`);
    const setCookie = String(resp.headers.get('set-cookie') || '');
    expect(setCookie.includes('captcha_id='), `captcha 未返回 captcha_id cookie: ${setCookie}`);
    return setCookie.split(';')[0];
}

async function testLoginFailure(baseUrl, captchaCookie) {
    const resp = await fetchWithTimeout(`${baseUrl}/api/login`, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            'cookie': captchaCookie
        },
        body: JSON.stringify({ username: 'admin', password: 'admin', captcha: 'wrong' })
    });
    expect(resp.status === 200, `login status 期望 200, 实际 ${resp.status}`);
    const body = await readJsonSafe(resp);
    expect(body.data && body.data.success === false, `login 失败契约不满足: ${body.raw}`);
    expect(typeof body.data.message === 'string' && body.data.message.length > 0, `login message 缺失: ${body.raw}`);
}

async function testAuthCheckUnauthed(baseUrl) {
    const resp = await fetchWithTimeout(`${baseUrl}/api/auth/check`, { method: 'GET' });
    expect(resp.status === 200, `auth/check status 期望 200, 实际 ${resp.status}`);
    const body = await readJsonSafe(resp);
    expect(body.data && body.data.success === false, `auth/check 未登录契约不满足: ${body.raw}`);
}

async function testAuthUpdateUnauthed(baseUrl) {
    const resp = await fetchWithTimeout(`${baseUrl}/api/auth/update`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'x', oldPassword: 'a', password: 'b' })
    });
    expect(resp.status === 401, `auth/update 未登录 status 期望 401, 实际 ${resp.status}`);
    const body = await readJsonSafe(resp);
    expect(body.data && body.data.success === false, `auth/update 未登录 success 契约不满足: ${body.raw}`);
    expect(typeof body.data.message === 'string', `auth/update 未登录 message 缺失: ${body.raw}`);
}

async function testPlayerLogUnauthed(baseUrl) {
    const resp = await fetchWithTimeout(`${baseUrl}/api/player/log`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'test', mode: 'hls', url: 'http://example.com/live.m3u8' })
    });
    expect(resp.status === 401, `player/log 未登录 status 期望 401, 实际 ${resp.status}`);
    const body = await readJsonSafe(resp);
    expect(body.data && body.data.success === false, `player/log 未登录 success 契约不满足: ${body.raw}`);
    expect(typeof body.data.message === 'string', `player/log 未登录 message 缺失: ${body.raw}`);
}

async function testLogoutUnauthed(baseUrl) {
    const resp = await fetchWithTimeout(`${baseUrl}/api/logout`, { method: 'POST' });
    expect(resp.status === 401, `logout 未登录 status 期望 401, 实际 ${resp.status}`);
    const body = await readJsonSafe(resp);
    expect(body.data && body.data.success === false, `logout 未登录 success 契约不满足: ${body.raw}`);
}

async function main() {
    const baseUrl = normalizeBaseUrl(process.env.BASE_URL);
    const captchaCookie = await testCaptcha(baseUrl);
    await testLoginFailure(baseUrl, captchaCookie);
    await testAuthCheckUnauthed(baseUrl);
    await testAuthUpdateUnauthed(baseUrl);
    await testPlayerLogUnauthed(baseUrl);
    await testLogoutUnauthed(baseUrl);
    console.log('player-auth-contract-tests: ok');
}

main().catch((error) => {
    console.error('player-auth-contract-tests: failed', error && error.stack ? error.stack : error);
    process.exit(1);
});
