const { exec } = require('child_process');
const logger = require('../core/logger');
const config = require('../config');
const storage = require('../storage');
const storageMode = require('../storage/mode');
const streamsReader = require('../storage/streams-reader');

const ALL_STREAM_FIELDS = [
    'udpxyUrl', 'multicastUrl', 'name', 'tvgId', 'tvgName', 'logo', 'groupTitle',
    'catchupFormat', 'catchupBase', 'm3uCatchup', 'm3uCatchupSource', 'httpParam',
    'isAvailable', 'lastChecked', 'frameRate', 'bitRate', 'speed', 'resolution', 'codec'
];

class StreamService {
    constructor() {
        this.streamCache = new Map();
        this.CACHE_DURATION = 5 * 60 * 1000; // 5分钟缓存
    }

    /**
     * 使用ffprobe检测流状态
     * @param {string} fullUrl 完整的流URL
     * @param {Function} callback 回调函数 (result) => {}
     */
    ffprobeCheck(fullUrl, callback) {
        // 检查缓存
        const now = Date.now();
        const cached = this.streamCache.get(fullUrl);
        if (cached && (now - cached.timestamp) < this.CACHE_DURATION) {
            return callback(cached.data);
        }

        // 使用json格式输出，便于解析
        const cmd = `ffprobe -v quiet -print_format json -select_streams v:0 -show_streams -show_programs -show_format "${fullUrl}"`;
        exec(cmd, { timeout: 8000 }, (error, stdout, stderr) => {
            let isAvailable = false;
            let frameRate = null;
            let bitRate = null;
            let resolution = null;
            let codec_name = null;
            let service_name = null;
            let raw = null;
            try {
                if (!error && stdout) {
                    const json = JSON.parse(stdout);
                    raw = json;
                    if (json.streams && json.streams.length > 0) {
                        const stream = json.streams[0];
                        isAvailable = stream.codec_type === 'video';
                        codec_name = stream.codec_name || null;
                        if (stream.width && stream.height) {
                            resolution = `${stream.width}x${stream.height}`;
                        }
                        bitRate = stream.bit_rate ? parseInt(stream.bit_rate) : null;
                        // 帧率
                        if (stream.r_frame_rate && stream.r_frame_rate.includes('/')) {
                            const [num, den] = stream.r_frame_rate.split('/').map(Number);
                            if (!isNaN(num) && !isNaN(den) && den !== 0) {
                                frameRate = (num / den).toFixed(2);
                            }
                        }
                    }
                    if (json.programs && Array.isArray(json.programs)) {
                        for (const p of json.programs) {
                            if (p.tags && (p.tags.service_name || p.tags.title)) {
                                service_name = p.tags.service_name || p.tags.title;
                                break;
                            }
                        }
                    }
                    if (!service_name && json.format && json.format.tags) {
                        service_name = json.format.tags.service_name || json.format.tags.title || null;
                    }
                }
            } catch (e) {
                // 解析异常
            }
            // 计算网速
            let speed = null;
            if (bitRate) {
                speed = (bitRate / 8 / 1024).toFixed(2) + ' KB/s';
            }
            const result = {
                isAvailable,
                frameRate,
                bitRate,
                speed,
                resolution,
                codec: codec_name,
                serviceName: service_name,
                raw // 返回原始ffprobe json数据，便于前端调试
            };
            // 缓存
            this.streamCache.set(fullUrl, { data: result, timestamp: Date.now() });
            callback(result);
        });
    }

