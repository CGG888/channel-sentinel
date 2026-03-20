(function () {
    const ns = (window.IptvCore = window.IptvCore || {});
    const player = (ns.player = ns.player || {});
    const epgFallbackRenderer = (player.epgFallbackRenderer = player.epgFallbackRenderer || {});

    epgFallbackRenderer.renderList = function (options) {
        const opts = options || {};
        const epgList = opts.epgList || null;
        const epgHint = opts.epgHint || null;
        if (!epgList || !epgHint) return false;
        let list = Array.isArray(opts.list) ? opts.list : [];
        const selectedDate = opts.selectedDate || new Date();
        const now = Number(opts.now || Date.now());
        const currentReplayProgram = opts.currentReplayProgram || null;
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

        epgList.innerHTML = '';
        if (!Array.isArray(list) || list.length === 0) {
            try {
                const d = new Date(selectedDate || Date.now());
                d.setHours(0, 0, 0, 0);
                const ph = [];
                for (let h = 0; h < 24; h++) {
                    const st = new Date(d);
                    st.setHours(h, 0, 0, 0);
                    const et = new Date(d);
                    et.setHours(h + 1, 0, 0, 0);
                    ph.push({ title: '精彩节目', startMs: st.getTime(), endMs: et.getTime() });
                }
                list = ph;
                epgHint.textContent = '';
            } catch (e) {
                epgHint.textContent = '暂无节目单';
                return true;
            }
        }
        epgHint.textContent = '';
        let foundLive = false;
        list.forEach(function (p) {
            const it = document.createElement('button');
            it.type = 'button';
            it.className = 'list-group-item list-group-item-action bg-transparent epg-item d-flex justify-content-between align-items-center';
            const tm = new Date(p.startMs);
            const em = new Date(p.endMs);
            const t = String(tm.getHours()).padStart(2, '0') + ':' + String(tm.getMinutes()).padStart(2, '0') + ' - ' + String(em.getHours()).padStart(2, '0') + ':' + String(em.getMinutes()).padStart(2, '0');
            const left = document.createElement('div');
            left.innerHTML = '<div class="small muted">' + t + '</div><div>' + (p.title || '无标题') + '</div>';
            const right = document.createElement('div');
            const isLiveNow = p.startMs <= now && p.endMs > now;
            const isPast = p.endMs <= now;
            if (isLiveNow) {
                right.innerHTML = '<span class="badge badge-live rounded-pill px-2 py-1">LIVE</span>';
                it.classList.add('active-epg');
                foundLive = true;
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
            } else if (!isPast) {
                right.innerHTML = '<span class="badge bg-secondary">待播</span>';
            } else if (currentReplayProgram && p.startMs === currentReplayProgram.startMs && p.title === currentReplayProgram.title) {
                right.innerHTML = '<span class="badge badge-replay rounded-pill px-2 py-1">正在回放</span>';
                it.classList.add('active-epg');
            } else {
                right.innerHTML = '<span class="badge bg-success">回看</span>';
            }
            it.appendChild(left);
            it.appendChild(right);
            it.onclick = function () {
                const liveTarget = stream || getCurrentStream();
                if (isLiveNow) {
                    setCurrentReplayProgram(null);
                    setCurrentLiveProgram(p);
                    updateProgramProgressLabel();
                    startLiveFor(liveTarget);
                    rerender(list, liveTarget);
                } else if (isPast) {
                    doReplay(liveTarget, p);
                    rerender(list, liveTarget);
                }
            };
            epgList.appendChild(it);
        });
        if (foundLive) {
            setTimeout(function () {
                const act = epgList.querySelector('.active-epg');
                if (act) act.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 100);
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
