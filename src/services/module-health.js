const fs = require('fs');
const path = require('path');

const MODULE_REGISTRY = [
    { id: 'core.api-client', file: 'public/js/core/api-client.js' },
    { id: 'core.auth-gate', file: 'public/js/core/auth-gate.js' },
    { id: 'core.dialog', file: 'public/js/core/dialog.js' },
    { id: 'core.storage-keys', file: 'public/js/core/storage-keys.js' },
    { id: 'core.nav-bridge', file: 'public/js/core/nav-bridge.js' },
    { id: 'shared.proxy-utils', file: 'public/js/shared/proxy-utils.js' },
    { id: 'index.input-parser', file: 'public/js/index/input-parser.js' },
    { id: 'index.detect-runner', file: 'public/js/index/detect-runner.js' },
    { id: 'index.range-detect', file: 'public/js/index/range-detect.js' },
    { id: 'index.result-renderer', file: 'public/js/index/result-renderer.js' },
    { id: 'index.bootstrap', file: 'public/js/index/bootstrap.js' },
    { id: 'index.version-manager', file: 'public/js/index/version-manager.js' },
    { id: 'results.settings.fcc', file: 'public/js/results/settings/fcc-settings.js' },
    { id: 'results.settings.group', file: 'public/js/results/settings/group-settings.js' },
    { id: 'results.settings.logo', file: 'public/js/results/settings/logo-settings.js' },
    { id: 'results.settings.proxy', file: 'public/js/results/settings/proxy-settings.js' },
    { id: 'results.settings.epg', file: 'public/js/results/settings/epg-settings.js' },
    { id: 'results.settings.app', file: 'public/js/results/settings/app-settings.js' },
    { id: 'results.persist.version', file: 'public/js/shared/version-manager.js' },
    { id: 'results.persist.webdav', file: 'public/js/results/webdav-manager.js' },
    { id: 'results.persist.manager', file: 'public/js/results/persist-manager.js' },
    { id: 'results.replay-rules', file: 'public/js/results/replay-rules-center.js' },
    { id: 'results.catchup', file: 'public/js/results/catchup-service.js' },
    { id: 'player.catchup', file: 'public/js/player/catchup-service.js' },
    { id: 'player.play-url-resolver', file: 'public/js/player/play-url-resolver.js' },
    { id: 'player.retry-controller', file: 'public/js/player/retry-controller.js' },
    { id: 'player.core-controller', file: 'public/js/player/core-controller.js' },
    { id: 'player.start-kernel', file: 'public/js/player/start-kernel.js' },
    { id: 'player.epg-service', file: 'public/js/player/epg-service.js' },
    { id: 'player.epg-renderer', file: 'public/js/player/epg-renderer.js' },
    { id: 'player.epg-wiring', file: 'public/js/player/epg-wiring.js' },
    { id: 'player.epg-orchestrator', file: 'public/js/player/epg-orchestrator.js' },
    { id: 'player.epg-fallback-renderer', file: 'public/js/player/epg-fallback-renderer.js' },
    { id: 'player.ui-overlay', file: 'public/js/player/ui-overlay.js' },
    { id: 'player.ui-wiring', file: 'public/js/player/ui-wiring.js' },
    { id: 'player.source-wiring', file: 'public/js/player/source-wiring.js' }
];

function toIso(ms) {
    if (!Number.isFinite(ms) || ms <= 0) return '';
    try {
        return new Date(ms).toISOString();
    } catch (e) {
        return '';
    }
}

function readJsonSafe(filePath) {
    try {
        if (!fs.existsSync(filePath)) return null;
        const raw = fs.readFileSync(filePath, 'utf-8');
        if (!raw || !String(raw).trim()) return null;
        return JSON.parse(raw);
    } catch (e) {
        return null;
    }
}

function getRegistrySnapshot(rootDir) {
    const modules = MODULE_REGISTRY.map((entry) => {
        const abs = path.join(rootDir, entry.file);
        const exists = fs.existsSync(abs);
        let mtimeMs = 0;
        if (exists) {
            try {
                const st = fs.statSync(abs);
                mtimeMs = Number(st.mtimeMs || 0);
            } catch (e) {}
        }
        return {
            id: entry.id,
            file: entry.file,
            registered: exists,
            updatedAt: toIso(mtimeMs)
        };
    });
    const total = modules.length;
    const registered = modules.filter((x) => x.registered).length;
    return {
        total,
        registered,
        missing: Math.max(0, total - registered),
        modules
    };
}

