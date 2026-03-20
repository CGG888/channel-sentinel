const fs = require('fs');
const path = require('path');

function toAbs(filePath) {
    return path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
}

function readJson(filePath, fallback = null) {
    try {
        return JSON.parse(fs.readFileSync(toAbs(filePath), 'utf-8'));
    } catch (e) {
        return fallback;
    }
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

function asNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function exists(filePath) {
    try {
        return fs.existsSync(toAbs(filePath));
    } catch (e) {
        return false;
    }
}

function buildPolicy() {
    const now = new Date();
    const quarter = Math.floor(now.getMonth() / 3) + 1;
    const year = now.getFullYear();
    const reviewWindow = `${year}-Q${quarter}`;
    return {
        generatedAt: new Date().toISOString(),
        reviewWindow,
        owners: {
            release: 'release-manager',
            qualityGate: 'qa-owner',
            apiContract: 'api-owner',
            opsGovernance: 'ops-owner'
        },
        cadence: {
            gateReview: 'weekly',
            trendCalibrationReview: 'weekly',
            lowFrequencyGovernanceReview: 'weekly',
            fullAcceptanceReview: 'quarterly'
        },
        slas: {
            p1: '1h',
            p2: '4h',
            p3: '24h'
        },
        actions: [
            '每周复盘 gate/trend/notify/ops 四类产物稳定性',
            '每周复审低频异常白名单与阈值',
            '每季度执行全量收官验收并归档报告',
            '触发 P1 时冻结发布并重跑 full gate 链路'
        ],
        releaseCriteria: [
            'service-gate-summary passedRate >= 0.99',
            'contract 失败数 = 0',
            'service-gate-notify severity != critical/high',
            'ops-domain-sop 与 low-frequency-governance 产物均可生成'
        ]
    };
}

function buildFinalReport(inputs) {
    const summary = readJson(inputs.summaryPath, { total: 0, passed: 0, failed: 0, results: [] });
    const notify = readJson(inputs.notifyPath, { severity: 'unknown', governance: {} });
    const trend = readJson(inputs.trendPath, { summary: { totalRuns: 0, windowRuns: 0 }, thresholdCalibration: {} });
    const governance = readJson(inputs.governancePath, { level: 'P3', decision: 'pass', failedCount: 0 });
    const opsSop = readJson(inputs.opsSopPath, { incidents: { open: 0 }, lowFrequencyGovernance: { summary: { totalRiskDomains: 0, p1: 0, p2: 0, p3: 0 } } });
    const lowFreq = readJson(inputs.lowFrequencyPath, { summary: { totalRiskDomains: 0, p1: 0, p2: 0, p3: 0 } });

    const total = asNumber(summary.total, 0);
    const passed = asNumber(summary.passed, 0);
    const passRate = total > 0 ? Number((passed / total).toFixed(4)) : 0;
    const contractFails = Array.isArray(summary.results)
        ? summary.results.filter((x) => String(x.category || '') === 'contract' && !x.ok).length
        : 0;
    const summaryOk = asNumber(summary.failed, 0) === 0;
    const severity = String(notify.severity || 'unknown').toLowerCase();
    const severityOk = severity !== 'critical' && severity !== 'high';
    const requiredArtifacts = [
        inputs.summaryPath,
        inputs.trendPath,
        inputs.notifyPath,
        inputs.governancePath,
        inputs.opsSopPath,
        inputs.lowFrequencyPath
    ];
    const missingArtifacts = requiredArtifacts.filter((item) => !exists(item));
    const artifactsOk = missingArtifacts.length === 0;
    const openIncidents = asNumber(opsSop && opsSop.incidents && opsSop.incidents.open, 0);
    const p1RiskDomains = asNumber(lowFreq && lowFreq.summary && lowFreq.summary.p1, 0);
    const acceptancePass = summaryOk && artifactsOk && passRate >= 0.99 && contractFails === 0 && severityOk;

    return {
        generatedAt: new Date().toISOString(),
        acceptancePass,
        score: {
            passRate,
            summaryOk,
            severity,
            severityOk,
            contractFails,
            artifactsOk,
            openIncidents,
            p1RiskDomains
        },
        gate: {
            total,
            passed,
            failed: asNumber(summary.failed, 0),
            groupedFailures: summary.groupedFailures || {}
        },
        notify: {
            severity,
            governanceLevel: governance.level || 'P3',
            governanceDecision: governance.decision || 'pass'
        },
        trend: {
            totalRuns: asNumber(trend && trend.summary && trend.summary.totalRuns, 0),
            windowRuns: asNumber(trend && trend.summary && trend.summary.windowRuns, 0),
            calibrationReady: Boolean(trend && trend.thresholdCalibration && trend.thresholdCalibration.ready),
            calibrationReason: trend && trend.thresholdCalibration ? (trend.thresholdCalibration.reason || '') : ''
        },
        ops: {
            openIncidents,
            lowFrequencyRiskDomains: asNumber(lowFreq && lowFreq.summary && lowFreq.summary.totalRiskDomains, 0),
            lowFrequencyP1: p1RiskDomains,
            lowFrequencyP2: asNumber(lowFreq && lowFreq.summary && lowFreq.summary.p2, 0),
            lowFrequencyP3: asNumber(lowFreq && lowFreq.summary && lowFreq.summary.p3, 0)
        },
        artifacts: {
            required: requiredArtifacts.map((x) => toAbs(x)),
            missing: missingArtifacts.map((x) => toAbs(x))
        },
        closureChecklist: [
            '重跑 gate full 链路并确认 passedRate >= 99%',
            '确认 severity 非 critical/high 且 contract 失败数为 0',
            '确认 ops-domain-sop 与 low-frequency-governance 产物齐全',
            '归档收官验收报告与季度治理制度'
        ]
    };
}

function buildFinalMarkdown(report) {
    const lines = [];
    lines.push('## Final Acceptance Report');
    lines.push('');
    lines.push(`- GeneratedAt: ${report.generatedAt}`);
    lines.push(`- AcceptancePass: ${report.acceptancePass}`);
    lines.push(`- PassRate: ${report.score.passRate}`);
    lines.push(`- Severity: ${String(report.score.severity || '').toUpperCase()}`);
    lines.push(`- ContractFails: ${report.score.contractFails}`);
    lines.push(`- ArtifactsOk: ${report.score.artifactsOk}`);
    lines.push(`- OpenIncidents: ${report.score.openIncidents}`);
    lines.push(`- LowFrequencyP1: ${report.score.p1RiskDomains}`);
    lines.push('');
    lines.push('### Gate');
    lines.push('');
    lines.push(`- Total: ${report.gate.total}, Passed: ${report.gate.passed}, Failed: ${report.gate.failed}`);
    lines.push(`- GroupedFailures: ${JSON.stringify(report.gate.groupedFailures || {})}`);
    lines.push('');
    lines.push('### Trend');
    lines.push('');
    lines.push(`- TotalRuns: ${report.trend.totalRuns}`);
    lines.push(`- WindowRuns: ${report.trend.windowRuns}`);
    lines.push(`- CalibrationReady: ${report.trend.calibrationReady}`);
    lines.push(`- CalibrationReason: ${report.trend.calibrationReason || 'none'}`);
    lines.push('');
    lines.push('### Ops');
    lines.push('');
    lines.push(`- LowFrequencyRiskDomains: ${report.ops.lowFrequencyRiskDomains}`);
    lines.push(`- LowFrequencyP1/P2/P3: ${report.ops.lowFrequencyP1}/${report.ops.lowFrequencyP2}/${report.ops.lowFrequencyP3}`);
    lines.push('');
    lines.push('### Closure Checklist');
    lines.push('');
    for (const item of report.closureChecklist || []) {
        lines.push(`- ${item}`);
    }
    lines.push('');
    return lines.join('\n');
}

function buildPolicyMarkdown(policy) {
    const lines = [];
    lines.push('## Quarterly Governance Policy');
    lines.push('');
    lines.push(`- GeneratedAt: ${policy.generatedAt}`);
    lines.push(`- ReviewWindow: ${policy.reviewWindow}`);
    lines.push('');
    lines.push('### Owners');
    lines.push('');
    lines.push(`- Release: ${policy.owners.release}`);
    lines.push(`- QualityGate: ${policy.owners.qualityGate}`);
    lines.push(`- ApiContract: ${policy.owners.apiContract}`);
    lines.push(`- OpsGovernance: ${policy.owners.opsGovernance}`);
    lines.push('');
    lines.push('### Cadence');
    lines.push('');
    lines.push(`- GateReview: ${policy.cadence.gateReview}`);
    lines.push(`- TrendCalibrationReview: ${policy.cadence.trendCalibrationReview}`);
    lines.push(`- LowFrequencyGovernanceReview: ${policy.cadence.lowFrequencyGovernanceReview}`);
    lines.push(`- FullAcceptanceReview: ${policy.cadence.fullAcceptanceReview}`);
    lines.push('');
    lines.push('### SLA');
    lines.push('');
    lines.push(`- P1: ${policy.slas.p1}, P2: ${policy.slas.p2}, P3: ${policy.slas.p3}`);
    lines.push('');
    lines.push('### Actions');
    lines.push('');
    for (const item of policy.actions || []) {
        lines.push(`- ${item}`);
    }
    lines.push('');
    lines.push('### Release Criteria');
    lines.push('');
    for (const item of policy.releaseCriteria || []) {
        lines.push(`- ${item}`);
    }
    lines.push('');
    return lines.join('\n');
}

function main() {
    const inputs = {
        summaryPath: process.env.SERVICE_GATE_SUMMARY_PATH || 'artifacts/service-gate-summary.json',
        trendPath: process.env.SERVICE_GATE_TREND_PATH || 'artifacts/service-gate-trend.json',
        notifyPath: process.env.SERVICE_GATE_NOTIFY_JSON_PATH || 'artifacts/service-gate-notify.json',
        governancePath: process.env.SERVICE_GATE_GOVERNANCE_JSON_PATH || 'artifacts/service-gate-governance.json',
        opsSopPath: process.env.OPS_DOMAIN_SOP_JSON_PATH || 'artifacts/ops-domain-sop.json',
        lowFrequencyPath: process.env.OPS_LOW_FREQUENCY_GOVERNANCE_JSON_PATH || 'artifacts/ops-low-frequency-governance.json'
    };
    const report = buildFinalReport(inputs);
    const policy = buildPolicy();
    const reportJsonPath = process.env.FINAL_ACCEPTANCE_REPORT_JSON_PATH || 'artifacts/final-acceptance-report.json';
    const reportMdPath = process.env.FINAL_ACCEPTANCE_REPORT_MARKDOWN_PATH || 'artifacts/final-acceptance-report.md';
    const policyJsonPath = process.env.QUARTERLY_GOVERNANCE_POLICY_JSON_PATH || 'artifacts/quarterly-governance-policy.json';
    const policyMdPath = process.env.QUARTERLY_GOVERNANCE_POLICY_MARKDOWN_PATH || 'artifacts/quarterly-governance-policy.md';
    const reportJsonAbs = writeJson(reportJsonPath, report);
    const reportMdAbs = writeText(reportMdPath, buildFinalMarkdown(report) + '\n');
    const policyJsonAbs = writeJson(policyJsonPath, policy);
    const policyMdAbs = writeText(policyMdPath, buildPolicyMarkdown(policy) + '\n');
    if (process.env.GITHUB_STEP_SUMMARY) {
        fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, buildFinalMarkdown(report) + '\n');
        fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, buildPolicyMarkdown(policy) + '\n');
    }
    console.log(`final-acceptance-report: ok, reportJson=${reportJsonAbs}, reportMd=${reportMdAbs}, policyJson=${policyJsonAbs}, policyMd=${policyMdAbs}`);
}

main();
