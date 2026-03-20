(function () {
    const ns = (window.IptvCore = window.IptvCore || {});
    const player = (ns.player = ns.player || {});
    const epgOrchestrator = (player.epgOrchestrator = player.epgOrchestrator || {});

    epgOrchestrator.renderList = function (options) {
        const opts = options || {};
        const epgRenderer = opts.epgRenderer;
        if (!epgRenderer || typeof epgRenderer.renderList !== 'function') return false;
        const now = Number(opts.now || Date.now());
        const stream = opts.stream || null;
        const getCurrentStream = typeof opts.getCurrentStream === 'function' ? opts.getCurrentStream : function () { return null; };
        const setCurrentReplayProgram = typeof opts.setCurrentReplayProgram === 'function' ? opts.setCurrentReplayProgram : function () {};
        const setCurrentLiveProgram = typeof opts.setCurrentLiveProgram === 'function' ? opts.setCurrentLiveProgram : function () {};
        const setCurrentLiveTitle = typeof opts.setCurrentLiveTitle === 'function' ? opts.setCurrentLiveTitle : function () {};
        const getCurrentLiveProgram = typeof opts.getCurrentLiveProgram === 'function' ? opts.getCurrentLiveProgram : function () { return null; };
        const channelKeyFromStream = typeof opts.channelKeyFromStream === 'function' ? opts.channelKeyFromStream : function () { return ''; };
        const channelNowTitleByKey = opts.channelNowTitleByKey || {};
        const replayBadge = opts.replayBadge || null;
        const subEl = opts.subEl || null;
        const showInfo = typeof opts.showInfo === 'function' ? opts.showInfo : function () {};
        const updateProgramProgressLabel = typeof opts.updateProgramProgressLabel === 'function' ? opts.updateProgramProgressLabel : function () {};
        const startLiveFor = typeof opts.startLiveFor === 'function' ? opts.startLiveFor : function () {};
        const doReplay = typeof opts.doReplay === 'function' ? opts.doReplay : function () {};
        const rerender = typeof opts.rerender === 'function' ? opts.rerender : function () {};
        const isMulticastStream = typeof opts.isMulticastStream === 'function' ? opts.isMulticastStream : function () { return false; };
        const getScope = typeof opts.getScope === 'function' ? opts.getScope : function () { return 'internal'; };
        const apiJson = typeof opts.apiJson === 'function' ? opts.apiJson : null;

        const rendered = epgRenderer.renderList({
            epgList: opts.epgList,
            epgHint: opts.epgHint,
            list: opts.list,
            selectedDate: opts.selectedDate,
            now: now,
            currentReplayProgram: opts.currentReplayProgram,
            onLiveDetected: function (p) {
                setCurrentLiveTitle(p.title || '');
                setCurrentLiveProgram(p);
                let keyForNow = null;
                if (stream) keyForNow = channelKeyFromStream(stream);
                else if (getCurrentStream()) keyForNow = channelKeyFromStream(getCurrentStream());
                if (keyForNow) channelNowTitleByKey[keyForNow] = p.title || '';
                if (subEl && replayBadge && replayBadge.classList.contains('d-none')) {
                    subEl.textContent = p.title || '';
                }
                showInfo();
                updateProgramProgressLabel();
            },
            onItemClick: function (meta) {
                const liveTarget = stream || getCurrentStream();
                if (meta.isLiveNow) {
                    setCurrentReplayProgram(null);
                    setCurrentLiveProgram(meta.program);
                    updateProgramProgressLabel();
                    startLiveFor(liveTarget);
                    rerender(meta.list, liveTarget);
                } else if (meta.isPast) {
                    doReplay(liveTarget, meta.program);
                    rerender(meta.list, liveTarget);
                }
            }
        });

        if (rendered && rendered.foundLive) {
            try {
                const cur = getCurrentStream();
                const liveProgram = getCurrentLiveProgram();
                if (cur && liveProgram && liveProgram.title && apiJson) {
                    const cast2 = isMulticastStream(cur) ? '组播' : '单播';
                    const sc2 = getScope() === 'external' ? 'external' : 'internal';
                    apiJson('/api/player/log', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            name: cur.name || cur.tvgName || '',
                            tvgName: cur.tvgName || '',
                            mode: '直播',
                            cast: cast2,
                            scope: sc2,
                            programTitle: liveProgram.title || ''
                        })
                    }).catch(function () {});
                }
            } catch (e) {}
        }
        return true;
    };
})();
