(function() {
    function updateInputCount() {
        let rangeStart = (document.getElementById('rangeStart').value || '').trim();
        let rangeEnd = (document.getElementById('rangeEnd').value || '').trim();
        let batchInput = (document.getElementById('batchInput').value || '').trim();
        let count = 0;
        if (rangeStart && rangeEnd) {
            const s = parseRtp(rangeStart);
            const e = parseRtp(rangeEnd);
            if (s && e) {
                let a = s.ipInt, b = e.ipInt;
                if (a > b) [a, b] = [b, a];
                count = Math.min(b - a + 1, 1000);
            }
        } else if (batchInput) {
            count = batchInput.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('#')).length;
        }
        document.getElementById('stat-total').innerText = count;
        document.getElementById('stat-online').innerText = 0;
        document.getElementById('stat-offline').innerText = 0;
    }

    window.IptvIndexBootstrap = function() {
        const clearAllBtn = document.getElementById('clearAllBtn');
        if (clearAllBtn) {
            clearAllBtn.onclick = async function() {
                showCenterConfirm('确定要清空所有检测结果吗？', async function(ok) {
                    if (!ok) return;
                    await apiJson('/api/streams', { method: 'DELETE' });
                    getStreams();
                });
            };
        }
        const groupTitle = document.querySelector('.main-card h5.mb-3.text-center');
        if (groupTitle) {
            groupTitle.style.fontSize = '1.25rem';
            groupTitle.style.fontWeight = 'bold';
            groupTitle.style.letterSpacing = '1px';
            groupTitle.style.marginBottom = '18px';
        }
        const resultTitle = document.querySelector('.main-card.mt-4 h5.mb-0, .main-card.mt-4 h4.mb-0');
        if (resultTitle) {
            resultTitle.style.fontSize = '1.25rem';
            resultTitle.style.fontWeight = 'bold';
            resultTitle.style.letterSpacing = '1px';
            resultTitle.style.marginBottom = '18px';
        }
        const opRow = document.querySelector('.main-card.mt-4 .row.mb-2 .col-12.d-flex');
        if (opRow) {
            const searchInput = document.getElementById('searchInput');
            if (searchInput) {
                searchInput.classList.add('me-3');
                opRow.insertBefore(searchInput, opRow.firstChild);
            }
            const btnAll = document.getElementById('filterAll');
            const btnOnline = document.getElementById('filterOnline');
            const btnOffline = document.getElementById('filterOffline');
            const btnClear = document.getElementById('clearAllBtn');
            if (btnAll && btnOnline && btnOffline && btnClear) {
                const btnGroup = document.createElement('div');
                btnGroup.className = 'd-flex justify-content-center align-items-center';
                btnGroup.style.gap = '8px';
                btnGroup.appendChild(btnAll);
                btnGroup.appendChild(btnOnline);
                btnGroup.appendChild(btnOffline);
                btnGroup.appendChild(btnClear);
                opRow.appendChild(btnGroup);
            }
            const pageSizeSelect = document.getElementById('pageSizeSelect');
            const pageInfo = document.getElementById('pageInfo');
            if (pageSizeSelect) pageSizeSelect.remove();
            if (pageInfo) pageInfo.remove();
        }
        const searchInputEl = document.getElementById('searchInput');
        if (searchInputEl) {
            searchInputEl.addEventListener('input', function() {
                lastSearch = this.value;
                updateStatsAndDisplay();
            });
        }
        const streamForm = document.getElementById('streamForm');
        if (streamForm) {
            streamForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                showCenterConfirm('请使用下方“检测”按钮进行统一检测', null, true);
            });
        }
        const applyBtn = document.getElementById('applyCidrBtn');
        if (applyBtn) {
            applyBtn.addEventListener('click', function() {
                const cidr = document.getElementById('cidrInput').value.trim();
                const rng = parseCIDR(cidr);
                const portVal = document.getElementById('portInput')?.value.trim();
                const port = portVal ? parseInt(portVal, 10) : 9000;
                if (rng) {
                    document.getElementById('rangeStart').value = `rtp://${rng.start}:${port}`;
                    document.getElementById('rangeEnd').value = `rtp://${rng.end}:${port}`;
                    updateRangeSummary();
                } else {
                    showStatusInfo('CIDR格式不正确');
                }
            });
        }
        const clearBtn = document.getElementById('clearCidrBtn');
        if (clearBtn) {
            clearBtn.addEventListener('click', function() {
                const startEl = document.getElementById('rangeStart');
                const endEl = document.getElementById('rangeEnd');
                const cidrEl = document.getElementById('cidrInput');
                const sumEl = document.getElementById('rangeSummary');
                if (startEl) startEl.value = '';
                if (endEl) endEl.value = '';
                if (cidrEl) cidrEl.value = '';
                if (sumEl) sumEl.value = '';
                showStatusInfo('');
                updateRangeSummary();
            });
        }
        const rs = document.getElementById('rangeStart');
        const re = document.getElementById('rangeEnd');
        const ci = document.getElementById('cidrInput');
        if (rs) rs.addEventListener('input', updateRangeSummary);
        if (re) re.addEventListener('input', updateRangeSummary);
        if (ci) ci.addEventListener('input', function() {
            const cidr = ci.value.trim();
            const rng = parseCIDR(cidr);
            const portVal = document.getElementById('portInput')?.value.trim();
            const port = portVal ? parseInt(portVal, 10) : 9000;
            const startEl = document.getElementById('rangeStart');
            const endEl = document.getElementById('rangeEnd');
            if (rng) {
                if (startEl) startEl.value = `rtp://${rng.start}:${port}`;
                if (endEl) endEl.value = `rtp://${rng.end}:${port}`;
            }
            updateRangeSummary();
        });
        updateRangeSummary();
        const startBtn = document.getElementById('startDetectBtn');
        if (startBtn) {
            startBtn.addEventListener('click', async () => {
                if (detectRunning) return;
                const stopBtn = document.getElementById('stopDetectBtn');
                detectCancel = false;
                detectRunning = true;
                if (startBtn) startBtn.disabled = true;
                if (stopBtn) stopBtn.disabled = false;
                const udpxyUrl = document.getElementById('udpxyUrl').value;
                const batchText = document.getElementById('batchInput').value;
                const startUrl = document.getElementById('rangeStart').value.trim();
                const endUrl = document.getElementById('rangeEnd').value.trim();
                if (!udpxyUrl) {
                    showCenterConfirm('请先填写UDPXY服务器地址', null, true);
                    detectRunning = false;
                    if (startBtn) startBtn.disabled = false;
                    return;
                }
                try {
                    if (batchText.trim()) {
                        await batchCheckStreamsMixed(udpxyUrl, batchText);
                    } else if (startUrl && endUrl) {
                        await rangeCheckStreams(udpxyUrl, startUrl, endUrl);
                    } else {
                        showCenterConfirm('请粘贴组播地址或填写范围再点击检测', null, true);
                    }
                } finally {
                    detectRunning = false;
                    if (startBtn) startBtn.disabled = false;
                }
            });
        }
        const stopBtn = document.getElementById('stopDetectBtn');
        if (stopBtn) {
            stopBtn.addEventListener('click', () => {
                detectCancel = true;
                showStatusInfo('检测已请求停止，稍后结束当前任务');
            });
        }
        const batchInputEl = document.getElementById('batchInput');
        const rangeStartEl = document.getElementById('rangeStart');
        const rangeEndEl = document.getElementById('rangeEnd');
        if (rangeStartEl && batchInputEl) rangeStartEl.addEventListener('input', function() { if (!batchInputEl.value.trim()) updateInputCount(); });
        if (rangeEndEl && batchInputEl) rangeEndEl.addEventListener('input', function() { if (!batchInputEl.value.trim()) updateInputCount(); });
        if (batchInputEl) batchInputEl.addEventListener('input', updateInputCount);
        if (batchInputEl) batchInputEl.removeAttribute('required');
        const filterBtns = {
            all: document.getElementById('filterAll'),
            online: document.getElementById('filterOnline'),
            offline: document.getElementById('filterOffline')
        };
        function updateFilterActive(status) {
            if (filterBtns.all) filterBtns.all.classList.remove('active');
            if (filterBtns.online) filterBtns.online.classList.remove('active');
            if (filterBtns.offline) filterBtns.offline.classList.remove('active');
            if (status === 'all' && filterBtns.all) filterBtns.all.classList.add('active');
            if (status === 'online' && filterBtns.online) filterBtns.online.classList.add('active');
            if (status === 'offline' && filterBtns.offline) filterBtns.offline.classList.add('active');
        }
        if (filterBtns.all) filterBtns.all.onclick = function() { filterStatus = 'all'; updateFilterActive('all'); updateStatsAndDisplay(); };
        if (filterBtns.online) filterBtns.online.onclick = function() { filterStatus = 'online'; updateFilterActive('online'); updateStatsAndDisplay(); };
        if (filterBtns.offline) filterBtns.offline.onclick = function() { filterStatus = 'offline'; updateFilterActive('offline'); updateStatsAndDisplay(); };
        const loadBtn = document.getElementById('loadFileBtn');
        async function loadFromNetwork() {
            const ta = document.getElementById('batchInput');
            const raw = (ta.value || '').trim();
            const urls = raw.split('\n').map(s => s.trim()).filter(s => s && !s.startsWith('#') && (s.startsWith('http://') || s.startsWith('https://')));
            if (urls.length === 0) {
                showCenterConfirm('请在输入框中填入m3u或txt的网络地址（http/https）后再点击“加载”', null, true);
                return;
            }
            try {
                const data = await apiJson('/api/fetch-text', {
                    method: 'POST',
                    body: { urls }
                });
                const texts = (data.results || []).filter(r => r.ok).map(r => r.text);
                let items = [];
                for (const t of texts) {
                    const parsed = parsePlaylistText(t);
                    if (parsed && parsed.length) items = items.concat(parsed);
                }
                if (items.length) items = unifyChannelNames(items);
                if (items.length === 0) {
                    showCenterConfirm('未解析到有效地址', null, true);
                    return;
                }
                try { await persistImportedMeta(items); } catch(e) {}
                const lines = items.map(it => `${it.name || ''},${it.url}`);
                ta.value = lines.join('\n');
                updateInputCount();
                const okCount = texts.length;
                const failCount = urls.length - okCount;
                showCenterConfirm(`网络源：成功${okCount} 失败${failCount}；解析到地址：${items.length} 条`, null, true);
            } catch (e) {
                showCenterConfirm('加载网络文件失败（代理错误或网络问题）', null, true);
            }
        }
        if (loadBtn) loadBtn.onclick = loadFromNetwork;
        const uploadBtn = document.getElementById('uploadFileBtn');
        const uploadInput = document.getElementById('uploadFileInput');
        if (uploadBtn && uploadInput) {
            uploadBtn.onclick = function() { uploadInput.click(); };
            uploadInput.onchange = async function(e) {
                const f = e.target.files && e.target.files[0];
                if (!f) return;
                const txt = await f.text();
                const items = parsePlaylistText(txt);
                const itemsFixed = items && items.length ? unifyChannelNames(items) : [];
                if (!itemsFixed || itemsFixed.length === 0) {
                    showCenterConfirm('未解析到有效地址', null, true);
                    return;
                }
                try { await persistImportedMeta(itemsFixed); } catch(e) {}
                const lines = itemsFixed.map(it => `${it.name || ''},${it.url}`);
                const ta = document.getElementById('batchInput');
                ta.value = lines.join('\n');
                updateInputCount();
                showCenterConfirm(`已上传并解析：${itemsFixed.length} 条地址`, null, true);
            };
        }
        const batchDeleteBtn = document.getElementById('batchDeleteBtn');
        if (batchDeleteBtn) {
            batchDeleteBtn.onclick = async function() {
                const arr = Array.from(selectedSet);
                if (arr.length === 0) return;
                for (const i of arr) {
                    try { await apiJson(`/api/stream/${i}`, { method: 'DELETE' }); } catch(e) {}
                }
                selectedSet = new Set();
                getStreams();
            };
        }
        updateInputCount();
        getStreams();
    };
})();
