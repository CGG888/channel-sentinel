const config = require('../config');
const exportService = require('./export');
const replayRules = require('./replay-rules');

class CatchupService {
    constructor() {
        this.settings = config.getConfig('appSettings');
        this.streams = config.getConfig('streams');
    }

    containsRtpPath(s) {
        try {
            const uo = new URL(s);
            return /\/rtp\//i.test(uo.pathname);
        } catch(e) {
            return /\/rtp\//i.test(String(s || ''));
        }
    }

    resolveManualBaseForExternal(manualBase, scope, proto = 'http') {
        const cb = String(manualBase || '').trim();
        if (!cb) return '';
        if (scope !== 'external') return cb;
        const proxyBase = exportService.getProxyByType('单播代理');
        let pb = proxyBase && proxyBase.url ? String(proxyBase.url).trim() : '';
        if (pb && !/^https?:\/\//i.test(pb)) pb = 'http://' + pb.replace(/^\/+/, '');
        if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(cb)) {
            return exportService.buildExternalUnicastUrl(cb, pb, { defaultScheme: proto || 'http' });
        }
        let path = cb;
        const rtpIdx = path.indexOf('/rtp/');
        if (rtpIdx > -1) path = path.slice(rtpIdx);
        else path = path.startsWith('/') ? path : '/' + path;
        const pbNorm = exportService.normalizeBaseUrl(pb).replace(/\/+$/, '');
        return pbNorm ? (pbNorm + path) : path;
    }

    resolveBaseFromLiveUrl(sourceLiveUrl, scope, proto) {
        const live = String(sourceLiveUrl || '').trim();
        if (!live) return { success: false, message: 'empty live url' };
        const resolved = replayRules.resolveReplayBase({
            liveUrl: live,
            scope,
            protocol: proto
        });
        if (!resolved.success || !resolved.baseUrl) return { success: false, message: resolved.message || resolved.errorCode || 'base resolve failed' };
        let baseUrl = resolved.baseUrl;
        if (scope === 'external') {
            const proxyBase = exportService.getProxyByType('单播代理');
            const pb = proxyBase && proxyBase.url ? String(proxyBase.url).trim() : '';
            baseUrl = exportService.buildExternalUnicastUrl(resolved.baseUrl, pb, { defaultScheme: proto || 'http' });
        }
        return {
            success: true,
            baseUrl,
            baseRuleId: resolved.baseRuleId || '',
            hitSource: resolved.hitSource || ''
        };
    }

    resolveCatchupProfile(params = {}) {
        const {
            scope = 'internal',
            fmt = 'default',
            proto = 'http',
            name = '',
            tvgName = '',
            resolution = '',
            frameRate = '',
            multicastUrl = '',
            catchupBase = ''
        } = params;
        const u = String(multicastUrl || '').trim();
        const scheme = u ? u.split(':')[0].toLowerCase() : '';
        const isMulti = !!u && (scheme === 'rtp' || scheme === 'udp');
        let unicastBase = '';
        let baseRuleId = '';
        let hitSource = catchupBase ? 'manual_override' : '';
        let sourceLiveUrl = '';
        if (catchupBase) {
            unicastBase = this.resolveManualBaseForExternal(String(catchupBase || '').split('$')[0], scope, proto);
        } else {
            let chosenLiveUrl = '';
            if (u && !isMulti && exportService.isHttpUrl(u)) {
                chosenLiveUrl = String(u || '').split('$')[0];
            }
            if (!chosenLiveUrl) {
                const nm = tvgName || name || '';
                const match = exportService.findUnicastMatchByMeta(nm, resolution, frameRate);
                if (match && exportService.isHttpUrl(match.multicastUrl)) {
                    chosenLiveUrl = String(match.multicastUrl || '').split('$')[0];
                }
            }
            if (!chosenLiveUrl) return { success: false, message: 'no valid unicast http base for external catchup' };
            sourceLiveUrl = chosenLiveUrl;
            const baseResolved = this.resolveBaseFromLiveUrl(chosenLiveUrl, scope, proto);
            if (!baseResolved.success) return { success: false, message: baseResolved.message || 'no valid unicast http base for external catchup' };
            unicastBase = baseResolved.baseUrl || '';
            baseRuleId = baseResolved.baseRuleId || '';
            hitSource = baseResolved.hitSource || '';
            if (scope === 'external' && (!unicastBase || this.containsRtpPath(unicastBase))) {
                return { success: false, message: 'no valid unicast http base for external catchup' };
            }
        }
        if (scope === 'external' && this.containsRtpPath(unicastBase)) {
            return { success: false, message: 'unicast base contains multicast path' };
        }
        if (unicastBase && unicastBase.indexOf('$') !== -1) unicastBase = unicastBase.split('$')[0];
        if (!unicastBase) return { success: false, message: 'no unicast base' };
        const sourceBuilt = replayRules.buildCatchupSourceTemplate({
            baseUrl: unicastBase,
            fmt,
            proto
        });
        return {
            success: true,
            baseUrl: unicastBase,
            sourceTemplate: sourceBuilt && sourceBuilt.success ? (sourceBuilt.source || '') : '',
            sourceError: sourceBuilt && !sourceBuilt.success ? (sourceBuilt.errorCode || sourceBuilt.message || '') : '',
            baseRuleId,
            timeRuleId: sourceBuilt && sourceBuilt.success ? (sourceBuilt.timeRuleId || '') : '',
            hitSource,
            sourceLiveUrl
        };
    }

