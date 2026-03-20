const assert = require('assert');
const streamService = require('../services/stream');

function testPickFields() {
    const list = [{ name: 'a', multicastUrl: 'u1', unknown: 1 }];
    const out = streamService.pickStreamFields(list, ['name', 'multicastUrl', 'unknown']);
    assert.deepStrictEqual(out, [{ name: 'a', multicastUrl: 'u1' }]);
}

function testBatchDeleteByIndices() {
    const list = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }];
    const out = streamService.buildBatchDeleteByIndices(list, [1, 3, 1]);
    assert.strictEqual(out.count, 2);
    assert.deepStrictEqual(out.nextList.map((x) => x.id), [1, 3]);
    assert.deepStrictEqual(out.deletes.map((x) => x.id), [4, 2]);
}

function testDeleteByIndex() {
    const list = [{ id: 1 }, { id: 2 }];
    const ok = streamService.buildDeleteByIndex(list, 1);
    assert.strictEqual(ok.ok, true);
    assert.deepStrictEqual(ok.nextList.map((x) => x.id), [1]);
    assert.deepStrictEqual(ok.removed, { id: 2 });
    const bad = streamService.buildDeleteByIndex(list, 10);
    assert.strictEqual(bad.ok, false);
}

function testMetadataUpdateBuild() {
    const list = [{ udpxyUrl: '', multicastUrl: 'http://a', name: 'old' }];
    const out = streamService.buildStreamForMetadataUpdate(list, {
        multicastUrl: 'http://a',
        update: { name: 'new' },
        defaultHttpParam: ''
    });
    assert.strictEqual(out.next.name, 'new');
    assert.strictEqual(out.deletes.length, 0);
}

function testApplyGlobalFcc() {
    const list = [
        { udpxyUrl: 'http://u', multicastUrl: 'rtp://1' },
        { udpxyUrl: '', multicastUrl: 'http://a' }
    ];
    const out = streamService.applyGlobalFccToStreams(list, 'fcc=8.8.8.8');
    assert.strictEqual(out.val, 'fcc=8.8.8.8');
    assert.strictEqual(out.updatedList[0].httpParam, 'fcc=8.8.8.8');
    assert.strictEqual(out.updatedList[1].httpParam, '');
}

function testPagedView() {
    const list = [
        { name: 'a', isAvailable: true },
        { name: 'b', isAvailable: false },
        { name: 'c', isAvailable: true }
    ];
    const out = streamService.buildPagedStreamsView(list, 2, 2, ['name']);
    assert.deepStrictEqual(out.streams, [{ name: 'c' }]);
    assert.deepStrictEqual(out.pagination, { page: 2, pageSize: 2, total: 3, pages: 2 });
    assert.deepStrictEqual(out.stats, { total: 3, online: 2, offline: 1 });
}

async function testDetectAndPersistSingleOrchestration() {
    const oldProbe = streamService.ffprobeCheckAsync;
    const oldPersist = streamService.persistStreamChanges;
    streamService.ffprobeCheckAsync = async () => ({
        isAvailable: true,
        frameRate: '25',
        bitRate: 1000000,
        speed: '1x',
        resolution: '1920x1080',
        codec: 'h264',
        serviceName: 'svc',
        raw: { ok: true }
    });
    streamService.persistStreamChanges = async () => true;
    try {
        const out = await streamService.detectAndPersistSingle({
            sourceList: [],
            udpxyUrl: 'http://u',
            multicastUrl: 'rtp://1',
            name: '',
            fullUrl: 'http://u/rtp/1',
            defaultHttpParam: 'fcc=1.1.1.1'
        });
        assert.strictEqual(out.saved, true);
        assert.strictEqual(out.payload.isAvailable, true);
        assert.strictEqual(out.payload.name, 'svc');
    } finally {
        streamService.ffprobeCheckAsync = oldProbe;
        streamService.persistStreamChanges = oldPersist;
    }
}

async function testDetectAndPersistBatchOrchestration() {
    const oldCheckBatch = streamService.checkStreamsBatch;
    const oldMerge = streamService.mergeBatchResults;
    const oldPersist = streamService.persistStreamChanges;
    streamService.checkStreamsBatch = async () => [{ multicastUrl: 'rtp://1' }];
    streamService.mergeBatchResults = () => ({ nextList: [{ multicastUrl: 'rtp://1' }], upserts: [{ multicastUrl: 'rtp://1' }], deletes: [] });
    streamService.persistStreamChanges = async () => true;
    try {
        const out = await streamService.detectAndPersistBatch({
            sourceList: [],
            udpxyUrl: 'http://u',
            batchList: ['rtp://1'],
            defaultHttpParam: 'fcc=1.1.1.1'
        });
        assert.strictEqual(out.saved, true);
        assert.strictEqual(out.results.length, 1);
    } finally {
        streamService.checkStreamsBatch = oldCheckBatch;
        streamService.mergeBatchResults = oldMerge;
        streamService.persistStreamChanges = oldPersist;
    }
}

async function main() {
    testPickFields();
    testBatchDeleteByIndices();
    testDeleteByIndex();
    testMetadataUpdateBuild();
    testApplyGlobalFcc();
    testPagedView();
    await testDetectAndPersistSingleOrchestration();
    await testDetectAndPersistBatchOrchestration();
    console.log('stream-service-tests: ok');
}

main().catch((error) => {
    console.error('stream-service-tests: failed', error && error.stack ? error.stack : error);
    process.exit(1);
});
