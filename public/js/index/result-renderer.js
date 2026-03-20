(function() {
    function showLastResult(data, name, multicastUrl) {
        let lastResultDiv = document.getElementById('lastResultInfo');
        if (!lastResultDiv) {
            lastResultDiv = document.createElement('div');
            lastResultDiv.id = 'lastResultInfo';
            lastResultDiv.className = 'alert alert-secondary mt-2';
            const progressBarWrap = document.getElementById('progressBarWrap');
            progressBarWrap.parentNode.insertBefore(lastResultDiv, progressBarWrap.nextSibling);
        }
        lastResultDiv.style.display = '';
        lastResultDiv.innerHTML = `最近检测：<b>${name || data.name || '-'}</b> | <span style='color:#888;'>${multicastUrl || data.multicastUrl || '-'}</span> | 分辨率:<b>${data.resolution || '-'}</b> | 编码:<b>${data.codec || '-'}</b> | 帧率:<b>${data.frameRate || '-'}</b> | <span style='color:${data.isAvailable ? '#28a745' : '#dc3545'};font-weight:bold;'>${data.isAvailable ? '在线' : '离线'}</span>`;
    }

    function updateStatsAndDisplay() {
        const search = lastSearch.trim().toLowerCase();
        let filtered = allStreams;
        if (search) {
            filtered = allStreams.filter(s => (s.name || '').toLowerCase().includes(search) || (s.multicastUrl || '').toLowerCase().includes(search));
        }
        if (filterStatus === 'online') filtered = filtered.filter(s => s.isAvailable);
        if (filterStatus === 'offline') filtered = filtered.filter(s => !s.isAvailable);
        const online = filtered.filter(s => s.isAvailable);
        const offline = filtered.filter(s => !s.isAvailable);
        document.getElementById('stat-total').innerText = filtered.length;
        document.getElementById('stat-online').innerText = online.length;
        document.getElementById('stat-offline').innerText = offline.length;
        const listContainer = document.getElementById('streams-list');
        if (!listContainer) return;
        const total = filtered.length;
        const sizeVal = pageSize === 'all' ? total : Number(pageSize);
        const pages = sizeVal >= total ? 1 : Math.max(1, Math.ceil(total / sizeVal));
        if (currentPage > pages) currentPage = pages;
        if (currentPage < 1) currentPage = 1;
        const start = (sizeVal >= total) ? 0 : (currentPage - 1) * sizeVal;
        const end = (sizeVal >= total) ? total : Math.min(start + sizeVal, total);
        const pageArr = filtered.slice(start, end);
        const render = arr => arr.map((stream) => `
    <div class="stream-item d-flex align-items-center ${stream.isAvailable ? 'available' : 'unavailable'} p-3 mb-2 rounded border bg-white shadow-sm position-relative overflow-hidden">
        <div class="d-flex align-items-center flex-grow-1 gap-3 flex-wrap">
            <div class="form-check mb-0">
                 <input type="checkbox" class="form-check-input sel-index" data-index="${allStreams.indexOf(stream)}">
            </div>
            
            ${stream.logo ? `<img src="${stream.logo}" alt="" class="rounded bg-light border" style="width:48px;height:48px;object-fit:contain;" onerror="if(!this.dataset.err){this.dataset.err=1;this.src='/api/proxy/stream?url='+encodeURIComponent(this.src);}">` : '<div class="rounded bg-light border d-flex align-items-center justify-content-center text-muted" style="width:48px;height:48px;"><i class="bi bi-tv"></i></div>'}
            
            <div class="d-flex flex-column" style="min-width: 180px; max-width: 300px;">
                <span class="fw-bold text-dark text-truncate" title="${stream.name || ''}">${stream.name || '未命名频道'}</span>
                <span class="small text-muted text-truncate font-monospace" title="${stream.multicastUrl}">${stream.multicastUrl}</span>
            </div>

            <div class="d-flex flex-wrap gap-2 align-items-center ms-lg-3">
                 <span class="badge ${stream.isAvailable ? 'bg-success' : 'bg-danger'} rounded-pill d-flex align-items-center">
                    ${stream.isAvailable ? '<i class="bi bi-check-circle-fill me-1"></i>在线' : '<i class="bi bi-x-circle-fill me-1"></i>离线'}
                 </span>
                 ${stream.isAvailable ? `
                     <span class="badge bg-light text-dark border">Resolution: ${stream.resolution || '-'}</span>
                     <span class="badge bg-light text-dark border">FPS: ${stream.frameRate || '-'}</span>
                     <span class="badge bg-light text-dark border">Codec: ${stream.codec || '-'}</span>
                 ` : ''}
                 ${stream.groupTitle ? `<span class="badge bg-info text-dark bg-opacity-10 border border-info">Group: ${stream.groupTitle}</span>` : ''}
            </div>
        </div>

        <div class="d-flex gap-2 ms-auto align-self-center">
            <button class="btn btn-sm btn-outline-success" onclick="openExternalPlayerIndex(${allStreams.indexOf(stream)})" title="外部播放器">
                <i class="bi bi-box-arrow-up-right"></i> <span class="d-none d-md-inline">外部</span>
            </button>
                <button class="btn btn-sm btn-outline-primary" onclick="playStreamByIndex(${allStreams.indexOf(stream)})" title="网页播放">
                    <i class="bi bi-play-circle"></i> <span class="d-none d-md-inline">播放</span>
                </button>
            <button class="btn btn-sm btn-outline-danger" onclick="deleteStream(${allStreams.indexOf(stream)})" title="删除">
                <i class="bi bi-trash"></i> <span class="d-none d-md-inline">删除</span>
            </button>
        </div>
    </div>
`).join('');
        listContainer.innerHTML = render(pageArr);
        const info = document.getElementById('pageInfo');
        const sel = document.getElementById('pageSizeSelect');
        const prev = document.getElementById('prevPageBtn');
        const next = document.getElementById('nextPageBtn');
        if (info) info.textContent = (sizeVal >= total) ? `第 1/1 页（共 ${total} 条）` : `第 ${currentPage}/${pages} 页（共 ${total} 条）`;
        if (sel) {
            sel.value = (pageSize === 'all') ? 'all' : String(pageSize);
            sel.onchange = function() {
                pageSize = this.value === 'all' ? 'all' : Number(this.value);
                currentPage = 1;
                updateStatsAndDisplay();
            };
        }
        if (prev) prev.onclick = function() { if (currentPage > 1) { currentPage--; updateStatsAndDisplay(); } };
        if (next) next.onclick = function() { if (sizeVal >= total) return; if (currentPage < pages) { currentPage++; updateStatsAndDisplay(); } };
        const selectAllBox = document.getElementById('selectAllIndexPage');
        if (selectAllBox) {
            const boxes = Array.from(document.querySelectorAll('.sel-index'));
            const allChecked = boxes.length > 0 && boxes.every(b => selectedSet.has(Number(b.dataset.index)));
            selectAllBox.checked = allChecked;
            selectAllBox.onchange = function() {
                const xs = Array.from(document.querySelectorAll('.sel-index'));
                xs.forEach(x => {
                    const i = Number(x.dataset.index);
                    if (this.checked) { selectedSet.add(i); x.checked = true; } else { selectedSet.delete(i); x.checked = false; }
                });
            };
        }
        const boxes = Array.from(document.querySelectorAll('.sel-index'));
        boxes.forEach(b => {
            b.checked = selectedSet.has(Number(b.dataset.index));
            b.onchange = function() {
                const i = Number(this.dataset.index);
                if (this.checked) selectedSet.add(i); else selectedSet.delete(i);
            };
        });
    }

    function showStatusInfo(text) {
        let statusDiv = document.getElementById('progressStatusInfo');
        if (!statusDiv) {
            statusDiv = document.createElement('div');
            statusDiv.id = 'progressStatusInfo';
            const batchBtn = document.getElementById('batchCheckBtn');
            if (batchBtn && batchBtn.parentNode.parentNode.nextElementSibling) {
                batchBtn.parentNode.parentNode.parentNode.insertBefore(statusDiv, batchBtn.parentNode.parentNode.nextElementSibling);
            } else {
                const barWrap = document.getElementById('progressBarWrap');
                barWrap.parentNode.insertBefore(statusDiv, barWrap);
            }
        }
        statusDiv.style.display = '';
        statusDiv.style.marginTop = '12px';
        statusDiv.innerHTML = text;
    }

    function hideStatusInfo() {
        let statusDiv = document.getElementById('progressStatusInfo');
        if (statusDiv) statusDiv.style.display = 'none';
    }

    function showProgress(done, total, status) {
        const barWrap = document.getElementById('progressBarWrap');
        const bar = document.getElementById('progressBar');
        barWrap.style.display = '';
        let percent = total ? Math.round(done / total * 100) : 0;
        bar.style.width = percent + '%';
        bar.innerText = `${percent}% | 进度: ${done}/${total} | ${status || ''}`;
        showStatusInfo(status || '');
    }

    function hideProgress() {
        document.getElementById('progressBarWrap').style.display = 'none';
        hideStatusInfo();
        let lastResultDiv = document.getElementById('lastResultInfo');
        if (lastResultDiv) lastResultDiv.style.display = 'none';
        let currentCheckInfo = document.getElementById('currentCheckInfo');
        if (currentCheckInfo) currentCheckInfo.style.display = 'none';
    }

    function buildDetectionStats(list) {
        const arr = Array.isArray(list) ? list : [];
        const total = arr.length;
        const online = arr.filter(s => s.isAvailable).length;
        const offline = total - online;
        const grpMap = {};
        arr.forEach(s => {
            const g = (s.groupTitle || '未分组').trim() || '未分组';
            grpMap[g] = (grpMap[g] || 0) + 1;
        });
        const groups = Object.entries(grpMap).sort((a,b)=>b[1]-a[1]);
        const groupCount = groups.length;
        let multicast = 0, unicast = 0;
        const udpxyMap = {};
        const domainMap = {};
        let bitrateSum = 0, bitrateCnt = 0, fpsSum = 0, fpsCnt = 0;
        arr.forEach(s => {
            const u = String(s.multicastUrl || '').trim();
            const scheme = u.split(':')[0].toLowerCase();
            const isMc = !!s.udpxyUrl || scheme === 'rtp' || scheme === 'udp';
            if (isMc) {
                multicast++;
                const h = (String(s.udpxyUrl||'').trim() || '').replace(/^https?:\/\//,'').split('/')[0] || '未知';
                udpxyMap[h] = (udpxyMap[h]||0)+1;
            } else {
                unicast++;
                let host = '未知';
                try { const uu = new URL(u); host = uu.hostname; } catch(e) {}
                domainMap[host] = (domainMap[host]||0)+1;
            }
            if (s.isAvailable && typeof s.bitRate === 'number' && s.bitRate > 0) { bitrateSum += s.bitRate; bitrateCnt++; }
            const fr = parseFloat(String(s.frameRate||'').toString());
            if (!Number.isNaN(fr) && fr > 0) { fpsSum += fr; fpsCnt++; }
        });
        const resMap = { '3840x2160':0,'1920x1080':0,'1280x720':0,'其他':0 };
        arr.forEach(s => {
            const r = String(s.resolution || '').trim();
            if (r === '3840x2160') resMap['3840x2160']++;
            else if (r === '1920x1080') resMap['1920x1080']++;
            else if (r === '1280x720') resMap['1280x720']++;
            else resMap['其他']++;
        });
        const codecMap = {};
        arr.forEach(s => {
            const c = (s.codec || '').trim() || '-';
            codecMap[c] = (codecMap[c] || 0) + 1;
        });
        const withLogo = arr.filter(s => String(s.logo||'').trim()).length;
        const avgBitrateMbps = bitrateCnt ? (bitrateSum/bitrateCnt/1000000) : 0;
        const avgFps = fpsCnt ? (fpsSum/fpsCnt) : 0;
        return { total, online, offline, groups, groupCount, multicast, unicast, resMap, codecMap, epgCovered: arr.filter(s => (s.tvgId && s.tvgId.trim()) || (s.tvgName && s.tvgName.trim())).length, withLogo, udpxyMap, domainMap, avgBitrateMbps, avgFps };
    }

    function ensureDetectSummaryStyles() {
        if (document.getElementById('detectSummaryStyle')) return;
        const style = document.createElement('style');
        style.id = 'detectSummaryStyle';
        style.textContent = `
    #detectSummaryModal .modal-content{border-radius:20px;box-shadow:0 24px 64px rgba(2,6,23,.24)}
    #detectSummaryModal .detect-card{border:1px solid #e5e7eb;border-radius:16px;padding:16px;background:linear-gradient(180deg,#f8fafc,#ffffff)}
    #detectSummaryModal .detect-badges .badge{border-radius:12px;padding:.5rem .75rem;font-weight:600}
    #detectSummaryModal .detect-title{display:flex;align-items:center;gap:10px}
    #detectSummaryModal .detect-title img{width:36px;height:36px;border-radius:10px;object-fit:cover}
    #detectSummaryModal .detect-sub{color:#64748b;font-size:.9rem}
    #detectSummaryModal .detect-table th,#detectSummaryModal .detect-table td{vertical-align:middle}
    #detectSummaryModal .chip{display:inline-block;padding:.35rem .6rem;border:1px solid #e5e7eb;border-radius:999px;background:#f8fafc;margin:.15rem .25rem;font-size:.85rem}
    #detectSummaryModal .stack{display:flex;flex-wrap:wrap;gap:.5rem}
    #detectSummaryModal .progress-line{height:6px;border-radius:4px;background:linear-gradient(90deg,#14b8a6,#2563eb)}
    `;
        document.head.appendChild(style);
    }

    function showDetectionSummary(list) {
        let modal = document.getElementById('detectSummaryModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'detectSummaryModal';
            modal.innerHTML = '<div class="modal fade" tabindex="-1" style="display:block;background:rgba(15,23,42,.28);z-index:10000;"><div class="modal-dialog modal-dialog-centered modal-xl"><div class="modal-content"><div class="modal-header border-0 pb-0 d-flex align-items-center"><div class="detect-title"><img id="detectSummaryLogo" alt="IPTV"><div><div class="fw-bold">检测结果统计</div><div class="detect-sub" id="detectSummaryTime"></div></div></div><div class="ms-auto"></div><button type="button" class="btn-close" id="detectSummaryClose"></button></div><div class="modal-body pt-2" id="detectSummaryBody"></div><div class="modal-footer border-0 pt-0"><button class="btn btn-primary px-4" id="detectSummaryOk">确定</button></div></div></div></div>';
            document.body.appendChild(modal);
        }
        ensureDetectSummaryStyles();
        const s = buildDetectionStats(list);
        const topGroups = s.groups.slice(0, 10).map(([g,c]) => {
            const w = s.total ? Math.max(6, Math.round((c/s.total)*100)) : 6;
            return `<tr><td>${g}</td><td class="text-end" style="width:110px">${c}</td><td style="width:40%"><div class="progress-line" style="width:${w}%"></div></td></tr>`;
        }).join('');
        const moreGroups = s.groups.length > 10 ? `<div class="text-muted small">其余 ${s.groups.length - 10} 个分组略</div>` : '';
        const codecRows = Object.entries(s.codecMap).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([k,v])=>`<span class="badge bg-light text-dark border me-2 mb-2">${k}: ${v}</span>`).join('');
        const udpxyRows = Object.entries(s.udpxyMap).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([k,v])=>`<div class="d-flex justify-content-between"><span class="text-truncate" title="${k}">${k}</span><span>${v}</span></div>`).join('') || '<div class="text-muted">暂无</div>';
        const domainRows = Object.entries(s.domainMap).sort((a,b)=>b[1]-a[1]).slice(0,6).map(([k,v])=>`<div class="d-flex justify-content-between"><span class="text-truncate" title="${k}">${k}</span><span>${v}</span></div>`).join('') || '<div class="text-muted">暂无</div>';
        const body = document.getElementById('detectSummaryBody');
        if (body) {
            body.innerHTML = `
        <div class="row g-3">
          <div class="col-lg-7">
            <div class="detect-card">
              <div class="d-flex flex-wrap gap-2 detect-badges">
                <span class="badge text-bg-secondary">总数 ${s.total}</span>
                <span class="badge text-bg-success">在线 ${s.online}</span>
                <span class="badge text-bg-danger">离线 ${s.offline}</span>
                <span class="badge text-bg-info">分组 ${s.groupCount}</span>
                <span class="badge text-bg-warning">组播 ${s.multicast}</span>
                <span class="badge bg-light text-dark border">单播 ${s.unicast}</span>
                <span class="badge bg-light text-dark border">台标 ${s.withLogo}</span>
                <span class="badge bg-light text-dark border">EPG覆盖 ${s.epgCovered}</span>
                <span class="badge bg-light text-dark border">平均码率 ${s.avgBitrateMbps.toFixed(2)}Mbps</span>
                <span class="badge bg-light text-dark border">平均帧率 ${s.avgFps.toFixed(1)}</span>
              </div>
              <div class="d-flex flex-wrap gap-2 mt-3">
                ${codecRows || '<span class="badge bg-light text-dark border">无编码统计</span>'}
              </div>
              <div class="mt-3">
                <div class="table-responsive"><table class="table table-sm align-middle mb-0 detect-table"><thead><tr><th style="min-width:140px">分组</th><th class="text-end" style="width:110px">频道数</th><th style="width:40%"></th></tr></thead><tbody>${topGroups || '<tr><td>无</td><td class="text-end">0</td><td></td></tr>'}</tbody></table></div>
              ${moreGroups}
            </div>
          </div>
          <div class="col-lg-5">
            <div class="detect-card h-100">
              <div class="row g-3">
                <div class="col-12">
                  <div class="border rounded-3 p-3">
                    <div class="fw-bold mb-2">UDPXY 服务器（前6）</div>
                    ${udpxyRows}
                  </div>
                </div>
                <div class="col-12">
                  <div class="border rounded-3 p-3">
                    <div class="fw-bold mb-2">单播域名（前6）</div>
                    ${domainRows}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>`;
        }
        modal.style.display = 'block';
        modal.querySelector('.modal').classList.add('show');
        const closeBtn = document.getElementById('detectSummaryClose');
        const okBtn = document.getElementById('detectSummaryOk');
        const close = function(){ modal.style.display='none'; modal.querySelector('.modal').classList.remove('show'); restoreTitleNotify(); };
        if (closeBtn) closeBtn.onclick = close;
        if (okBtn) okBtn.onclick = close;
        const logo = document.getElementById('detectSummaryLogo');
        if (logo) {
            logo.onerror = function() {
                const svg = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect rx="12" ry="12" width="64" height="64" fill="#2563eb"/><rect x="10" y="16" width="44" height="28" rx="4" fill="#ffffff"/><rect x="14" y="20" width="36" height="20" rx="2" fill="#e2e8f0"/><rect x="22" y="48" width="20" height="6" rx="3" fill="#1e293b"/></svg>');
                logo.src = svg;
            };
            logo.src = '/iptv.png';
        }
        const t = document.getElementById('detectSummaryTime');
        if (t) t.textContent = new Date().toLocaleString();
    }

    let __titleBackup = document.title;
    let __titleTimer = null;
    let __favBackupHref = '';

    function setFaviconBadge() {
        try {
            const link = document.querySelector('link[rel="icon"]');
            if (!link) return;
            __favBackupHref = link.href;
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = function() {
                const c = document.createElement('canvas');
                c.width = 64; c.height = 64;
                const ctx = c.getContext('2d');
                ctx.drawImage(img, 0, 0, 64, 64);
                ctx.fillStyle = '#ff3b3b';
                ctx.beginPath(); ctx.arc(52,12,10,0,Math.PI*2); ctx.fill();
                const url = c.toDataURL('image/png');
                link.href = url;
            };
            img.src = __favBackupHref;
        } catch(e) {}
    }

    function restoreTitleNotify() {
        try { if (__titleTimer) { clearInterval(__titleTimer); __titleTimer = null; } } catch(e){}
        try { document.title = __titleBackup; } catch(e){}
        try {
            const link = document.querySelector('link[rel="icon"]');
            if (link && __favBackupHref) link.href = __favBackupHref;
        } catch(e){}
    }

    function notifyDetectionDone(online, offline, total) {
        const msg = `检测完成 总${total} 在线${online} 离线${offline}`;
        if (document.hidden) {
            __titleBackup = document.title;
            let on = true;
            __titleTimer = setInterval(function(){ document.title = on ? `【完成】${msg}` : __titleBackup; on = !on; }, 1200);
            setFaviconBadge();
            try {
                if ('Notification' in window) {
                    if (Notification.permission === 'granted') new Notification('检测完成', { body: msg });
                    else if (Notification.permission !== 'denied') Notification.requestPermission().then(p => { if (p==='granted') new Notification('检测完成', { body: msg }); });
                }
            } catch(e){}
            window.addEventListener('visibilitychange', function(){ if (!document.hidden) restoreTitleNotify(); }, { once: true });
        }
    }

    window.showLastResult = showLastResult;
    window.updateStatsAndDisplay = updateStatsAndDisplay;
    window.showStatusInfo = showStatusInfo;
    window.hideStatusInfo = hideStatusInfo;
    window.showProgress = showProgress;
    window.hideProgress = hideProgress;
    window.showDetectionSummary = showDetectionSummary;
    window.notifyDetectionDone = notifyDetectionDone;
})();
