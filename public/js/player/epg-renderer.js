(function () {
    const ns = (window.IptvCore = window.IptvCore || {});
    const player = (ns.player = ns.player || {});
    const epgRenderer = (player.epgRenderer = player.epgRenderer || {});

    function buildFallbackPrograms(selectedDate) {
        const d = new Date(selectedDate || Date.now());
        d.setHours(0, 0, 0, 0);
        const list = [];
        for (let h = 0; h < 24; h++) {
            const st = new Date(d);
            st.setHours(h, 0, 0, 0);
            const et = new Date(d);
            et.setHours(h + 1, 0, 0, 0);
            list.push({ title: '精彩节目', startMs: st.getTime(), endMs: et.getTime() });
        }
        return list;
    }

    epgRenderer.renderList = function (options) {
        const opts = options || {};
        const epgList = opts.epgList;
        const epgHint = opts.epgHint;
        if (!epgList || !epgHint) return { foundLive: false, list: [] };
        epgList.innerHTML = '';
        let list = Array.isArray(opts.list) ? opts.list : [];
        if (!list.length) {
            try {
                list = buildFallbackPrograms(opts.selectedDate);
                epgHint.textContent = '';
            } catch (e) {
                epgHint.textContent = '暂无节目单';
                return { foundLive: false, list: [] };
            }
        } else {
            epgHint.textContent = '';
        }
        const now = Number(opts.now || Date.now());
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
                if (typeof opts.onLiveDetected === 'function') opts.onLiveDetected(p);
            } else if (!isPast) {
                right.innerHTML = '<span class="badge bg-secondary">待播</span>';
            } else if (opts.currentReplayProgram && p.startMs === opts.currentReplayProgram.startMs && p.title === opts.currentReplayProgram.title) {
                right.innerHTML = '<span class="badge badge-replay rounded-pill px-2 py-1">正在回放</span>';
                it.classList.add('active-epg');
            } else {
                right.innerHTML = '<span class="badge bg-success">回看</span>';
            }
            it.appendChild(left);
            it.appendChild(right);
            it.onclick = function () {
                if (typeof opts.onItemClick === 'function') opts.onItemClick({ program: p, isLiveNow, isPast, list });
            };
            epgList.appendChild(it);
        });
        if (foundLive) {
            setTimeout(function () {
                const act = epgList.querySelector('.active-epg');
                if (act) act.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 100);
        }
        return { foundLive, list };
    };
})();
