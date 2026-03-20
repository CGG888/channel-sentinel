const fs = require('fs');
const path = require('path');

function toAbs(filePath) {
    return path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
}

function readJson(filePath) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch (e) {
        return null;
    }
}

function writeText(filePath, content) {
    const abs = toAbs(filePath);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content, 'utf-8');
    return abs;
}

function getFailureCount(grouped, key) {
    const arr = grouped && Array.isArray(grouped[key]) ? grouped[key] : [];
    return arr.length;
}

function resolveThreshold(base, trend, useDynamic) {
    const calibration = trend && trend.thresholdCalibration ? trend.thresholdCalibration : null;
    const calibrated = calibration && calibration.ready && calibration.applied
        ? calibration.applied
        : (trend && trend.recommendedThreshold ? trend.recommendedThreshold : null);
    if (!useDynamic || !calibrated) {
        return { threshold: base, dynamicApplied: false, calibrated: null };
    }
    if (calibration && !calibration.ready) {
        return {
            threshold: base,
            dynamicApplied: false,
            calibrated: null,
            calibrationReady: false,
            calibrationReason: calibration.reason || 'history-not-ready'
        };
    }
    const merged = {
        serviceCritical: Math.max(base.serviceCritical, Number(calibrated.serviceCritical || 0)),
        smokeCritical: Math.max(base.smokeCritical, Number(calibrated.smokeCritical || 0)),
        contractHigh: Math.max(base.contractHigh, Number(calibrated.contractHigh || 1)),
        contractMedium: Math.max(base.contractMedium, Number(calibrated.contractMedium || 0))
    };
    return {
        threshold: merged,
        dynamicApplied: true,
        calibrated,
        calibrationReady: true,
        calibrationReason: 'history-ready'
    };
}

function classify(summary, threshold) {
    const grouped = summary && summary.groupedFailures ? summary.groupedFailures : {};
    const serviceFailed = getFailureCount(grouped, 'service');
    const smokeFailed = getFailureCount(grouped, 'smoke');
    const contractFailed = getFailureCount(grouped, 'contract');
    const totalFailed = Number(summary && summary.failed ? summary.failed : 0);
    if (serviceFailed > threshold.serviceCritical || smokeFailed > threshold.smokeCritical) {
        return 'critical';
    }
    if (contractFailed > threshold.contractHigh) {
        return 'high';
    }
    if (contractFailed > threshold.contractMedium || totalFailed > 0) {
        return 'medium';
    }
    return 'info';
}

function buildMarkdown(summary, severity, channel, thresholdInfo = {}) {
    const grouped = summary && summary.groupedFailures ? summary.groupedFailures : {};
    const serviceFailed = getFailureCount(grouped, 'service');
    const smokeFailed = getFailureCount(grouped, 'smoke');
    const contractFailed = getFailureCount(grouped, 'contract');
    const total = Number(summary && summary.total ? summary.total : 0);
    const passed = Number(summary && summary.passed ? summary.passed : 0);
    const failed = Number(summary && summary.failed ? summary.failed : 0);
    const lines = [];
    lines.push(`## Service Gate Notification (${String(channel || 'default')})`);
    lines.push('');
    lines.push(`- Severity: ${severity.toUpperCase()}`);
    lines.push(`- GeneratedAt: ${summary && summary.generatedAt ? summary.generatedAt : new Date().toISOString()}`);
    lines.push(`- Total: ${total}, Passed: ${passed}, Failed: ${failed}`);
    lines.push(`- FailedByCategory: service=${serviceFailed}, smoke=${smokeFailed}, contract=${contractFailed}`);
    if (thresholdInfo && thresholdInfo.threshold) {
        lines.push(`- Threshold: serviceCritical=${thresholdInfo.threshold.serviceCritical}, smokeCritical=${thresholdInfo.threshold.smokeCritical}, contractHigh=${thresholdInfo.threshold.contractHigh}, contractMedium=${thresholdInfo.threshold.contractMedium}`);
    }
    if (thresholdInfo && thresholdInfo.dynamicApplied && thresholdInfo.calibrated) {
        lines.push(`- DynamicCalibrated: true (service=${thresholdInfo.calibrated.serviceCritical}, smoke=${thresholdInfo.calibrated.smokeCritical}, contractHigh=${thresholdInfo.calibrated.contractHigh}, contractMedium=${thresholdInfo.calibrated.contractMedium})`);
    } else if (thresholdInfo && thresholdInfo.calibrationReason) {
        lines.push(`- DynamicCalibrated: false (${thresholdInfo.calibrationReason})`);
    }
    lines.push('');
    const failedItems = Array.isArray(summary && summary.results) ? summary.results.filter((x) => !x.ok) : [];
    if (failedItems.length > 0) {
        lines.push('### Failed Tasks');
        lines.push('');
        lines.push('| Name | Category | ExitCode |');
        lines.push('|---|---|---:|');
        for (const item of failedItems) {
            lines.push(`| ${item.name} | ${item.category} | ${item.exitCode} |`);
        }
    } else {
        lines.push('### Failed Tasks');
        lines.push('');
        lines.push('- none');
    }
    lines.push('');
    return lines.join('\n');
}

