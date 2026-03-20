(function () {
    const ns = (window.IptvCore = window.IptvCore || {});
    const player = (ns.player = ns.player || {});
    const resolver = (player.playUrlResolver = player.playUrlResolver || {});

    function buildProxyPlayUrl(src, metadata) {
        const raw = String(src || '');
        const isM3u8 = /\.m3u8(\?|$)/i.test(raw) || raw.toLowerCase().indexOf('m3u8') > -1;
        const base = isM3u8 ? '/api/proxy/hls?url=' : '/api/proxy/stream?url=';
        const params = [];
        const meta = metadata || {};
        const title = String(meta.title || '');
        if (title) params.push('title=' + encodeURIComponent(title));
        const mode = String(meta.mode || '');
        if (mode) params.push('mode=' + encodeURIComponent(mode));
        const cast = String(meta.cast || '');
        if (cast) params.push('cast=' + encodeURIComponent(cast));
        const programTitle = String(meta.programTitle || '');
        if (programTitle) params.push('programTitle=' + encodeURIComponent(programTitle));
        const scope = String(meta.scope || '');
        if (scope) params.push('scope=' + encodeURIComponent(scope));
        return base + encodeURIComponent(raw) + (params.length ? ('&' + params.join('&')) : '');
    }

    resolver.resolveLive = function (raw, metadata) {
        return buildProxyPlayUrl(raw, metadata);
    };

    resolver.buildLiveMeta = function (raw, context) {
        const src = String(raw || '').trim();
        const ctx = context || {};
        const mode = String(ctx.mode || '直播');
        let cast = '单播';
        if (src && (/^(rtp|udp):\/\//i.test(src) || /\/rtp\//i.test(src))) {
            cast = '组播';
        }
        if (mode === '回放') {
            cast = '单播';
        }
        return {
            title: String(ctx.title || ''),
            mode,
            cast,
            programTitle: String(ctx.programTitle || ''),
            scope: String(ctx.scope || 'internal')
        };
    };

    resolver.resolveReplayFallback = function (raw, metadata) {
        return Promise.resolve(buildProxyPlayUrl(raw, metadata || {}));
    };

    resolver.resolveReplayPlayUrl = function (raw, metadata) {
        const src = String(raw || '');
        if (!src) {
            return Promise.resolve('/api/proxy/stream?url=' + encodeURIComponent(src));
        }
        if (typeof resolver.resolveReplay === 'function') {
            return resolver.resolveReplay(src).catch(function () {
                if (typeof resolver.resolveReplayFallback === 'function') {
                    return resolver.resolveReplayFallback(src, metadata || {});
                }
                return '/api/proxy/stream?url=' + encodeURIComponent(src);
            });
        }
        if (typeof resolver.resolveReplayFallback === 'function') {
            return resolver.resolveReplayFallback(src, metadata || {});
        }
        return Promise.resolve('/api/proxy/stream?url=' + encodeURIComponent(src));
    };

    resolver.normalizeReplayRawUrl = function (responseOrRaw) {
        const src = typeof responseOrRaw === 'string'
            ? responseOrRaw
            : (responseOrRaw && responseOrRaw.url ? responseOrRaw.url : '');
        let raw = String(src || '');
        if (raw.indexOf('$') !== -1) {
            raw = raw.split('$')[0];
        }
        return raw;
    };

    resolver.resolveReplayFromResponse = function (responseOrRaw, metadata) {
        const raw = resolver.normalizeReplayRawUrl(responseOrRaw);
        return resolver.resolveReplayPlayUrl(raw, metadata).then(function (playUrl) {
            return { raw, playUrl };
        });
    };

    resolver.resolveReplay = function (raw) {
        const src = String(raw || '');
        const isM3u8 = /\.m3u8(\?|$)/i.test(src) || src.toLowerCase().indexOf('m3u8') > -1;
        if (isM3u8) {
            return Promise.resolve('/api/proxy/hls?url=' + encodeURIComponent(src));
        }
        const hlsProbe = '/api/proxy/hls?url=' + encodeURIComponent(src);
        let controller = null;
        let timer = null;
        try { controller = new AbortController(); } catch (e) { controller = null; }
        if (controller) {
            timer = setTimeout(function () { try { controller.abort(); } catch (e) {} }, 1500);
        }
        return fetch(hlsProbe, { method: 'GET', signal: controller ? controller.signal : undefined }).then(function (resp) {
            return resp.text().then(function (t) {
                if (timer) clearTimeout(timer);
                const ct = (resp.headers.get('content-type') || '').toLowerCase();
                const head = t.slice(0, 32);
                if (resp.ok && (ct.indexOf('application/vnd.apple.mpegurl') > -1 || head.indexOf('#EXTM3U') === 0 || t.indexOf('#EXTM3U') > -1)) {
                    return hlsProbe;
                }
                return '/api/proxy/stream?url=' + encodeURIComponent(src);
            });
        }).catch(function () {
            if (timer) clearTimeout(timer);
            return '/api/proxy/stream?url=' + encodeURIComponent(src);
        });
    };
})();