    previewCatchup(params = {}) {
        const {
            scope = 'internal',
            fmt = 'default',
            proto = 'http',
            startMs = 0,
            endMs = 0
        } = params;
        const profile = this.resolveCatchupProfile(params);
        if (!profile.success) return profile;
        let previewUrl = '';
        let previewTimeRuleId = '';
        if (startMs > 0 && endMs > 0 && endMs > startMs) {
            const built = replayRules.buildReplayUrl({
                baseUrl: profile.baseUrl || '',
                fmt,
                proto,
                startMs,
                endMs
            });
            if (built.success) {
                previewUrl = built.url || '';
                previewTimeRuleId = built.timeRuleId || '';
            }
        }
        return {
            success: true,
            baseUrl: profile.baseUrl || '',
            sourceTemplate: profile.sourceTemplate || '',
            previewUrl,
            meta: {
                baseRuleId: profile.baseRuleId || '',
                timeRuleId: previewTimeRuleId || profile.timeRuleId || '',
                hitSource: profile.hitSource || '',
                sourceLiveUrl: profile.sourceLiveUrl || '',
                sourceError: profile.sourceError || ''
            }
        };
    }

    generateCatchupUrl(params) {
        const {
            scope = 'internal',
            fmt = 'iso8601',
            proto = 'http',
            name = '',
            tvgName = '',
            resolution = '',
            frameRate = '',
            multicastUrl = '',
            catchupBase = '',
            startMs = 0,
            endMs = 0
        } = params;
        if (!(startMs > 0 && endMs > 0 && endMs > startMs)) {
            return { success: false, message: 'invalid time' };
        }
        const profile = this.resolveCatchupProfile({
            scope,
            fmt,
            proto,
            name,
            tvgName,
            resolution,
            frameRate,
            multicastUrl,
            catchupBase
        });
        if (!profile.success) return { success: false, message: profile.message || 'no unicast base' };
        const built = replayRules.buildReplayUrl({
            baseUrl: profile.baseUrl || '',
            fmt,
            proto,
            startMs,
            endMs
        });
        if (!built.success) {
            replayRules.trackHit({
                type: 'catchup_play',
                scope,
                fmt,
                proto,
                baseRuleId: profile.baseRuleId || '',
                hitSource: profile.hitSource || '',
                success: false,
                errorCode: built.errorCode || ''
            });
            return { success: false, message: built.message || built.errorCode || 'replay rules failed' };
        }
        replayRules.trackHit({
            type: 'catchup_play',
            scope,
            fmt,
            proto,
            baseRuleId: profile.baseRuleId || '',
            timeRuleId: built.timeRuleId || '',
            hitSource: profile.hitSource || '',
            success: true
        });
        return {
            success: true,
            url: built.url,
            meta: {
                baseRuleId: profile.baseRuleId || '',
                timeRuleId: built.timeRuleId || '',
                hitSource: profile.hitSource || ''
            }
        };
    }
}

const catchupService = new CatchupService();

module.exports = catchupService;