function getGateSnapshot(rootDir) {
    const candidatePaths = [
        path.join(rootDir, 'artifacts/service-gate-summary.json'),
        path.join(rootDir, 'service-gate-summary.json')
    ];
    let gate = null;
    let source = '';
    for (const p of candidatePaths) {
        const json = readJsonSafe(p);
        if (json && typeof json === 'object') {
            gate = json;
            source = path.relative(rootDir, p).replace(/\\/g, '/');
            break;
        }
    }
    if (!gate) {
        return {
            source: '',
            generatedAt: '',
            total: 0,
            passed: 0,
            failed: 0,
            passRate: 0
        };
    }
    const total = Number(gate.total || 0);
    const passed = Number(gate.passed || 0);
    const failed = Number(gate.failed || 0);
    const passRate = total > 0 ? Number((passed / total).toFixed(4)) : 0;
    return {
        source,
        generatedAt: String(gate.generatedAt || ''),
        total,
        passed,
        failed,
        passRate
    };
}

function getTrendSnapshot(rootDir) {
    const candidatePaths = [
        path.join(rootDir, 'artifacts/service-gate-trend.json')
    ];
    let trend = null;
    let source = '';
    for (const p of candidatePaths) {
        const json = readJsonSafe(p);
        if (json && typeof json === 'object') {
            trend = json;
            source = path.relative(rootDir, p).replace(/\\/g, '/');
            break;
        }
    }
    if (!trend) {
        return {
            source: '',
            generatedAt: '',
            totalRuns: 0,
            windowRuns: 0,
            avgFailRate: 0,
            p90FailRate: 0,
            calibrationReady: false,
            calibrationReason: '',
            threshold: {
                minRuns: 0,
                alpha: 0,
                maxDrift: 0,
                base: {},
                recommended: {},
                applied: {}
            },
            recent: []
        };
    }
    const summary = trend.summary || {};
    const calibration = trend.thresholdCalibration || {};
    const recent = Array.isArray(trend.recent) ? trend.recent : [];
    const thresholdKeys = ['serviceCritical', 'smokeCritical', 'contractHigh', 'contractMedium'];
    const maxDrift = Number(calibration.maxDrift || 0);
    const recommended = calibration.recommended && typeof calibration.recommended === 'object' ? calibration.recommended : {};
    const applied = calibration.applied && typeof calibration.applied === 'object' ? calibration.applied : {};
    const alertCount = thresholdKeys.filter((k) => Math.abs(Number(recommended[k] || 0) - Number(applied[k] || 0)) > maxDrift).length;
    return {
        source,
        generatedAt: String(trend.generatedAt || ''),
        totalRuns: Number(summary.totalRuns || 0),
        windowRuns: Number(summary.windowRuns || 0),
        avgFailRate: Number(summary.avgFailRate || 0),
        p90FailRate: Number(summary.p90FailRate || 0),
        calibrationReady: !!calibration.ready,
        calibrationReason: String(calibration.reason || ''),
        threshold: {
            minRuns: Number(calibration.minRuns || 0),
            alpha: Number(calibration.alpha || 0),
            maxDrift: Number(calibration.maxDrift || 0),
            base: calibration.base && typeof calibration.base === 'object' ? calibration.base : {},
            recommended,
            applied,
            alertSummary: {
                totalCompared: thresholdKeys.length,
                alertCount
            }
        },
        recent: recent.slice(-5).map((x) => ({
            ts: String(x && x.ts || ''),
            failRate: Number(x && x.failRate || 0),
            failed: Number(x && x.failed || 0),
            serviceFailed: Number(x && x.serviceFailed || 0),
            smokeFailed: Number(x && x.smokeFailed || 0),
            contractFailed: Number(x && x.contractFailed || 0)
        }))
    };
}

function buildSnapshot(rootDir) {
    return {
        generatedAt: new Date().toISOString(),
        registry: getRegistrySnapshot(rootDir),
        gate: getGateSnapshot(rootDir),
        trend: getTrendSnapshot(rootDir)
    };
}

module.exports = {
    MODULE_REGISTRY,
    buildSnapshot
};
