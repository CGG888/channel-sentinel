const fs = require('fs');
const path = require('path');
const opsObservability = require('../services/ops-observability');

function toAbs(filePath) {
    return path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
}

function writeJson(filePath, data) {
    const abs = toAbs(filePath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, JSON.stringify(data, null, 2), 'utf-8');
    return abs;
}

function writeText(filePath, text) {
    const abs = toAbs(filePath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, text, 'utf-8');
    return abs;
}

function buildMarkdown(payload) {
    const lines = [];
    lines.push('## Ops Low Frequency Governance');
    lines.push('');
    lines.push(`- GeneratedAt: ${payload.generatedAt}`);
    lines.push(`- TotalRiskDomains: ${payload.summary.totalRiskDomains}`);
    lines.push(`- P1: ${payload.summary.p1}, P2: ${payload.summary.p2}, P3: ${payload.summary.p3}`);
    lines.push(`- LowRequestThreshold: ${payload.thresholds.lowRequestThreshold}`);
    lines.push(`- LatencyThresholdMs: ${payload.thresholds.latencyThresholdMs}`);
    lines.push(`- Whitelist: ${(payload.whitelist || []).join(', ') || 'none'}`);
    lines.push('');
    lines.push('| Domain | Requests | ErrorRate | P95LatencyMs | OpenIncidents | RiskLevel | Action | Reason |');
    lines.push('|---|---:|---:|---:|---:|---|---|---|');
    const rows = Array.isArray(payload.domains) ? payload.domains : [];
    if (rows.length === 0) {
        lines.push('| none | 0 | 0 | 0 | 0 | P3 | 观察 | 无异常 |');
    } else {
        for (const row of rows) {
            lines.push(`| ${row.domain} | ${row.requests} | ${row.errorRate} | ${row.p95LatencyMs} | ${row.openIncidents} | ${row.riskLevel} | ${row.action} | ${String(row.reason || '').replace(/\|/g, '/')} |`);
        }
    }
    lines.push('');
    lines.push('### Strategy');
    lines.push('');
    lines.push('- P1：冻结发布，立即处理并复验。');
    lines.push('- P2：创建工单，进入当日治理队列。');
    lines.push('- P3：观察跟踪，纳入周度复盘。');
    lines.push('');
    return lines.join('\n');
}

function main() {
    const jsonPath = process.env.OPS_LOW_FREQUENCY_GOVERNANCE_JSON_PATH || 'artifacts/ops-low-frequency-governance.json';
    const mdPath = process.env.OPS_LOW_FREQUENCY_GOVERNANCE_MARKDOWN_PATH || 'artifacts/ops-low-frequency-governance.md';
    const payload = opsObservability.getLowFrequencyGovernance({
        whitelist: process.env.OPS_LOW_FREQUENCY_WHITELIST || '',
        lowRequestThreshold: process.env.OPS_LOW_FREQUENCY_REQUEST_THRESHOLD || 30,
        latencyThresholdMs: process.env.OPS_LOW_FREQUENCY_LATENCY_THRESHOLD_MS || 3000
    });
    const jsonAbs = writeJson(jsonPath, payload);
    const markdown = buildMarkdown(payload);
    const mdAbs = writeText(mdPath, markdown + '\n');
    if (process.env.GITHUB_STEP_SUMMARY) {
        fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown + '\n');
    }
    console.log(`ops-low-frequency-governance: ok, json=${jsonAbs}, markdown=${mdAbs}`);
}

main();