function buildGovernance(summary, severity, thresholdInfo = {}, channel = 'default') {
    const grouped = summary && summary.groupedFailures ? summary.groupedFailures : {};
    const failedItems = Array.isArray(summary && summary.results) ? summary.results.filter((x) => !x.ok) : [];
    const impactedCategories = Object.keys(grouped).filter((key) => Array.isArray(grouped[key]) && grouped[key].length > 0);
    const bySeverity = {
        critical: {
            level: 'P0',
            decision: 'block-release',
            owner: 'backend-oncall+release-manager',
            slaHours: 1,
            actions: [
                '冻结发布并触发应急群通知',
                '按失败分类执行并行止血处理',
                '修复后重跑 gate+trend+notify 直至恢复'
            ]
        },
        high: {
            level: 'P1',
            decision: 'block-release',
            owner: 'module-owner+qa-owner',
            slaHours: 4,
            actions: [
                '冻结发布并创建高优先级缺陷单',
                '按失败任务逐项修复并补契约回归',
                '修复后重跑 gate+trend+notify 验证'
            ]
        },
        medium: {
            level: 'P2',
            decision: 'allow-with-action',
            owner: 'module-owner',
            slaHours: 24,
            actions: [
                '保持发布受控并登记治理工单',
                '在下个发布窗口前完成修复',
                '完成后重跑 gate+trend+notify 关闭工单'
            ]
        },
        info: {
            level: 'P3',
            decision: 'pass',
            owner: 'release-manager',
            slaHours: 72,
            actions: [
                '发布继续并观察趋势漂移',
                '按周复盘阈值动态校准参数',
                '持续保留历史产物用于后续校准'
            ]
        }
    };
    const policy = bySeverity[severity] || bySeverity.info;
    const ownerByCategory = {
        service: 'service-owner',
        smoke: 'qa-owner',
        contract: 'api-owner'
    };
    const categoryOwners = impactedCategories.map((key) => ({ category: key, owner: ownerByCategory[key] || 'module-owner' }));
    return {
        generatedAt: new Date().toISOString(),
        channel,
        severity,
        level: policy.level,
        decision: policy.decision,
        owner: policy.owner,
        slaHours: policy.slaHours,
        impactedCategories,
        categoryOwners,
        failedCount: failedItems.length,
        failedTasks: failedItems.map((item) => ({ name: item.name, category: item.category, exitCode: item.exitCode })),
        threshold: thresholdInfo && thresholdInfo.threshold ? thresholdInfo.threshold : null,
        dynamicThreshold: {
            applied: Boolean(thresholdInfo && thresholdInfo.dynamicApplied),
            reason: thresholdInfo && thresholdInfo.calibrationReason ? thresholdInfo.calibrationReason : ''
        },
        actions: policy.actions,
        closureChecklist: [
            '重跑 service-quality-gate 并确认失败数归零',
            '刷新 service-gate-trend 并确认阈值策略状态',
            '刷新 service-gate-notify 并归档治理结果'
        ]
    };
}

