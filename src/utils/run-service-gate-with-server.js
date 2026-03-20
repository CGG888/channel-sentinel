const { spawn } = require('child_process');

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3000';
const READY_TIMEOUT_MS = Number(process.env.GATE_SERVER_READY_TIMEOUT_MS || 30000);
const READY_INTERVAL_MS = Number(process.env.GATE_SERVER_READY_INTERVAL_MS || 1000);

function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitUntilReady(baseUrl, timeoutMs, intervalMs) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        try {
            const resp = await fetch(`${baseUrl}/api/auth/check`);
            if (resp && resp.status === 200) return true;
        } catch (e) {}
        await delay(intervalMs);
    }
    return false;
}

function runNodeScript(scriptPath, env = {}) {
    return new Promise((resolve) => {
        const child = spawn(process.execPath, [scriptPath], {
            stdio: 'inherit',
            env: { ...process.env, ...env }
        });
        child.on('exit', (code) => resolve(Number(code || 0)));
    });
}

async function main() {
    const alreadyReady = await waitUntilReady(BASE_URL, 1500, 300);
    let server = null;
    let startedByScript = false;
    let serverEarlyExitCode = null;
    if (!alreadyReady) {
        startedByScript = true;
        server = spawn(process.execPath, ['src/index.js'], {
            stdio: 'inherit',
            env: { ...process.env, PORT: process.env.PORT || '3000' }
        });
        server.on('exit', (code) => {
            serverEarlyExitCode = Number(code || 0);
        });
    }
    let gateCode = 1;
    try {
        const ready = await waitUntilReady(BASE_URL, READY_TIMEOUT_MS, READY_INTERVAL_MS);
        if (!ready) {
            console.error(`run-service-gate-with-server: server not ready within ${READY_TIMEOUT_MS}ms`);
            process.exit(serverEarlyExitCode != null ? serverEarlyExitCode : 2);
        }
        if (startedByScript && serverEarlyExitCode != null) {
            console.error(`run-service-gate-with-server: server exited early, code=${serverEarlyExitCode}`);
            process.exit(serverEarlyExitCode || 2);
        }
        gateCode = await runNodeScript('src/utils/service-quality-gate.js', { BASE_URL });
    } finally {
        if (startedByScript && server) {
            try { server.kill(); } catch (e) {}
        }
    }
    if (gateCode !== 0) process.exit(gateCode);
    console.log('run-service-gate-with-server: ok');
}

main().catch((error) => {
    console.error('run-service-gate-with-server: failed', error && error.stack ? error.stack : error);
    process.exit(1);
});
