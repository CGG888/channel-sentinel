(function() {
    const ns = (window.IptvCore = window.IptvCore || {});
    const settings = (ns.settings = ns.settings || {});
    const app = (settings.app = settings.app || {});

    async function fetchStorageStatusR() {
        try {
            return await apiJson('/api/system/storage-status');
        } catch(e) { return null; }
    }
    async function fetchStorageMetricsR() {
        try {
            return await apiJson('/api/system/storage-metrics');
        } catch(e) { return null; }
    }
    async function repairStorageR() {
        try {
            return await apiJson('/api/system/storage-repair', { method: 'POST' });
        } catch(e) { return null; }
    }
    function modeText(v) {
        if (v === 'sqlite') return '仅 SQLite';
        if (v === 'json') return '仅 JSON';
        return '双写';
    }
    function queueText(m) {
        if (!m || typeof m !== 'object') return '';
        const s = Number(m.currentStreamQueueDepth || 0);
        const c = Number(m.currentConfigQueueDepth || 0);
        const ws = Number(m.avgWaitMs || 0).toFixed(1);
        const es = Number(m.avgExecMs || 0).toFixed(1);
        const f = Number(m.failed || 0);
        return `；队列 streams=${s} config=${c}；均等待 ${ws}ms / 均执行 ${es}ms；失败 ${f}`;
    }

    app.openModal = function() {
        let modal = document.getElementById('appSettingsModalR');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'appSettingsModalR';
            modal.innerHTML = '<div class="modal fade" tabindex="-1" style="display:block;background:rgba(0,0,0,0.5);z-index:9999;"><div class="modal-dialog modal-dialog-centered modal-lg"><div class="modal-content border-0 shadow-lg" style="border-radius:12px;"><div class="modal-header border-bottom-0 pb-0"><h5 class="modal-title fw-bold text-dark"><i class="bi bi-gear me-2"></i>应用设置</h5><button type="button" class="btn-close" id="appSettingsCloseR"></button></div><div class="modal-body pt-2 pb-4 px-4"><div class="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-4 bg-light p-3 rounded-3"><div class="text-secondary small d-flex align-items-center"><i class="bi bi-info-circle me-2 fs-5 text-primary"></i><span>内外网主要用于接口地址生成时候访问和内外网开关切换联动，内网用于在同局域网内访问；外网用于互联网访问（需端口映射）。</span></div><div class="d-flex flex-wrap align-items-center gap-2"><button class="btn btn-outline-primary btn-sm" id="appSettingsCheckR"><i class="bi bi-activity me-1"></i>校验状态</button><button class="btn btn-success btn-sm" id="appSettingsSaveR"><i class="bi bi-save me-1"></i>保存</button></div></div><div class="mb-3"><label class="form-label">存储模式</label><select class="form-select" id="storageModeR"><option value="dual">双写（JSON + SQLite）</option><option value="json">仅 JSON</option><option value="sqlite">仅 SQLite</option></select><div class="form-text">建议默认双写，切换到仅 SQLite 前先确认对账通过。</div></div><div class="mb-3"><div class="form-check form-check-inline"><input class="form-check-input" type="checkbox" id="useInternalR"><label class="form-check-label" for="useInternalR">启用内网使用</label></div><input class="form-control mt-2" id="internalUrlR" placeholder="内网地址+端口，例如：http://192.168.x.x:port"></div><div class="mb-3"><div class="form-check form-check-inline"><input class="form-check-input" type="checkbox" id="useExternalR"><label class="form-check-label" for="useExternalR">启用外网使用</label></div><input class="form-control mt-2" id="externalUrlR" placeholder="外网地址+端口，例如：http://域名或IP:port"></div></div></div></div></div>';
            document.body.appendChild(modal);
        }
        function close() {
            modal.style.display = 'none';
            modal.querySelector('.modal').classList.remove('show');
        }
        document.getElementById('appSettingsCloseR').onclick = close;

        const useInternalEl = document.getElementById('useInternalR');
        const useExternalEl = document.getElementById('useExternalR');
        const internalUrlEl = document.getElementById('internalUrlR');
        const externalUrlEl = document.getElementById('externalUrlR');
        const storageModeEl = document.getElementById('storageModeR');
        if (storageModeEl) {
            storageModeEl.innerHTML = '<option value="sqlite">仅 SQLite（主模式）</option>';
            storageModeEl.value = 'sqlite';
        }
        const modeTipEl = storageModeEl && storageModeEl.parentElement ? storageModeEl.parentElement.querySelector('.form-text') : null;
        if (modeTipEl) modeTipEl.textContent = '当前固定为 SQLite 主模式；JSON 仅用于备份/应急同步。';
        const checkBtn = document.getElementById('appSettingsCheckR');
        if (!document.getElementById('appSettingsDataWrapR')) {
            const body = modal.querySelector('.modal-body');
            if (body) {
                const block = document.createElement('div');
                block.id = 'appSettingsDataWrapR';
                block.className = 'mb-3 p-3 border rounded';
                block.innerHTML = '<div class="small text-muted mb-2">数据管理</div><div class="d-flex flex-wrap align-items-center gap-2"><select class="form-select form-select-sm" id="appSettingsVersionsSelectR" style="max-width:320px;min-width:220px;"></select><button class="btn btn-outline-success btn-sm" id="appSettingsSaveVersionR"><i class="bi bi-hdd-fill me-1"></i>保存</button><button class="btn btn-outline-primary btn-sm" id="appSettingsLoadVersionR"><i class="bi bi-folder2-open me-1"></i>加载</button><button class="btn btn-outline-danger btn-sm" id="appSettingsDeleteVersionR"><i class="bi bi-trash-fill me-1"></i>删除</button><button class="btn btn-outline-secondary btn-sm" id="appSettingsRefreshVersionR"><i class="bi bi-arrow-repeat me-1"></i>刷新</button></div><div class="d-flex flex-wrap align-items-center gap-2 mt-2"><button class="btn btn-warning btn-sm" id="appSettingsImportLegacyR"><i class="bi bi-arrow-down-circle me-1"></i>旧数据导入</button><input class="form-control form-control-sm" id="appSettingsLegacyDirR" placeholder="留空使用当前 data 目录，或输入旧版 data 路径" style="max-width:340px;"></div><div class="small text-muted mt-1">旧数据导入：将旧版本 JSON 数据批量导入 SQLite，幂等执行。</div>';
                body.insertBefore(block, body.children[1] || null);
            }
        }
        if (!document.getElementById('appSettingsLogWrapR')) {
            const body = modal.querySelector('.modal-body');
            if (body) {
                const block = document.createElement('div');
                block.id = 'appSettingsLogWrapR';
                block.className = 'mb-3 p-3 border rounded';
                block.innerHTML = '<div class="small text-muted mb-2">日志显示级别</div><div class="d-flex flex-wrap align-items-center gap-2"><select class="form-select form-select-sm log-level-select" id="appSettingsLogLevelR" style="max-width:220px;"><option value="fatal">Fatal</option><option value="error">Error</option><option value="warn">Warn</option><option value="info">Info</option><option value="debug">Debug</option></select><button class="btn btn-outline-primary btn-sm" id="appSettingsApplyLogLevelR"><i class="bi bi-sliders me-1"></i>应用日志级别</button></div>';
                body.insertBefore(block, body.children[1] || null);
            }
        }
        const logLevelSel = document.getElementById('appSettingsLogLevelR');
        const applyLogLevelBtn = document.getElementById('appSettingsApplyLogLevelR');
        function applyLogLevelSelectToneR(selectEl) {
            if (!selectEl) return;
            const lv = String(selectEl.value || 'info').toLowerCase();
            selectEl.classList.remove('log-level-fatal','log-level-error','log-level-warn','log-level-info','log-level-debug');
            selectEl.classList.add('log-level-select', 'log-level-' + (['fatal','error','warn','info','debug'].includes(lv) ? lv : 'info'));
            Array.from(selectEl.options || []).forEach(function (opt) {
                const v = String(opt.value || '').toLowerCase();
                if (v === 'fatal') { opt.style.color = '#fda4af'; opt.style.backgroundColor = '#2b0b0b'; return; }
                if (v === 'error') { opt.style.color = '#fecaca'; opt.style.backgroundColor = '#2a0d0d'; return; }
                if (v === 'warn') { opt.style.color = '#fde68a'; opt.style.backgroundColor = '#2a210a'; return; }
                if (v === 'info') { opt.style.color = '#bae6fd'; opt.style.backgroundColor = '#08233a'; return; }
                if (v === 'debug') { opt.style.color = '#cbd5e1'; opt.style.backgroundColor = '#111827'; return; }
                opt.style.color = '';
                opt.style.backgroundColor = '';
            });
        }
        try {
            const ui = localStorage.getItem('useInternal') === 'true';
            const ue = localStorage.getItem('useExternal') === 'true';
            const iu = localStorage.getItem('internalUrl') || (window.appSettings && window.appSettings.internalUrl || '');
            const eu = localStorage.getItem('externalUrl') || (window.appSettings && window.appSettings.externalUrl || '');
            if (useInternalEl) useInternalEl.checked = !!ui;
            if (useExternalEl) useExternalEl.checked = !!ue;
            if (internalUrlEl) internalUrlEl.value = (location.origin || iu);
            if (internalUrlEl) internalUrlEl.readOnly = true;
            if (internalUrlEl) internalUrlEl.placeholder = '内网地址自动获取';
            if (externalUrlEl) externalUrlEl.value = eu;
            const sm = localStorage.getItem('storageMode') || (window.appSettings && window.appSettings.storageMode || 'sqlite');
            if (storageModeEl) storageModeEl.value = ['json','sqlite','dual'].includes(sm) ? sm : 'sqlite';
            const ll = localStorage.getItem('logLevel') || (window.appSettings && window.appSettings.logLevel || 'info');
            if (logLevelSel) {
                logLevelSel.value = ['fatal','error','warn','info','debug'].includes(ll) ? ll : 'info';
                applyLogLevelSelectToneR(logLevelSel);
            }
        } catch(e) {}
        apiJson('/api/logs/level').then(j => {
            if (!j || !j.success || !logLevelSel) return;
            const lv = String(j.level || '').toLowerCase();
            if (['fatal','error','warn','info','debug'].includes(lv)) logLevelSel.value = lv;
            applyLogLevelSelectToneR(logLevelSel);
        }).catch(() => {});
        if (logLevelSel) {
            logLevelSel.onchange = function () {
                applyLogLevelSelectToneR(this);
            };
            applyLogLevelSelectToneR(logLevelSel);
        }
        const saveBtn = document.getElementById('appSettingsSaveR');
        const versionsSelectEl = document.getElementById('versionsSelect');
        const appSettingsVersionsSelectEl = document.getElementById('appSettingsVersionsSelectR');
        async function syncAppSettingsVersionsR(forceRefresh) {
            if (forceRefresh) {
                try {
                    if (window.refreshVersions) await window.refreshVersions(window.getCurrentVersionFile ? window.getCurrentVersionFile() : '', true);
                } catch(e) {}
            }
            if (!versionsSelectEl || !appSettingsVersionsSelectEl) return;
            const sourceOptions = Array.from(versionsSelectEl.options || []);
            appSettingsVersionsSelectEl.innerHTML = sourceOptions.map(opt => '<option value="' + (opt.value || '') + '">' + (opt.textContent || '') + '</option>').join('');
            appSettingsVersionsSelectEl.value = versionsSelectEl.value || '';
        }
        Promise.resolve().then(() => syncAppSettingsVersionsR(true));
        if (appSettingsVersionsSelectEl && versionsSelectEl) {
            appSettingsVersionsSelectEl.onchange = function () {
                versionsSelectEl.value = this.value;
            };
        }
        const appSettingsSaveVersionBtn = document.getElementById('appSettingsSaveVersionR');
        const appSettingsLoadVersionBtn = document.getElementById('appSettingsLoadVersionR');
        const appSettingsDeleteVersionBtn = document.getElementById('appSettingsDeleteVersionR');
        const appSettingsRefreshVersionBtn = document.getElementById('appSettingsRefreshVersionR');
        const saveBtnRaw = document.getElementById('saveBtn');
        const loadBtnRaw = document.getElementById('loadBtn');
        const deleteBtnRaw = document.getElementById('deletePersistBtn');
        const refreshBtnRaw = document.getElementById('refreshVersionsBtn');
        if (appSettingsSaveVersionBtn) appSettingsSaveVersionBtn.onclick = async function () {
            if (window.persistSave) await window.persistSave();
            await syncAppSettingsVersionsR(true);
        };
        if (appSettingsLoadVersionBtn) appSettingsLoadVersionBtn.onclick = async function () {
            if (window.loadSelectedVersion) await window.loadSelectedVersion();
            await syncAppSettingsVersionsR(true);
        };
        if (appSettingsDeleteVersionBtn) appSettingsDeleteVersionBtn.onclick = async function () {
            if (window.deleteSelectedVersion) await window.deleteSelectedVersion();
            await syncAppSettingsVersionsR(true);
        };
        if (appSettingsRefreshVersionBtn) appSettingsRefreshVersionBtn.onclick = async function () {
            if (window.refreshVersions) await window.refreshVersions(window.getCurrentVersionFile ? window.getCurrentVersionFile() : '', true);
            await syncAppSettingsVersionsR(false);
        };
        if (versionsSelectEl) versionsSelectEl.onchange = (function (origin) {
            return function () {
                if (typeof origin === 'function') origin.apply(this, arguments);
                syncAppSettingsVersionsR(false);
            };
        })(versionsSelectEl.onchange);
        if (applyLogLevelBtn) applyLogLevelBtn.onclick = async function() {
            const lv = logLevelSel ? String(logLevelSel.value || 'info').toLowerCase() : 'info';
            if (!['fatal','error','warn','info','debug'].includes(lv)) return;
            try { localStorage.setItem('logLevel', lv); } catch(e) {}
            if (window.appSettings) window.appSettings.logLevel = lv;
            try { await apiJson('/api/logs/level', { method: 'POST', body: { level: lv } }); } catch(e) {}
            try { await apiJson('/api/settings/update', { method:'POST', body: { logLevel: lv } }); } catch(e) {}
            if (window.showCenterConfirm) window.showCenterConfirm('日志级别已应用：' + lv.toUpperCase(), null, true);
        };
        if (checkBtn) checkBtn.onclick = async function() {
            const st = await fetchStorageStatusR();
            if (!st || !st.success) {
                if (window.showCenterConfirm) window.showCenterConfirm('存储状态查询失败，请稍后重试', null, true);
                return;
            }
            const c1 = (st.reconcile && st.reconcile.memory && st.reconcile.memory.count) || 0;
            const c2 = (st.reconcile && st.reconcile.sqlite && st.reconcile.sqlite.count) || 0;
            const m = await fetchStorageMetricsR();
            const qm = (m && m.success && m.queueMetrics) ? m.queueMetrics : (st.queueMetrics || null);
            if (window.showCenterConfirm) window.showCenterConfirm(`当前模式：读 ${st.readMode || '-'} / 写 ${st.writeMode || '-'}；频道 JSON ${c1} / SQLite ${c2}${queueText(qm)}`);
        };
        if (document.getElementById('appSettingsImportLegacyR')) document.getElementById('appSettingsImportLegacyR').onclick = async function() {
            const dirInput = document.getElementById('appSettingsLegacyDirR');
            const sourceDir = dirInput ? (dirInput.value || '').trim() : '';
            if (!sourceDir && !window.confirm('将导入当前 data 目录中的 JSON 数据到 SQLite，是否继续？')) return;
            if (sourceDir && !window.confirm('将从以下目录导入旧数据到 SQLite：\n' + sourceDir + '\n\n是否继续？')) return;
            try {
                const j = await apiJson('/api/system/import-legacy', { method: 'POST', body: { sourceDir } });
                if (!j.success) {
                    if (window.showCenterConfirm) window.showCenterConfirm('导入失败：' + (j.message || '未知错误'), null, true);
                    return;
                }
                const imp = j.imported || {};
                const parts = [];
                if (imp.streams != null) parts.push('频道 ' + imp.streams + ' 条');
                if (imp.fccServers != null) parts.push('FCC ' + imp.fccServers + ' 条');
                if (imp.udpxyServers != null) parts.push('UDPXy ' + imp.udpxyServers + ' 条');
                if (imp.groupTitles != null) parts.push('分组 ' + imp.groupTitles + ' 条');
                if (imp.epgSources != null) parts.push('EPG ' + imp.epgSources + ' 条');
                if (imp.logoTemplates != null) parts.push('台标 ' + imp.logoTemplates + ' 条');
                if (imp.proxyServers != null) parts.push('代理 ' + imp.proxyServers + ' 条');
                if (window.showCenterConfirm) window.showCenterConfirm('导入完成：' + (parts.join('、') || '无数据'), null, true);
            } catch(e) {
                if (window.showCenterConfirm) window.showCenterConfirm('导入失败：网络异常', null, true);
            }
        };
        if (saveBtn) saveBtn.onclick = async function() {
            const ui = !!(useInternalEl && useInternalEl.checked);
            const ue = !!(useExternalEl && useExternalEl.checked);
            const iu = location.origin;
            const eu = externalUrlEl ? (externalUrlEl.value || '').trim() : '';
            const sm = 'sqlite';
            const lv = logLevelSel ? String(logLevelSel.value || 'info').toLowerCase() : 'info';
            let savedOk = true;
            try {
                localStorage.setItem('useInternal', String(ui));
                localStorage.setItem('useExternal', String(ue));
                localStorage.setItem('internalUrl', iu);
                localStorage.setItem('externalUrl', eu);
                localStorage.setItem('storageMode', sm);
                localStorage.setItem('logLevel', lv);
                if (window.appSettings) {
                    window.appSettings.useInternal = ui;
                    window.appSettings.useExternal = ue;
                    window.appSettings.internalUrl = iu;
                    window.appSettings.externalUrl = eu;
                    window.appSettings.storageMode = sm;
                    window.appSettings.logLevel = lv;
                }
                await apiJson('/api/logs/level', { method: 'POST', body: { level: lv } });
                const rj = await apiJson('/api/settings/update', {
                    method: 'POST',
                    body: { useInternal: ui, useExternal: ue, internalUrl: iu, externalUrl: eu, storageMode: sm, logLevel: lv }
                });
                savedOk = !!(rj && rj.success);
            } catch(e) {
                savedOk = false;
            }
            if (!savedOk) {
                if (window.showCenterConfirm) window.showCenterConfirm('设置保存失败，请重试', null, true);
                return;
            }
            let msg = `已切换存储模式：${modeText(sm)}`;
            const st = await fetchStorageStatusR();
            if (st && st.success) {
                const c1 = (st.reconcile && st.reconcile.memory && st.reconcile.memory.count) || 0;
                const c2 = (st.reconcile && st.reconcile.sqlite && st.reconcile.sqlite.count) || 0;
                msg += `；读 ${st.readMode || '-'} / 写 ${st.writeMode || '-'}；JSON ${c1} / SQLite ${c2}`;
                msg += queueText(st.queueMetrics || null);
                if (sm === 'sqlite' && st.needsRepair) {
                    const rp = await repairStorageR();
                    if (rp && rp.success) {
                        const ac = (rp.after && rp.after.sqlite && rp.after.sqlite.count) || 0;
                        msg += `；已自动修复 SQLite，当前 ${ac} 条`;
                    } else {
                        msg += '；SQLite 发现空库，请点击“校验状态”后重试';
                    }
                }
            }
            if (window.showCenterConfirm) window.showCenterConfirm(msg);
            close();
        };
        modal.style.display = 'block';
        modal.querySelector('.modal').classList.add('show');
        Promise.resolve().then(() => syncAppSettingsVersionsR(true));
    };
})();