const fs = require('fs');
const path = require('path');

function toAbs(filePath) {
    return path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
}

function readJson(filePath, fallback) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
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

function writeText(filePath, content) {
    const abs = toAbs(filePath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, 'utf-8');
    return abs;
}

function asNumber(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function percentile(values, p) {
    if (!Array.isArray(values) || values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
    return sorted[idx];
}

function avg(values) {
    if (!Array.isArray(values) || values.length === 0) return 0;
    return values.reduce((a, b) => a + b, 0) / values.length;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function normalizeAlpha(value, fallback = 0.6) {
    const n = asNumber(value, fallback);
    if (!Number.isFinite(n)) return fallback;
    return clamp(n, 0, 1);
}

function blendThreshold(base, recommended, alpha, maxDrift) {
    const keys = ['serviceCritical', 'smokeCritical', 'contractHigh', 'contractMedium'];
    const output = {};
    for (const key of keys) {
        const baseValue = asNumber(base && base[key], key === 'contractHigh' ? 1 : 0);
        const recValue = asNumber(recommended && recommended[key], baseValue);
        const blended = Math.round(baseValue * (1 - alpha) + recValue * alpha);
        const minValue = Math.max(0, baseValue - maxDrift);
        const maxValue = baseValue + maxDrift;
        let calibrated = clamp(blended, minValue, maxValue);
        if (key === 'contractHigh') calibrated = Math.max(1, calibrated);
        if (key === 'contractMedium') calibrated = Math.max(0, calibrated);
        output[key] = calibrated;
    }
    return output;
}

function mapSummaryToEntry(summary, source = 'unknown') {
    const grouped = summary && summary.groupedFailures ? summary.groupedFailures : {};
    const serviceFailed = Array.isArray(grouped.service) ? grouped.service.length : 0;
    const smokeFailed = Array.isArray(grouped.smoke) ? grouped.smoke.length : 0;
    const contractFailed = Array.isArray(grouped.contract) ? grouped.contract.length : 0;
    const total = asNumber(summary && summary.total, 0);
    const failed = asNumber(summary && summary.failed, 0);
    return {
        ts: String(summary && summary.generatedAt ? summary.generatedAt : new Date().toISOString()),
        source,
        total,
        failed,
        passed: asNumber(summary && summary.passed, Math.max(0, total - failed)),
        failRate: total > 0 ? Number((failed / total).toFixed(4)) : 0,
        serviceFailed,
        smokeFailed,
        contractFailed
    };
}

function clampHistory(history, maxItems) {
    const arr = Array.isArray(history) ? history : [];
    if (arr.length <= maxItems) return arr;
    return arr.slice(arr.length - maxItems);
}

function buildTrend(history, windowSize) {
    const recent = history.slice(Math.max(0, history.length - windowSize));
    const failRates = recent.map((x) => asNumber(x.failRate, 0));
    const serviceFailed = recent.map((x) => asNumber(x.serviceFailed, 0));
    const smokeFailed = recent.map((x) => asNumber(x.smokeFailed, 0));
    const contractFailed = recent.map((x) => asNumber(x.contractFailed, 0));
    const summary = {
        totalRuns: history.length,
        windowSize,
        windowRuns: recent.length,
        avgFailRate: Number(avg(failRates).toFixed(4)),
        p90FailRate: Number(percentile(failRates, 0.9).toFixed(4)),
        avgServiceFailed: Number(avg(serviceFailed).toFixed(3)),
        avgSmokeFailed: Number(avg(smokeFailed).toFixed(3)),
        avgContractFailed: Number(avg(contractFailed).toFixed(3)),
        p95ServiceFailed: percentile(serviceFailed, 0.95),
        p95SmokeFailed: percentile(smokeFailed, 0.95),
        p90ContractFailed: percentile(contractFailed, 0.9)
    };
    const recommendedThreshold = {
        serviceCritical: Math.max(0, Math.ceil(summary.p95ServiceFailed)),
        smokeCritical: Math.max(0, Math.ceil(summary.p95SmokeFailed)),
        contractHigh: Math.max(1, Math.ceil(summary.p90ContractFailed)),
        contractMedium: Math.max(0, Math.floor(summary.avgContractFailed))
    };
    return { summary, recommendedThreshold, recent };
}

function buildCalibration(trend, options) {
    const base = options.baseThreshold;
    const minRuns = Math.max(3, asNumber(options.minRuns, 8));
    const alpha = normalizeAlpha(options.alpha, 0.6);
    const maxDrift = Math.max(1, asNumber(options.maxDrift, 2));
    const ready = asNumber(trend.summary.windowRuns, 0) >= minRuns;
    const applied = ready
        ? blendThreshold(base, trend.recommendedThreshold, alpha, maxDrift)
        : {
            serviceCritical: asNumber(base.serviceCritical, 0),
            smokeCritical: asNumber(base.smokeCritical, 0),
            contractHigh: Math.max(1, asNumber(base.contractHigh, 1)),
            contractMedium: Math.max(0, asNumber(base.contractMedium, 0))
        };
    return {
        strategy: 'dynamic-calibration',
        minRuns,
        alpha,
        maxDrift,
        ready,
        base,
        recommended: trend.recommendedThreshold,
        applied,
        reason: ready ? 'history-ready' : `history-not-enough(windowRuns=${trend.summary.windowRuns})`
    };
}

function buildMarkdown(trend, historyPath) {
    const lines = [];
    lines.push('## Service Gate Trend Dashboard');
    lines.push('');
    lines.push(`- History: ${historyPath}`);
    lines.push(`- TotalRuns: ${trend.summary.totalRuns}`);
    lines.push(`- WindowRuns: ${trend.summary.windowRuns}`);
    lines.push(`- AvgFailRate: ${trend.summary.avgFailRate}`);
    lines.push(`- P90FailRate: ${trend.summary.p90FailRate}`);
    lines.push('');
    lines.push('### Calibration Status');
    lines.push('');
    lines.push(`- Strategy: ${trend.thresholdCalibration.strategy}`);
    lines.push(`- WindowRuns: ${trend.summary.windowRuns}, MinRuns: ${trend.thresholdCalibration.minRuns}`);
    lines.push(`- Ready: ${trend.thresholdCalibration.ready}`);
    lines.push(`- Alpha: ${trend.thresholdCalibration.alpha}, MaxDrift: ${trend.thresholdCalibration.maxDrift}`);
    lines.push(`- Reason: ${trend.thresholdCalibration.reason}`);
    lines.push('');
    lines.push('### Recommended Threshold');
    lines.push('');
    lines.push(`- SERVICE_GATE_THRESHOLD_SERVICE_CRITICAL=${trend.recommendedThreshold.serviceCritical}`);
    lines.push(`- SERVICE_GATE_THRESHOLD_SMOKE_CRITICAL=${trend.recommendedThreshold.smokeCritical}`);
    lines.push(`- SERVICE_GATE_THRESHOLD_CONTRACT_HIGH=${trend.recommendedThreshold.contractHigh}`);
    lines.push(`- SERVICE_GATE_THRESHOLD_CONTRACT_MEDIUM=${trend.recommendedThreshold.contractMedium}`);
    lines.push('');
    lines.push('### Applied Threshold');
    lines.push('');
    lines.push(`- SERVICE_GATE_THRESHOLD_SERVICE_CRITICAL=${trend.thresholdCalibration.applied.serviceCritical}`);
    lines.push(`- SERVICE_GATE_THRESHOLD_SMOKE_CRITICAL=${trend.thresholdCalibration.applied.smokeCritical}`);
    lines.push(`- SERVICE_GATE_THRESHOLD_CONTRACT_HIGH=${trend.thresholdCalibration.applied.contractHigh}`);
    lines.push(`- SERVICE_GATE_THRESHOLD_CONTRACT_MEDIUM=${trend.thresholdCalibration.applied.contractMedium}`);
    lines.push('');
    lines.push('### Recent Runs');
    lines.push('');
    lines.push('| ts | failRate | failed | service | smoke | contract |');
    lines.push('|---|---:|---:|---:|---:|---:|');
    const rows = trend.recent.slice(-10);
    for (const item of rows) {
        lines.push(`| ${item.ts} | ${item.failRate} | ${item.failed} | ${item.serviceFailed} | ${item.smokeFailed} | ${item.contractFailed} |`);
    }
    lines.push('');
    return lines.join('\n');
}

function main() {
    const summaryPath = toAbs(process.env.SERVICE_GATE_SUMMARY_PATH || 'service-gate-summary.json');
    const historyPath = process.env.SERVICE_GATE_HISTORY_PATH || 'artifacts/service-gate-history.json';
    const trendJsonPath = process.env.SERVICE_GATE_TREND_PATH || 'artifacts/service-gate-trend.json';
    const trendMdPath = process.env.SERVICE_GATE_TREND_MARKDOWN_PATH || 'artifacts/service-gate-trend.md';
    const windowSize = Math.max(5, asNumber(process.env.SERVICE_GATE_TREND_WINDOW, 20));
    const maxItems = Math.max(windowSize, asNumber(process.env.SERVICE_GATE_HISTORY_MAX, 200));
    const summary = readJson(summaryPath, null);
    if (!summary) {
        console.error(`service-gate-trend: summary missing: ${summaryPath}`);
        process.exit(2);
    }
    const historyRaw = readJson(historyPath, { runs: [] });
    const runs = Array.isArray(historyRaw.runs) ? historyRaw.runs : [];
    runs.push(mapSummaryToEntry(summary, path.basename(summaryPath)));
    const history = {
        generatedAt: new Date().toISOString(),
        runs: clampHistory(runs, maxItems)
    };
    const trend = buildTrend(history.runs, windowSize);
    const baseThreshold = {
        serviceCritical: asNumber(process.env.SERVICE_GATE_THRESHOLD_SERVICE_CRITICAL, 0),
        smokeCritical: asNumber(process.env.SERVICE_GATE_THRESHOLD_SMOKE_CRITICAL, 0),
        contractHigh: Math.max(1, asNumber(process.env.SERVICE_GATE_THRESHOLD_CONTRACT_HIGH, 1)),
        contractMedium: Math.max(0, asNumber(process.env.SERVICE_GATE_THRESHOLD_CONTRACT_MEDIUM, 0))
    };
    const thresholdCalibration = buildCalibration(trend, {
        baseThreshold,
        minRuns: process.env.SERVICE_GATE_DYNAMIC_MIN_RUNS,
        alpha: process.env.SERVICE_GATE_DYNAMIC_ALPHA,
        maxDrift: process.env.SERVICE_GATE_DYNAMIC_MAX_DRIFT
    });
    const trendPayload = {
        generatedAt: new Date().toISOString(),
        historyPath: toAbs(historyPath),
        thresholdStrategy: 'dynamic-calibration',
        thresholdCalibration,
        ...trend
    };
    const historyAbs = writeJson(historyPath, history);
    const trendAbs = writeJson(trendJsonPath, trendPayload);
    const mdAbs = writeText(trendMdPath, buildMarkdown(trendPayload, historyAbs) + '\n');
    if (process.env.GITHUB_STEP_SUMMARY) {
        fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, buildMarkdown(trendPayload, historyAbs) + '\n');
    }
    console.log(`service-gate-trend: ok, history=${historyAbs}, trend=${trendAbs}, markdown=${mdAbs}`);
}

main();
