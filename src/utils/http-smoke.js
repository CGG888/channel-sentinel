const DEFAULT_BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3000';
const DEFAULT_TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS || 2500);

function parseArgs(argv) {
    const args = Array.isArray(argv) ? argv : [];
    const opts = {
        baseUrl: DEFAULT_BASE_URL,
        strict: false,
        timeoutMs: DEFAULT_TIMEOUT_MS
    };
    for (let i = 0; i < args.length; i++) {
        const a = String(args[i] || '');
        if (a === '--strict') opts.strict = true;
        else if (a === '--base' && args[i + 1]) {
            opts.baseUrl = String(args[i + 1]);
            i++;
        } else if (a === '--timeout' && args[i + 1]) {
            const v = Number(args[i + 1]);
            if (Number.isFinite(v) && v > 0) opts.timeoutMs = v;
            i++;
        }
    }
    return opts;
}

function normalizeBaseUrl(baseUrl) {
    const s = String(baseUrl || '').trim();
    if (!s) return DEFAULT_BASE_URL;
    return s.replace(/\/+$/, '');
}

function buildChecks(baseUrl) {
    return [
        { path: '/', expected: [302] },
        { path: '/results', expected: [302] },
        { path: '/player.html', expected: [302] },
        { path: '/logs.html', expected: [302] },
        { path: '/login.html', expected: [200] },
        { path: '/js/core/api-client.js', expected: [200] },
        { path: '/api/auth/check', expected: [200] }
    ].map((x) => ({ ...x, url: baseUrl + x.path }));
}

async function checkOne(item, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const resp = await fetch(item.url, { redirect: 'manual', signal: controller.signal });
        const status = Number(resp.status || 0);
        const ok = item.expected.includes(status);
        return {
            url: item.url,
            expected: item.expected,
            status,
            ok,
            error: ''
        };
    } catch (e) {
        return {
            url: item.url,
            expected: item.expected,
            status: 0,
            ok: false,
            error: String(e && e.message ? e.message : e)
        };
    } finally {
        clearTimeout(timer);
    }
}

function printLine(result) {
    const exp = result.expected.join('|');
    if (result.error) {
        process.stdout.write(`${result.url} => ERROR ${result.error} (expected ${exp})\n`);
        return;
    }
    process.stdout.write(`${result.url} => ${result.status} (expected ${exp}) ${result.ok ? 'OK' : 'FAIL'}\n`);
}

async function main() {
    const opts = parseArgs(process.argv.slice(2));
    const baseUrl = normalizeBaseUrl(opts.baseUrl);
    const checks = buildChecks(baseUrl);
    const results = [];
    for (const item of checks) {
        const one = await checkOne(item, opts.timeoutMs);
        results.push(one);
        printLine(one);
    }
    const total = results.length;
    const pass = results.filter((x) => x.ok).length;
    const fail = total - pass;
    const unreachable = results.filter((x) => !!x.error).length;
    const summary = {
        ts: new Date().toISOString(),
        baseUrl,
        strict: !!opts.strict,
        timeoutMs: opts.timeoutMs,
        total,
        pass,
        fail,
        unreachable
    };
    process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
    if (opts.strict && fail > 0) process.exit(2);
}

if (require.main === module) {
    main().catch((e) => {
        process.stderr.write(String(e && e.stack ? e.stack : e) + '\n');
        process.exit(1);
    });
}

module.exports = {
    main
};
