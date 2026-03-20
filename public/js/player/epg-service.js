(function () {
    const ns = (window.IptvCore = window.IptvCore || {});
    const player = (ns.player = ns.player || {});
    const epg = (player.epgService = player.epgService || {});

    epg.buildProgramsQuery = function (params) {
        const p = params || {};
        const q = new URLSearchParams();
        q.set('scope', String(p.scope || 'internal'));
        q.set('channelId', String(p.channelId || ''));
        q.set('channelName', String(p.channelName || ''));
        q.set('date', String(p.date || ''));
        if (p.epgId) q.set('epgId', String(p.epgId));
        if (p.force) q.set('force', '1');
        q.set('t', String(Date.now()));
        return q.toString();
    };

    epg.fetchPrograms = function (params) {
        return apiJson('/api/epg/programs?' + epg.buildProgramsQuery(params)).then(function (j) {
            return Array.isArray(j && j.programs) ? j.programs : [];
        }).catch(function () {
            return [];
        });
    };

    epg.mergeProgramsForDay = function (currentPrograms, prevPrograms, dayStartMs) {
        const dayEndMs = Number(dayStartMs || 0) + 86400000;
        const curr = Array.isArray(currentPrograms) ? currentPrograms : [];
        const prev = Array.isArray(prevPrograms) ? prevPrograms : [];
        const fromPrev = prev.filter(function (p) { return p && p.endMs > dayStartMs; });
        const fromCurr = curr.filter(function (p) { return p && p.startMs < dayEndMs; });
        const map = {};
        fromPrev.forEach(function (p) { map[p.startMs] = p; });
        fromCurr.forEach(function (p) { map[p.startMs] = p; });
        return Object.values(map)
            .sort(function (a, b) { return a.startMs - b.startMs; })
            .filter(function (p) { return p.startMs < dayEndMs && p.endMs > dayStartMs; });
    };
})();
