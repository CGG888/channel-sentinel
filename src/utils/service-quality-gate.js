const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const TASKS = [
    { name: 'stream-service-tests', category: 'service', args: ['src/utils/stream-service-tests.js'] },
    { name: 'auth-service-tests', category: 'service', args: ['src/utils/auth-service-tests.js'] },
    { name: 'http-smoke-strict', category: 'smoke', args: ['src/utils/http-smoke.js', '--strict'] },
    { name: 'player-auth-contract-tests', category: 'contract', args: ['src/utils/player-auth-contract-tests.js'] },
    { name: 'export-proxy-contract-tests', category: 'contract', args: ['src/utils/export-proxy-contract-tests.js'] },
    { name: 'system-authz-contract-tests', category: 'contract', args: ['src/utils/system-authz-contract-tests.js'] },
    { name: 'ops-governance-contract-tests', category: 'contract', args: ['src/utils/ops-governance-contract-tests.js'] }
];

function runNodeTask(task) {
    const startedAt = new Date().toISOString();
    const proc = spawnSync(process.execPath, task.args, { encoding: 'utf-8' });
    const status = Number.isInteger(proc.status) ? proc.status : 1;
    const stdout = String(proc.stdout || '');
    const stderr = String(proc.stderr || '');
    process.stdout.write(stdout);
    process.stderr.write(stderr);
    return {
        name: task.name,
        category: task.category,
        command: `${process.execPath} ${task.args.join(' ')}`,
        startedAt,
        endedAt: new Date().toISOString(),
        exitCode: status,
        ok: status === 0
    };
}

function groupFailures(results) {
    const failed = results.filter((r) => !r.ok);
    const grouped = {};
    for (const item of failed) {
        if (!grouped[item.category]) grouped[item.category] = [];
        grouped[item.category].push({ name: item.name, exitCode: item.exitCode, command: item.command });
    }
    return grouped;
}

function writeSummary(summaryPath, payload) {
    const absPath = path.isAbsolute(summaryPath) ? summaryPath : path.join(process.cwd(), summaryPath);
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    fs.writeFileSync(absPath, JSON.stringify(payload, null, 2), 'utf-8');
    return absPath;
}

function emitFailureAnnotations(groupedFailures) {
    for (const [category, items] of Object.entries(groupedFailures)) {
        const names = items.map((x) => x.name).join(', ');
        console.error(`::error title=Service Gate ${category}::失败任务: ${names}`);
    }
}

function main() {
    const results = TASKS.map(runNodeTask);
    const groupedFailures = groupFailures(results);
    const payload = {
        generatedAt: new Date().toISOString(),
        total: results.length,
        passed: results.filter((r) => r.ok).length,
        failed: results.filter((r) => !r.ok).length,
        groupedFailures,
        results
    };
    const summaryPath = process.env.SERVICE_GATE_SUMMARY_PATH || 'service-gate-summary.json';
    const absSummaryPath = writeSummary(summaryPath, payload);
    if (payload.failed > 0) {
        emitFailureAnnotations(groupedFailures);
        console.error(`service-quality-gate: failed, summary=${absSummaryPath}`);
        process.exit(2);
    }
    console.log(`service-quality-gate: ok, summary=${absSummaryPath}`);
}

main();