function buildGovernanceMarkdown(plan) {
    const lines = [];
    lines.push(`## Service Gate Governance (${String(plan.channel || 'default')})`);
    lines.push('');
    lines.push(`- Severity: ${String(plan.severity || 'info').toUpperCase()}`);
    lines.push(`- Level: ${plan.level}`);
    lines.push(`- Decision: ${plan.decision}`);
    lines.push(`- Owner: ${plan.owner}`);
    lines.push(`- SLAHours: ${plan.slaHours}`);
    lines.push(`- FailedCount: ${plan.failedCount}`);
    lines.push(`- DynamicThresholdApplied: ${plan.dynamicThreshold && plan.dynamicThreshold.applied ? 'true' : 'false'}`);
    if (plan.dynamicThreshold && plan.dynamicThreshold.reason) {
        lines.push(`- DynamicReason: ${plan.dynamicThreshold.reason}`);
    }
    lines.push('');
    lines.push('### Category Owners');
    lines.push('');
    lines.push('| Category | Owner |');
    lines.push('|---|---|');
    const owners = Array.isArray(plan.categoryOwners) ? plan.categoryOwners : [];
    if (owners.length === 0) {
        lines.push('| none | none |');
    } else {
        for (const item of owners) {
            lines.push(`| ${item.category} | ${item.owner} |`);
        }
    }
    lines.push('');
    lines.push('### Actions');
    lines.push('');
    const actions = Array.isArray(plan.actions) ? plan.actions : [];
    if (actions.length === 0) {
        lines.push('- none');
    } else {
        for (const item of actions) {
            lines.push(`- ${item}`);
        }
    }
    lines.push('');
    lines.push('### Closure Checklist');
    lines.push('');
    const checklist = Array.isArray(plan.closureChecklist) ? plan.closureChecklist : [];
    if (checklist.length === 0) {
        lines.push('- none');
    } else {
        for (const item of checklist) {
            lines.push(`- ${item}`);
        }
    }
    lines.push('');
    return lines.join('\n');
}

function emitGithubAnnotation(severity, message) {
    if (severity === 'critical' || severity === 'high') {
        console.error(`::error title=Service Gate ${severity.toUpperCase()}::${message}`);
        return;
    }
    if (severity === 'medium') {
        console.error(`::warning title=Service Gate MEDIUM::${message}`);
        return;
    }
    console.log(`::notice title=Service Gate INFO::${message}`);
}

async function notifyWebhook(webhookUrl, payload) {
    if (!webhookUrl) return true;
    try {
        const resp = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload)
        });
        return resp && resp.status >= 200 && resp.status < 300;
    } catch (e) {
        return false;
    }
}

