(function () {
    const ns = (window.IptvCore = window.IptvCore || {});
    const player = (ns.player = ns.player || {});
    const catchup = (player.catchup = player.catchup || {});

    catchup.buildQuery = function (params) {
        const p = params || {};
        return new URLSearchParams({
            scope: String(p.scope || 'internal'),
            fmt: String(p.fmt || 'default'),
            proto: String(p.proto || 'http'),
            name: String(p.name || ''),
            tvgName: String(p.tvgName || ''),
            resolution: String(p.resolution || ''),
            frameRate: String(p.frameRate || ''),
            multicastUrl: String(p.multicastUrl || ''),
            catchupBase: String(p.catchupBase || ''),
            startMs: String(p.startMs || ''),
            endMs: String(p.endMs || '')
        });
    };

    catchup.requestPlay = function (params) {
        const qs = catchup.buildQuery(params);
        return apiJson('/api/catchup/play?' + qs.toString());
    };

    catchup.buildParamsFromStreamProgram = function (stream, program, options) {
        const s = stream || {};
        const p = program || {};
        const o = options || {};
        const fmt = String(o.fmt || s.catchupFormat || 'default');
        const rawProto = String((o.proto || s.catchupBase || s.multicastUrl || '')).split(':')[0].toLowerCase();
        const proto = rawProto === 'rtsp' ? 'rtsp' : 'http';
        return {
            scope: o.scope || 'internal',
            fmt,
            proto,
            name: s.name || s.tvgName || s.tvgId || '',
            tvgName: s.tvgName || '',
            resolution: s.resolution || '',
            frameRate: s.frameRate || '',
            multicastUrl: s.sourceMulticastUrl || s.multicastUrl || '',
            catchupBase: s.catchupBase || '',
            startMs: p.startMs,
            endMs: p.endMs
        };
    };

    catchup.buildReplayParamsWithFallback = function (stream, program, options) {
        if (typeof catchup.buildParamsFromStreamProgram === 'function') {
            return catchup.buildParamsFromStreamProgram(stream, program, options);
        }
        const s = stream || {};
        const p = program || {};
        const o = options || {};
        return {
            scope: o.scope || 'internal',
            fmt: (s && s.catchupFormat) ? String(s.catchupFormat) : 'default',
            proto: ((String((s && s.catchupBase) || (s && s.multicastUrl) || '').split(':')[0] || '').toLowerCase() === 'rtsp') ? 'rtsp' : 'http',
            name: s.name || s.tvgName || s.tvgId || '',
            tvgName: s.tvgName || '',
            resolution: s.resolution || '',
            frameRate: s.frameRate || '',
            multicastUrl: s.sourceMulticastUrl || s.multicastUrl || '',
            catchupBase: s.catchupBase || '',
            startMs: p.startMs,
            endMs: p.endMs
        };
    };

    catchup.buildReplayPlayerOptions = function (scope, resolver) {
        return {
            scope: scope || 'internal',
            resolver: resolver || null
        };
    };

    catchup.requestFromStreamProgram = function (stream, program, options) {
        return catchup.requestPlay(catchup.buildParamsFromStreamProgram(stream, program, options));
    };

    catchup.requestReplayWithFallback = function (stream, program, options) {
        const s = stream || {};
        const p = program || {};
        const o = options || {};
        if (typeof catchup.requestFromStreamProgram === 'function') {
            return catchup.requestFromStreamProgram(s, p, o);
        }
        if (typeof catchup.fromStreamProgram === 'function') {
            return catchup.fromStreamProgram(s, p, o);
        }
        const replayParams = catchup.buildParamsFromStreamProgram(s, p, o);
        if (typeof catchup.requestPlay === 'function') {
            return catchup.requestPlay(replayParams);
        }
        return apiJson('/api/catchup/play?' + new URLSearchParams(replayParams).toString());
    };

    catchup.requestReplayRequestWithFallback = function (stream, program, options) {
        const s = stream || {};
        const p = program || {};
        const o = options || {};
        if (typeof catchup.requestReplayWithFallback === 'function') {
            return catchup.requestReplayWithFallback(s, p, o);
        }
        if (typeof catchup.requestFromStreamProgram === 'function') {
            return catchup.requestFromStreamProgram(s, p, o);
        }
        if (typeof catchup.fromStreamProgram === 'function') {
            return catchup.fromStreamProgram(s, p, o);
        }
        const replayParams = catchup.buildParamsFromStreamProgram(s, p, o);
        if (typeof catchup.requestPlay === 'function') {
            return catchup.requestPlay(replayParams);
        }
        return apiJson('/api/catchup/play?' + new URLSearchParams(replayParams).toString());
    };

    catchup.requestReplayApiFallback = function (stream, program, options) {
        const replayParams = catchup.buildParamsFromStreamProgram(stream, program, options);
        return apiJson('/api/catchup/play?' + new URLSearchParams(replayParams).toString());
    };

    catchup.requestReplayWithEntryFallback = function (stream, program, options) {
        if (typeof catchup.requestReplayRequestWithFallback === 'function') {
            return catchup.requestReplayRequestWithFallback(stream, program, options);
        }
        if (typeof catchup.requestReplayApiFallback === 'function') {
            return catchup.requestReplayApiFallback(stream, program, options);
        }
        const replayParams = catchup.buildParamsFromStreamProgram(stream, program, options);
        return apiJson('/api/catchup/play?' + new URLSearchParams(replayParams).toString());
    };

    catchup.hasReplayUrl = function (response) {
        const x = response || {};
        return !!(x && x.success && x.url);
    };

    catchup.getReplayFailureMessage = function (response, error) {
        const x = response || {};
        if (error != null) {
            return '回放请求失败: ' + String(error);
        }
        if (x && x.message) {
            return '无法获取回放地址: ' + String(x.message);
        }
        return '无法获取回放地址';
    };

    catchup.getReplayAlertMessageWithFallback = function (outcome, response, error) {
        const o = outcome || {};
        if (o && o.message) {
            return String(o.message);
        }
        if (typeof catchup.getReplayFailureMessage === 'function') {
            return catchup.getReplayFailureMessage(response, error);
        }
        if (error != null) {
            return '回放请求失败: ' + String(error);
        }
        return '无法获取回放地址';
    };

    catchup.resolveReplayAlertWithFallback = function (outcome, response, error) {
        if (typeof catchup.getReplayAlertMessageWithFallback === 'function') {
            return catchup.getReplayAlertMessageWithFallback(outcome, response, error);
        }
        const o = outcome || {};
        return (o && o.message) ? String(o.message) : catchup.getReplayFailureMessage(response, error);
    };

    catchup.getReplayDecision = function (response, error) {
        if (error != null) {
            return { ok: false, message: catchup.getReplayFailureMessage(null, error) };
        }
        const ok = catchup.hasReplayUrl(response);
        if (ok) {
            return { ok: true, message: '' };
        }
        return { ok: false, message: catchup.getReplayFailureMessage(response) };
    };

    catchup.buildReplayMeta = function (stream, program, options) {
        const s = stream || {};
        const p = program || {};
        const o = options || {};
        return {
            title: s.name || s.tvgName || '',
            mode: '回放',
            cast: '单播',
            programTitle: p.title || '',
            scope: String(o.scope || 'internal')
        };
    };

    catchup.getReplayMetaWithFallback = function (stream, program, options) {
        if (typeof catchup.buildReplayMeta === 'function') {
            return catchup.buildReplayMeta(stream, program, options);
        }
        const s = stream || {};
        const p = program || {};
        const o = options || {};
        return {
            title: s.name || s.tvgName || '',
            mode: '回放',
            cast: '单播',
            programTitle: p.title || '',
            scope: String(o.scope || 'internal')
        };
    };

    catchup.buildReplayLogPayload = function (stream, program, options) {
        const s = stream || {};
        const p = program || {};
        const o = options || {};
        return {
            name: s.name || s.tvgName || '',
            tvgName: s.tvgName || '',
            mode: '回放',
            cast: '单播',
            scope: String(o.scope || 'internal'),
            programTitle: p.title || '',
            url: String(o.url || '')
        };
    };

    catchup.getReplayLogPayloadWithFallback = function (stream, program, options) {
        if (typeof catchup.buildReplayLogPayload === 'function') {
            return catchup.buildReplayLogPayload(stream, program, options);
        }
        const s = stream || {};
        const p = program || {};
        const o = options || {};
        return {
            name: s.name || s.tvgName || '',
            tvgName: s.tvgName || '',
            mode: '回放',
            cast: '单播',
            scope: String(o.scope || 'internal'),
            programTitle: p.title || '',
            url: String(o.url || '')
        };
    };

    catchup.reportReplayLog = function (payload) {
        const body = payload || {};
        try {
            return apiJson('/api/player/log', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            }).catch(function () { });
        } catch (e) {
            return Promise.resolve();
        }
    };

    catchup.reportPlayerLogWithFallback = function (payload) {
        if (typeof catchup.reportReplayLog === 'function') {
            return catchup.reportReplayLog(payload);
        }
        const body = payload || {};
        try {
            return apiJson('/api/player/log', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            }).catch(function () { });
        } catch (e) {
            return Promise.resolve();
        }
    };

    catchup.getReplayPlayContextWithFallback = function (response, stream, program, options) {
        const s = stream || {};
        const p = program || {};
        const o = options || {};
        const scope = String(o.scope || 'internal');
        const resolver = o.resolver || null;
        const replayMeta = catchup.getReplayMetaWithFallback(s, p, { scope });
        const resolvePromise = (resolver && typeof resolver.resolveReplayFromResponse === 'function')
            ? resolver.resolveReplayFromResponse(response, replayMeta)
            : (function () {
                const src = response && response.url ? response.url : '';
                const raw = String(src || '').indexOf('$') > -1 ? String(src || '').split('$')[0] : String(src || '');
                if (resolver && typeof resolver.resolveReplayPlayUrl === 'function') {
                    return resolver.resolveReplayPlayUrl(raw, replayMeta).then(function (playUrl) {
                        return { raw, playUrl };
                    });
                }
                if (resolver && typeof resolver.resolveReplay === 'function') {
                    return resolver.resolveReplay(raw).then(function (playUrl) {
                        return { raw, playUrl };
                    });
                }
                if (resolver && typeof resolver.resolveReplayFallback === 'function') {
                    return resolver.resolveReplayFallback(raw, replayMeta).then(function (playUrl) {
                        return { raw, playUrl };
                    });
                }
                return Promise.resolve({ raw, playUrl: '/api/proxy/stream?url=' + encodeURIComponent(raw) });
            })();
        return resolvePromise.then(function (replayCtx) {
            return {
                replayCtx,
                logPayload: catchup.getReplayLogPayloadWithFallback(s, p, { scope, url: replayCtx.raw })
            };
        });
    };

    catchup.resolveReplayStateWithFallback = function (response, stream, program, options) {
        const s = stream || {};
        const p = program || {};
        const o = options || {};
        const scope = String(o.scope || 'internal');
        const resolver = o.resolver || null;
        if (typeof catchup.getReplayPlayContextWithFallback === 'function') {
            return catchup.getReplayPlayContextWithFallback(response, s, p, { scope, resolver });
        }
        const replayMeta = catchup.getReplayMetaWithFallback(s, p, { scope });
        const replayReq = (resolver && typeof resolver.resolveReplayFromResponse === 'function')
            ? resolver.resolveReplayFromResponse(response, replayMeta)
            : Promise.resolve({
                raw: String(response && response.url ? response.url : '').split('$')[0],
                playUrl: '/api/proxy/stream?url=' + encodeURIComponent(String(response && response.url ? response.url : '').split('$')[0])
            });
        return replayReq.then(function (replayCtx) {
            return {
                replayCtx,
                logPayload: catchup.getReplayLogPayloadWithFallback(s, p, { scope, url: replayCtx.raw })
            };
        });
    };

    catchup.resolveReplayOutcomeWithFallback = function (response, error, stream, program, options) {
        const s = stream || {};
        const p = program || {};
        const o = options || {};
        const decision = catchup.getReplayDecision(response, error);
        if (!decision.ok) {
            return Promise.resolve({ ok: false, message: String(decision.message || '无法获取回放地址') });
        }
        return catchup.resolveReplayStateWithFallback(response, s, p, o).then(function (replayState) {
            return { ok: true, replayState, message: '' };
        }).catch(function (e) {
            return { ok: false, message: catchup.getReplayFailureMessage(null, e) };
        });
    };

    catchup.resolveReplayOutcomeLegacyFallback = function (response, stream, program, options) {
        const s = stream || {};
        const p = program || {};
        const o = options || {};
        const decision = catchup.getReplayDecision(response, null);
        if (!decision.ok) {
            return Promise.resolve({ ok: false, message: String(decision.message || '无法获取回放地址') });
        }
        const raw = String(response && response.url ? response.url : '').split('$')[0];
        return Promise.resolve({
            ok: true,
            replayState: {
                replayCtx: { raw: raw, playUrl: '/api/proxy/stream?url=' + encodeURIComponent(raw) },
                logPayload: catchup.getReplayLogPayloadWithFallback(s, p, { scope: String(o.scope || 'internal'), url: raw })
            },
            message: ''
        });
    };

    catchup.resolveReplayOutcomeEntry = function (response, error, stream, program, options) {
        if (typeof catchup.resolveReplayOutcomeWithFallback === 'function') {
            return catchup.resolveReplayOutcomeWithFallback(response, error, stream, program, options);
        }
        if (error == null && typeof catchup.resolveReplayOutcomeLegacyFallback === 'function') {
            return catchup.resolveReplayOutcomeLegacyFallback(response, stream, program, options);
        }
        return Promise.resolve({ ok: false, message: catchup.getReplayFailureMessage(response, error) });
    };

    catchup.resolveReplayOutcomeWithEntryFallback = function (response, error, stream, program, options) {
        if (typeof catchup.resolveReplayOutcomeEntry === 'function') {
            return catchup.resolveReplayOutcomeEntry(response, error, stream, program, options);
        }
        if (typeof catchup.resolveReplayOutcomeWithFallback === 'function') {
            return catchup.resolveReplayOutcomeWithFallback(response, error, stream, program, options);
        }
        if (error == null && typeof catchup.resolveReplayOutcomeLegacyFallback === 'function') {
            return catchup.resolveReplayOutcomeLegacyFallback(response, stream, program, options);
        }
        return Promise.resolve({ ok: false, message: catchup.getReplayFailureMessage(response, error) });
    };

    catchup.fromStreamProgram = function (stream, program, options) {
        return catchup.requestFromStreamProgram(stream, program, options);
    };

    // 统一回放执行入口：请求 → 解析 outcome → 解析 alert，全部在模块内完成 fallback
    // handlers: { onSuccess: fn(replayState, replayCtx), onFailure: fn(message), onError: fn(message) }
    catchup.executeReplay = function (stream, program, options, handlers) {
        const s = stream || {};
        const p = program || {};
        const o = options || {};
        const scope = o.scope || 'internal';
        const resolver = o.resolver || null;
        const replayOptions = { scope: scope, resolver: resolver };

        // 请求
        const req = (typeof catchup.requestReplayWithEntryFallback === 'function')
            ? catchup.requestReplayWithEntryFallback(s, p, replayOptions)
            : (typeof catchup.requestReplayApiFallback === 'function')
                ? catchup.requestReplayApiFallback(s, p, replayOptions)
                : catchup.requestPlay(catchup.buildParamsFromStreamProgram(s, p, replayOptions));

        return req.then(function (response) {
            // 解析 outcome
            const outcomeFn = (typeof catchup.resolveReplayOutcomeWithEntryFallback === 'function')
                ? catchup.resolveReplayOutcomeWithEntryFallback
                : (typeof catchup.resolveReplayOutcomeWithFallback === 'function')
                    ? catchup.resolveReplayOutcomeWithFallback
                    : catchup.resolveReplayOutcomeLegacyFallback;
            return outcomeFn(response, null, s, p, { scope: scope, resolver: resolver });
        }).then(function (outcome) {
            if (!outcome || !outcome.ok) {
                // 解析 alert
                const alertFn = (typeof catchup.resolveReplayAlertWithFallback === 'function')
                    ? catchup.resolveReplayAlertWithFallback
                    : catchup.getReplayAlertMessageWithFallback;
                const msg = alertFn(outcome, null, null);
                if (handlers && typeof handlers.onFailure === 'function') {
                    handlers.onFailure(msg);
                }
                return;
            }
            if (handlers && typeof handlers.onSuccess === 'function') {
                handlers.onSuccess(outcome.replayState, outcome.replayState.replayCtx);
            }
        }).catch(function (err) {
            // 解析 error outcome
            const outcomeFn = (typeof catchup.resolveReplayOutcomeWithEntryFallback === 'function')
                ? catchup.resolveReplayOutcomeWithEntryFallback
                : (typeof catchup.resolveReplayOutcomeWithFallback === 'function')
                    ? catchup.resolveReplayOutcomeWithFallback
                    : null;
            const promise = outcomeFn
                ? outcomeFn(null, err, s, p, { scope: scope, resolver: resolver })
                : Promise.resolve({ ok: false, message: catchup.getReplayFailureMessage(null, err) });
            return promise.then(function (outcome) {
                const alertFn = (typeof catchup.resolveReplayAlertWithFallback === 'function')
                    ? catchup.resolveReplayAlertWithFallback
                    : catchup.getReplayAlertMessageWithFallback;
                const msg = alertFn(outcome, null, err);
                if (handlers && typeof handlers.onError === 'function') {
                    handlers.onError(msg);
                }
            });
        });
    };
})();
