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
    lines.push('## Ops Domain Dashboard');
    lines.push('');
    lines.push(`- GeneratedAt: ${payload.generatedAt}`);
    lines.push(`- OpenIncidents: ${payload.incidents.open}`);
    lines.push(`- ClosedIncidents: ${payload.incidents.closed}`);
    lines.push('');
    lines.push('### Domain Metrics');
    lines.push('');
    lines.push('| Domain | Requests | ErrorRate | AvgLatencyMs | P95LatencyMs |');
    lines.push('|---|---:|---:|---:|---:|');
    for (const [domain, metric] of Object.entries(payload.metrics || {})) {
        lines.push(`| ${domain} | ${metric.requests} | ${metric.errorRate} | ${metric.avgLatencyMs} | ${metric.p95LatencyMs} |`);
    }
    lines.push('');
    lines.push('### SOP');
    lines.push('');
    for (const [domain, sop] of Object.entries(payload.sops || {})) {
        lines.push(`#### ${domain}`);
        lines.push('');
        lines.push(`- Owner: ${sop.owner}`);
        lines.push(`- SlaMinutes: ${sop.slaMinutes}`);
        const steps = Array.isArray(sop.steps) ? sop.steps : [];
        for (const item of steps) {
            lines.push(`- ${item}`);
        }
        lines.push('');
    }
    lines.push('### Low Frequency Governance');
    lines.push('');
    lines.push(`- TotalRiskDomains: ${payload.lowFrequencyGovernance.summary.totalRiskDomains}`);
    lines.push(`- P1: ${payload.lowFrequencyGovernance.summary.p1}, P2: ${payload.lowFrequencyGovernance.summary.p2}, P3: ${payload.lowFrequencyGovernance.summary.p3}`);
    lines.push(`- LowRequestThreshold: ${payload.lowFrequencyGovernance.thresholds.lowRequestThreshold}`);
    lines.push(`- LatencyThresholdMs: ${payload.lowFrequencyGovernance.thresholds.latencyThresholdMs}`);
    lines.push('');
    lines.push('| Domain | Requests | ErrorRate | P95LatencyMs | OpenIncidents | RiskLevel | Action |');
    lines.push('|---|---:|---:|---:|---:|---|---|');
    const rows = Array.isArray(payload.lowFrequencyGovernance.domains) ? payload.lowFrequencyGovernance.domains : [];
    if (rows.length === 0) {
        lines.push('| none | 0 | 0 | 0 | 0 | P3 | 观察 |');
    } else {
        for (const row of rows) {
            lines.push(`| ${row.domain} | ${row.requests} | ${row.errorRate} | ${row.p95LatencyMs} | ${row.openIncidents} | ${row.riskLevel} | ${row.action} |`);
        }
    }
    lines.push('');
    return lines.join('\n');
}

function main() {
    const jsonPath = process.env.OPS_DOMAIN_SOP_JSON_PATH || 'artifacts/ops-domain-sop.json';
    const mdPath = process.env.OPS_DOMAIN_SOP_MARKDOWN_PATH || 'artifacts/ops-domain-sop.md';
    const payload = {
        generatedAt: new Date().toISOString(),
        metrics: opsObservability.getDomainMetrics(),
        incidents: opsObservability.getIncidentSummary(100),
        sops: opsObservability.getAllSops(),
        lowFrequencyGovernance: opsObservability.getLowFrequencyGovernance({
            whitelist: process.env.OPS_LOW_FREQUENCY_WHITELIST || '',
            lowRequestThreshold: process.env.OPS_LOW_FREQUENCY_REQUEST_THRESHOLD || 30,
            latencyThresholdMs: process.env.OPS_LOW_FREQUENCY_LATENCY_THRESHOLD_MS || 3000
        })
    };
    const jsonAbs = writeJson(jsonPath, payload);
    const mdAbs = writeText(mdPath, buildMarkdown(payload) + '\n');
    if (process.env.GITHUB_STEP_SUMMARY) {
        fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, buildMarkdown(payload) + '\n');
    }
    console.log(`ops-domain-sop: ok, json=${jsonAbs}, markdown=${mdAbs}`);
}

main();
