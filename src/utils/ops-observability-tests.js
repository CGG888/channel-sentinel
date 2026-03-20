const ops = require('../services/ops-observability');

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

function main() {
    ops.recordRequest('Detect', 200, 18, '/api/check-stream');
    ops.recordRequest('Detect', 502, 44, '/api/check-stream');
    ops.recordRequest('Player', 200, 12, '/api/player/log');
    const metrics = ops.getDomainMetrics();
    assert(metrics.detect && metrics.detect.requests >= 2, 'detect requests invalid');
    assert(metrics.detect.error5xx >= 1, 'detect error5xx invalid');
    const created = ops.openIncident({
        domain: 'persist',
        severity: 'medium',
        summary: 'persist recovery required',
        source: 'unit-test'
    });
    assert(created && created.id, 'incident create failed');
    const resolved = ops.resolveIncident(created.id, 'done');
    assert(resolved && resolved.status === 'closed', 'incident resolve failed');
    const sop = ops.getSopByDomain('persist');
    assert(sop && Array.isArray(sop.steps) && sop.steps.length > 0, 'sop invalid');
    const lowFreq = ops.getLowFrequencyGovernance({
        whitelist: 'detect',
        lowRequestThreshold: 30,
        latencyThresholdMs: 20
    });
    assert(lowFreq && lowFreq.summary && Array.isArray(lowFreq.domains), 'low-frequency governance invalid');
    const snapshot = ops.snapshot();
    assert(snapshot && snapshot.metrics && snapshot.incidents, 'snapshot invalid');
    console.log('ops-observability-tests: ok');
}

main();