async function main() {
    const summaryPath = toAbs(process.env.SERVICE_GATE_SUMMARY_PATH || 'service-gate-summary.json');
    const notifyJsonPath = process.env.SERVICE_GATE_NOTIFY_JSON_PATH || 'artifacts/service-gate-notify.json';
    const notifyMdPath = process.env.SERVICE_GATE_NOTIFY_MARKDOWN_PATH || 'artifacts/service-gate-notify.md';
    const governanceJsonPath = process.env.SERVICE_GATE_GOVERNANCE_JSON_PATH || 'artifacts/service-gate-governance.json';
    const governanceMdPath = process.env.SERVICE_GATE_GOVERNANCE_MARKDOWN_PATH || 'artifacts/service-gate-governance.md';
    const channel = process.env.SERVICE_GATE_NOTIFY_CHANNEL || 'release';
    const baseThreshold = {
        serviceCritical: Number(process.env.SERVICE_GATE_THRESHOLD_SERVICE_CRITICAL || 0),
        smokeCritical: Number(process.env.SERVICE_GATE_THRESHOLD_SMOKE_CRITICAL || 0),
        contractHigh: Number(process.env.SERVICE_GATE_THRESHOLD_CONTRACT_HIGH || 1),
        contractMedium: Number(process.env.SERVICE_GATE_THRESHOLD_CONTRACT_MEDIUM || 0)
    };
    const useDynamic = String(process.env.SERVICE_GATE_USE_DYNAMIC_THRESHOLD || 'true').toLowerCase() !== 'false';
    const trendPath = process.env.SERVICE_GATE_TREND_PATH || 'artifacts/service-gate-trend.json';
    const summary = readJson(summaryPath);
    if (!summary) {
        const msg = `service gate summary missing: ${summaryPath}`;
        emitGithubAnnotation('medium', msg);
        const payload = { ok: false, severity: 'medium', channel, message: msg, summaryPath };
        writeText(notifyJsonPath, JSON.stringify(payload, null, 2));
        writeText(notifyMdPath, `## Service Gate Notification (${channel})\n\n- Severity: MEDIUM\n- Message: ${msg}\n`);
        const governance = buildGovernance({ groupedFailures: {}, results: [], failed: 1 }, 'medium', {}, channel);
        writeText(governanceJsonPath, JSON.stringify(governance, null, 2));
        writeText(governanceMdPath, buildGovernanceMarkdown(governance) + '\n');
        return;
    }
    const trend = readJson(toAbs(trendPath));
    const thresholdInfo = resolveThreshold(baseThreshold, trend, useDynamic);
    const severity = classify(summary, thresholdInfo.threshold);
    const markdown = buildMarkdown(summary, severity, channel, thresholdInfo);
    const governance = buildGovernance(summary, severity, thresholdInfo, channel);
    const governanceMarkdown = buildGovernanceMarkdown(governance);
    const notifyPayload = {
        ok: Number(summary.failed || 0) === 0,
        severity,
        channel,
        threshold: thresholdInfo.threshold,
        dynamicThreshold: {
            enabled: useDynamic,
            applied: thresholdInfo.dynamicApplied,
            calibrated: thresholdInfo.calibrated
        },
        summaryPath,
        trendPath: toAbs(trendPath),
        governancePath: toAbs(governanceJsonPath),
        governanceMarkdownPath: toAbs(governanceMdPath),
        governance,
        summary
    };
    const jsonAbs = writeText(notifyJsonPath, JSON.stringify(notifyPayload, null, 2));
    const mdAbs = writeText(notifyMdPath, markdown + '\n');
    const governanceJsonAbs = writeText(governanceJsonPath, JSON.stringify(governance, null, 2));
    const governanceMdAbs = writeText(governanceMdPath, governanceMarkdown + '\n');
    emitGithubAnnotation(severity, `summary=${summaryPath}, notifyJson=${jsonAbs}, notifyMd=${mdAbs}`);
    if (process.env.GITHUB_STEP_SUMMARY) {
        fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown + '\n');
        fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, governanceMarkdown + '\n');
    }
    const webhookOk = await notifyWebhook(process.env.SERVICE_GATE_WEBHOOK_URL || '', notifyPayload);
    if (!webhookOk && process.env.SERVICE_GATE_WEBHOOK_URL) {
        console.error('::warning title=Service Gate Webhook::通知发送失败');
    }
    console.log(`service-gate-notify: ok, severity=${severity}, notify=${mdAbs}, governance=${governanceMdAbs}, governanceJson=${governanceJsonAbs}`);
}

main().catch((error) => {
    console.error('service-gate-notify: failed', error && error.stack ? error.stack : error);
    process.exit(1);
});
