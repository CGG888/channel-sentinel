(function () {
    const ns = (window.IptvCore = window.IptvCore || {});
    const results = (ns.results = ns.results || {});
    const catchup = (results.catchup = results.catchup || {});

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

    catchup.fromStreamProgram = function (stream, program, options) {
        const s = stream || {};
        const p = program || {};
        const o = options || {};
        return catchup.requestPlay({
            scope: o.scope || 'internal',
            fmt: o.fmt || 'default',
            proto: o.proto || 'http',
            name: s.name || s.tvgName || s.tvgId || '',
            tvgName: s.tvgName || '',
            resolution: s.resolution || '',
            frameRate: s.frameRate || '',
            multicastUrl: s.multicastUrl || '',
            catchupBase: s.catchupBase || '',
            startMs: p.startMs,
            endMs: p.endMs
        });
    };
})();