    ffprobeCheckAsync(fullUrl) {
        return new Promise((resolve, reject) => {
            try {
                this.ffprobeCheck(fullUrl, (result) => resolve(result || {}));
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * 批量检测流
     * @param {string} udpxyUrl UDPXY服务器地址
     * @param {Array} batchList 组播地址列表
     * @param {Function} progressCallback 进度回调 (finished, total, name, multicastUrl, frameRate, bitRate, speed) => {}
     * @returns {Promise<Array>} 检测结果
     */
    async checkStreamsBatch(udpxyUrl, batchList, progressCallback = null) {
        const fixedList = batchList.map(item => {
            if (typeof item === 'string') {
                const [name, multicastUrl] = item.split(',');
                return { name: name ? name.trim() : '', multicastUrl: multicastUrl ? multicastUrl.trim() : '' };
            }
            if (item && typeof item === 'object') {
                return { ...item, multicastUrl: String(item.multicastUrl || '').trim() };
            }
            return item;
        }).filter(item => item.multicastUrl && item.multicastUrl.startsWith('rtp://'));

        if (fixedList.length === 0) {
            throw new Error('无有效组播地址');
        }

        logger.info(`开始执行批量检测，有效任务数: ${fixedList.length}，并发数: 5`, 'StreamService');
        const limit = 5;
        let idx = 0;
        const results = [];
        let finished = 0;

        const runNext = async () => {
            if (idx >= fixedList.length) return;
            const item = fixedList[idx++];
            const multicastUrl = item.multicastUrl || item;
            const name = item.name || '';
            const fullUrl = `${udpxyUrl}/rtp/${multicastUrl.replace('rtp://', '')}`;
            
            await new Promise((resolve) => {
                this.ffprobeCheck(fullUrl, ({ isAvailable, frameRate, bitRate, speed, resolution, codec, serviceName }) => {
                    results.push({
                        ...item,
                        udpxyUrl,
                        multicastUrl,
                        isAvailable,
                        lastChecked: new Date().toISOString(),
                        frameRate: frameRate || '-',
                        bitRate: bitRate ? (bitRate / 1000000).toFixed(2) + 'Mbps' : '-',
                        speed,
                        resolution: resolution || '-',
                        codec: codec || 'h264',
                        name: name || serviceName || '',
                        message: isAvailable ? '流可访问' : '流不可访问'
                    });
                    finished++;
                    if (progressCallback) {
                        progressCallback(finished, fixedList.length, name, multicastUrl, frameRate, bitRate, speed);
                    }
                    resolve();
                });
            });
            await runNext();
        };

        await Promise.all(Array(limit).fill(0).map(() => runNext()));
        logger.info('批量检测完成', 'StreamService');
        return results;
    }

    streamIdentity(stream) {
        return `${String(stream && stream.udpxyUrl ? stream.udpxyUrl : '').trim()}||${String(stream && stream.multicastUrl ? stream.multicastUrl : '').trim()}`;
    }

    findExistingStreamIndex(list, udpxyUrl, multicastUrl) {
        let existingIndex = list.findIndex((item) =>
            String(item.udpxyUrl || '').trim() === String(udpxyUrl || '').trim() &&
            String(item.multicastUrl || '').trim() === String(multicastUrl || '').trim()
        );
        if (existingIndex === -1) {
            const byUrl = list.findIndex((item) => String(item.multicastUrl || '').trim() === String(multicastUrl || '').trim());
            if (byUrl !== -1) existingIndex = byUrl;
        }
        return existingIndex;
    }

    buildBatchMergedStream(prev, udpxyUrl, result) {
        return {
            ...prev,
            udpxyUrl,
            multicastUrl: result.multicastUrl,
            isAvailable: result.isAvailable,
            lastChecked: result.lastChecked,
            frameRate: result.frameRate,
            bitRate: result.bitRate,
            speed: result.speed,
            resolution: result.resolution,
            codec: result.codec
        };
    }

    buildBatchNewStream(udpxyUrl, result, defaultHttpParam = '') {
        return {
            udpxyUrl,
            multicastUrl: result.multicastUrl,
            isAvailable: result.isAvailable,
            lastChecked: result.lastChecked,
            frameRate: result.frameRate,
            bitRate: result.bitRate,
            speed: result.speed,
            resolution: result.resolution,
            codec: result.codec,
            name: result.name || '',
            tvgId: '',
            tvgName: '',
            logo: '',
            groupTitle: '',
            catchupFormat: '',
            catchupBase: '',
            m3uCatchupSource: '',
            httpParam: defaultHttpParam
        };
    }

    mergeBatchResults(globalList, udpxyUrl, results, defaultHttpParam = '') {
        const nextList = Array.isArray(globalList) ? [...globalList] : [];
        const upserts = [];
        const deletes = [];
        const batchResults = Array.isArray(results) ? results : [];
        batchResults.forEach((result) => {
            const existingIndex = this.findExistingStreamIndex(nextList, udpxyUrl, result.multicastUrl);
            if (existingIndex !== -1) {
                const prev = { ...nextList[existingIndex] };
                nextList[existingIndex] = this.buildBatchMergedStream(prev, udpxyUrl, result);
                const next = nextList[existingIndex];
                if (this.streamIdentity(prev) !== this.streamIdentity(next)) deletes.push(prev);
                upserts.push(next);
                return;
            }
            const created = this.buildBatchNewStream(udpxyUrl, result, defaultHttpParam);
            nextList.push(created);
            upserts.push(created);
        });
        return { nextList, upserts, deletes };
    }

    buildDetectFields(udpxyUrl, multicastUrl, probe) {
        return {
            udpxyUrl,
            multicastUrl,
            isAvailable: !!(probe && probe.isAvailable),
            lastChecked: new Date().toISOString(),
            frameRate: probe && probe.frameRate,
            bitRate: probe && probe.bitRate,
            speed: probe && probe.speed,
            resolution: probe && probe.resolution,
            codec: probe && probe.codec
        };
    }

    buildNewStreamRecord(detectFields, name, serviceName, defaultHttpParam = '') {
        return {
            ...detectFields,
            name: name || serviceName || '',
            tvgId: '',
            tvgName: '',
            logo: '',
            groupTitle: '',
            catchupFormat: '',
            catchupBase: '',
            m3uCatchupSource: '',
            httpParam: defaultHttpParam
        };
    }

    upsertDetectedStream(sourceList, { udpxyUrl = '', multicastUrl = '', name = '', probe = {}, defaultHttpParam = '' } = {}) {
        const nextList = Array.isArray(sourceList) ? [...sourceList] : [];
        const existingIndex = this.findExistingStreamIndex(nextList, udpxyUrl, multicastUrl);
        const detectFields = this.buildDetectFields(udpxyUrl, multicastUrl, probe);
        let prev = null;
        if (existingIndex !== -1) {
            prev = { ...nextList[existingIndex] };
            nextList[existingIndex] = { ...prev, ...detectFields };
        } else {
            nextList.push(this.buildNewStreamRecord(detectFields, name, probe.serviceName, defaultHttpParam));
        }
        const next = nextList[existingIndex !== -1 ? existingIndex : (nextList.length - 1)];
        const deletes = [];
        if (prev && this.streamIdentity(prev) !== this.streamIdentity(next)) deletes.push(prev);
        return { nextList, next, deletes, probe };
    }

    buildDetectResponsePayload(next, probe) {
        return {
            isAvailable: !!(probe && probe.isAvailable),
            frameRate: (probe && probe.frameRate) || '-',
            bitRate: (probe && probe.bitRate) ? (probe.bitRate / 1000000).toFixed(2) + 'Mbps' : '-',
            speed: probe && probe.speed,
            resolution: (probe && probe.resolution) || '-',
            codec: (probe && probe.codec) || '-',
            name: (next && next.name) || '',
            raw: probe && probe.raw,
            message: (probe && probe.isAvailable) ? '流可访问' : '流不可访问'
        };
    }

    async persistStreamChanges(nextList, upserts = [], deletes = []) {
        const streamsCfg = config.getConfig('streams') || {};
        config.updateConfig('streams', { ...streamsCfg, streams: nextList });
        if (storageMode.getStorageMode() === 'sqlite') {
            const hasUpserts = Array.isArray(upserts) && upserts.length > 0;
            const hasDeletes = Array.isArray(deletes) && deletes.length > 0;
            if (!hasUpserts && !hasDeletes) {
                await storage.syncConfig('streams', { streams: nextList });
                return true;
            }
            if (hasUpserts) await storage.syncStreamsUpsert(upserts);
            if (hasDeletes) await storage.syncStreamsDeleteByIdentity(deletes);
            return true;
        }
        return config.saveConfigStrict('streams');
    }

    async detectAndPersistSingle({ sourceList = [], udpxyUrl = '', multicastUrl = '', name = '', fullUrl = '', defaultHttpParam = '' } = {}) {
        const probe = await this.ffprobeCheckAsync(fullUrl);
        const changed = this.upsertDetectedStream(sourceList, {
            udpxyUrl,
            multicastUrl,
            name,
            probe,
            defaultHttpParam
        });
        const saved = await this.persistStreamChanges(changed.nextList, [changed.next], changed.deletes);
        return {
            saved: !!saved,
            next: changed.next,
            probe,
            payload: this.buildDetectResponsePayload(changed.next, probe)
        };
    }

    async detectAndPersistBatch({ sourceList = [], udpxyUrl = '', batchList = [], defaultHttpParam = '' } = {}) {
        const results = await this.checkStreamsBatch(udpxyUrl, batchList);
        const merged = this.mergeBatchResults(sourceList, udpxyUrl, results, defaultHttpParam);
        const saved = await this.persistStreamChanges(merged.nextList, merged.upserts, merged.deletes);
        return { saved: !!saved, results };
    }

    buildBatchDeleteByIndices(sourceList, indices) {
        const nextList = Array.isArray(sourceList) ? [...sourceList] : [];
        const sorted = [...new Set(indices)].filter((i) => typeof i === 'number').sort((a, b) => b - a);
        let count = 0;
        const deletes = [];
        for (const idx of sorted) {
            if (idx >= 0 && idx < nextList.length) {
                deletes.push(nextList[idx]);
                nextList.splice(idx, 1);
                count++;
            }
        }
        return { nextList, deletes, count };
    }

    buildDeleteByIndex(sourceList, index) {
        const nextList = Array.isArray(sourceList) ? [...sourceList] : [];
        if (index < 0 || index >= nextList.length) {
            return { ok: false, nextList, removed: null };
        }
        const removed = nextList[index];
        nextList.splice(index, 1);
        return { ok: true, nextList, removed };
    }

    async clearAllStreams() {
        const streamsCfg = config.getConfig('streams') || {};
        config.updateConfig('streams', { ...streamsCfg, streams: [] });
        if (storageMode.getStorageMode() === 'sqlite') {
            await storage.clearStreams();
            return true;
        }
        return config.saveConfigStrict('streams');
    }

    async loadSourceStreams(memoryStreams = []) {
        return streamsReader.loadStreamsFallback(memoryStreams);
    }

    pickStreamFields(list, fields) {
        if (!Array.isArray(fields) || fields.length === 0) return list;
        const selected = fields.filter((f) => ALL_STREAM_FIELDS.includes(f));
        if (!selected.length) return list;
        return list.map((s) => {
            const x = {};
            for (const f of selected) x[f] = s[f];
            return x;
        });
    }

    buildStreamStats(list) {
        const source = Array.isArray(list) ? list : [];
        const total = source.length;
        const online = source.filter((s) => !!(s && s.isAvailable)).length;
        return { total, online, offline: Math.max(0, total - online) };
    }

    buildPagedStreamsView(list, page, pageSize, fields) {
        const source = Array.isArray(list) ? list : [];
        if (!(pageSize > 0)) {
            return {
                streams: this.pickStreamFields(source, fields),
                stats: this.buildStreamStats(source)
            };
        }
        const total = source.length;
        const pages = Math.max(1, Math.ceil(total / pageSize));
        const current = Math.min(Math.max(page, 1), pages);
        const start = (current - 1) * pageSize;
        const pageList = source.slice(start, start + pageSize);
        return {
            streams: this.pickStreamFields(pageList, fields),
            pagination: { page: current, pageSize, total, pages },
            stats: this.buildStreamStats(source)
        };
    }

    async readStreamsView({ page = 1, pageSize = 0, fields = [], memoryStreams = [] } = {}) {
        if (streamsReader.shouldReadFromSqlite() && pageSize > 0) {
            const paged = await streamsReader.readStreamsPageFromSqlite(page, pageSize);
            if (paged && Array.isArray(paged.streams)) {
                return {
                    streams: this.pickStreamFields(paged.streams, fields),
                    pagination: paged.pagination,
                    stats: paged.stats || null
                };
            }
        }
        const list = await streamsReader.loadStreamsFallback(memoryStreams);
        if (streamsReader.shouldReadFromSqlite()) {
            const streamsCfg = config.getConfig('streams') || {};
            config.updateConfig('streams', { ...streamsCfg, streams: Array.isArray(list) ? list : [] });
        }
        return this.buildPagedStreamsView(Array.isArray(list) ? list : [], page, pageSize, fields);
    }

    async readStreamStats(memoryStreams = []) {
        if (streamsReader.shouldReadFromSqlite()) {
            const stats = await streamsReader.readStreamStatsFromSqlite();
            if (stats) return stats;
        }
        return this.buildStreamStats(memoryStreams);
    }

    async reconcileStreams(memoryStreams = []) {
        return streamsReader.reconcileStreamsWithMemory(memoryStreams);
    }

    async updateStreamMetadataAndPersist({ sourceList = [], udpxyUrl = '', multicastUrl = '', update = {}, defaultHttpParam = '' } = {}) {
        const changed = this.buildStreamForMetadataUpdate(sourceList, {
            udpxyUrl,
            multicastUrl,
            update,
            defaultHttpParam
        });
        const saved = await this.persistStreamChanges(changed.nextList, [changed.next], changed.deletes);
        return { saved: !!saved, stream: changed.next };
    }

    buildStreamForMetadataUpdate(list, { udpxyUrl = '', multicastUrl = '', update = {}, defaultHttpParam = '' } = {}) {
        const nextList = Array.isArray(list) ? [...list] : [];
        let index = -1;
        if (udpxyUrl) {
            index = nextList.findIndex((item) => item.udpxyUrl === udpxyUrl && item.multicastUrl === multicastUrl);
        }
        if (index === -1) {
            index = nextList.findIndex((item) => item.multicastUrl === multicastUrl);
        }
        if (index === -1) {
            const obj = {
                udpxyUrl,
                multicastUrl,
                isAvailable: false,
                lastChecked: new Date().toISOString(),
                catchupFormat: 'default',
                catchupBase: '',
                m3uCatchupSource: '',
                httpParam: defaultHttpParam
            };
            nextList.push(obj);
            index = nextList.length - 1;
        }
        const prev = { ...nextList[index] };
        nextList[index] = { ...nextList[index], ...update };
        const next = nextList[index];
        const deletes = this.streamIdentity(prev) !== this.streamIdentity(next) ? [prev] : [];
        return { nextList, next, deletes };
    }

    applyGlobalFccToStreams(list, fcc) {
        const val = String(fcc || '').includes('=') ? String(fcc || '') : `fcc=${fcc}`;
        const source = Array.isArray(list) ? list : [];
        const updatedList = source.map((s) => {
            const u = String(s.multicastUrl || '').trim();
            const scheme = u.split(':')[0].toLowerCase();
            const isMulticast = !!s.udpxyUrl || scheme === 'rtp' || scheme === 'udp';
            return { ...s, httpParam: isMulticast ? val : '' };
        });
        return { val, updatedList };
    }

    async applyGlobalFccAndPersist(list, fcc) {
        const applied = this.applyGlobalFccToStreams(list, fcc);
        const saved = await this.persistStreamChanges(applied.updatedList, applied.updatedList, []);
        return { saved: !!saved, ...applied };
    }

    /**
     * 清理缓存
     */
    clearCache() {
        this.streamCache.clear();
    }

    /**
     * 获取缓存大小
     * @returns {number}
     */
    getCacheSize() {
        return this.streamCache.size;
    }

    /**
     * 获取缓存信息
     * @returns {Array} 缓存条目
     */
    getCacheInfo() {
        const now = Date.now();
        return Array.from(this.streamCache.entries()).map(([url, { timestamp }]) => ({
            url,
            age: now - timestamp,
            expired: (now - timestamp) > this.CACHE_DURATION
        }));
    }
}

// 创建单例实例
const streamService = new StreamService();

module.exports = streamService;
