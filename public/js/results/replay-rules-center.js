(function () {
    const ns = (window.IptvCore = window.IptvCore || {});
    const results = (ns.results = ns.results || {});
    const replayRules = (results.replayRules = results.replayRules || {});

    function getReplayProxyMode() {
        const m = results && typeof results.getReplayProxyMode === 'function' ? results.getReplayProxyMode() : 'path_no_scheme';
        const v = String(m || '').toLowerCase();
        return (v === 'with_proto_segment' || v === 'full_url') ? v : 'path_no_scheme';
    }

    function setReplayProxyMode(mode) {
        if (results && typeof results.setReplayProxyMode === 'function') {
            results.setReplayProxyMode(mode);
        }
    }

    replayRules.fetchDashboard = async function () {
        const [statusJ, snapsJ, hitsJ, catalogJ, selectionJ] = await Promise.all([
            apiJson('/api/system/replay-rules/status'),
            apiJson('/api/system/replay-rules/snapshots?limit=20'),
            apiJson('/api/system/replay-rules/hits?limit=100'),
            apiJson('/api/system/replay-rules/catalog'),
            apiJson('/api/system/replay-rules/selection')
        ]);
        return { statusJ, snapsJ, hitsJ, catalogJ, selectionJ };
    };

    replayRules.saveSelection = function (body) {
        return apiJson('/api/system/replay-rules/selection', { method: 'POST', body });
    };

    replayRules.createSnapshot = function (reason) {
        return apiJson('/api/system/replay-rules/snapshot', { method: 'POST', body: { reason: reason || 'ui_manual' } });
    };

    replayRules.rollback = function (snapshotId) {
        return apiJson('/api/system/replay-rules/rollback', { method: 'POST', body: { snapshotId } });
    };

    replayRules.attachModal = function (modal) {
        const ensureProxyRulePanel = function() {
            if (document.getElementById('replayRulesProxyModeR')) return;
            const timeModeNode = document.getElementById('replayRulesTimeModeR');
            if (!timeModeNode) return;
            const hostCol = timeModeNode.closest('.col-md-6');
            const hostRow = hostCol ? hostCol.parentElement : null;
            const hostCard = hostRow ? hostRow.closest('.card') : null;
            const cardBody = hostCard ? hostCard.querySelector('.card-body') : null;
            if (!cardBody) return;
            const block = document.createElement('div');
            block.className = 'row g-2 mt-1';
            block.innerHTML = '<div class="col-12"><div class="fw-bold mt-2 mb-1">单播代理规则</div><div class="small text-muted mb-1">内外网切换时统一作用于 HTTP/HTTPS/RTSP 单播与回放地址</div></div><div class="col-md-6"><label class="form-label small mb-1">代理拼接格式</label><select class="form-select form-select-sm" id="replayRulesProxyModeR"></select></div><div class="col-md-6"><label class="form-label small mb-1">说明</label><input class="form-control form-control-sm" id="replayRulesProxyModeDescR" readonly></div>';
            cardBody.appendChild(block);
        };
        ensureProxyRulePanel();
        const close = function() {
            modal.style.display = 'none';
            modal.querySelector('.modal').classList.remove('show');
        };
        const closeBtn = document.getElementById('replayRulesCloseR');
        if (closeBtn) closeBtn.onclick = close;
        const baseVerEl = document.getElementById('replayRulesBaseVerR');
        const timeVerEl = document.getElementById('replayRulesTimeVerR');
        const rollbackEl = document.getElementById('replayRulesRollbackR');
        const snapshotSel = document.getElementById('replayRulesSnapshotSelectR');
        const baseModeSel = document.getElementById('replayRulesBaseModeR');
        const baseRuleSel = document.getElementById('replayRulesBaseRuleIdR');
        const timeModeSel = document.getElementById('replayRulesTimeModeR');
        const timeFormatSel = document.getElementById('replayRulesTimeFormatIdR');
        const proxyModeSel = document.getElementById('replayRulesProxyModeR');
        const proxyModeDesc = document.getElementById('replayRulesProxyModeDescR');
        const placeholderTokenSel = document.getElementById('replayRulesPlaceholderTokenR');
        const placeholderValueInput = document.getElementById('replayRulesPlaceholderValueR');
        const saveSelBtn = document.getElementById('replayRulesSelectionSaveR');
        const hitsBody = document.getElementById('replayRulesHitsBodyR');
        const refreshBtn = document.getElementById('replayRulesRefreshR');
        const snapshotBtn = document.getElementById('replayRulesSnapshotR');
        const rollbackBtn = document.getElementById('replayRulesRollbackBtnR');
        let catalogCache = { baseRules: [], timeFormats: [], placeholderCatalog: [], proxyModes: [] };
        const ensureRuleDetailPanels = function() {
            const hostCardBody = placeholderValueInput ? placeholderValueInput.closest('.card-body') : null;
            if (!hostCardBody) return;
            if (document.getElementById('replayRulesDetailBlockR')) return;
            const block = document.createElement('div');
            block.id = 'replayRulesDetailBlockR';
            block.className = 'mt-2';
            block.innerHTML = '<div class="row g-2"><div class="col-12"><label class="form-label small mb-1">规则详情（当前选择）</label><textarea class="form-control form-control-sm" id="replayRulesFormatDetailR" rows="4" readonly></textarea></div><div class="col-12"><label class="form-label small mb-1">回放地址预览（基址 + 时间参数）</label><textarea class="form-control form-control-sm" id="replayRulesPreviewUrlR" rows="3" readonly></textarea></div></div>';
            hostCardBody.appendChild(block);
        };
        ensureRuleDetailPanels();
        const formatDetailEl = document.getElementById('replayRulesFormatDetailR');
        const previewUrlEl = document.getElementById('replayRulesPreviewUrlR');
        const renderHits = function(rows) {
            if (!hitsBody) return;
            const list = Array.isArray(rows) ? rows : [];
            if (!list.length) {
                hitsBody.innerHTML = '<tr><td colspan="8" class="text-muted text-center">暂无命中日志</td></tr>';
                return;
            }
            hitsBody.innerHTML = list.map(function(x) {
                const ok = x && x.success !== false;
                const res = ok ? '成功' : ('失败(' + String(x.errorCode || '-') + ')');
                return '<tr><td class="small">' + String(x.at || '-') + '</td><td>' + String(x.type || '-') + '</td><td>' + String(x.scope || '-') + '</td><td>' + String(x.fmt || '-') + '</td><td>' + String(x.proto || '-') + '</td><td>' + String(x.baseRuleId || '-') + '</td><td>' + String(x.timeRuleId || '-') + '</td><td>' + res + '</td></tr>';
            }).join('');
        };
        const renderSnapshots = function(rows) {
            if (!snapshotSel) return;
            const list = Array.isArray(rows) ? rows : [];
            snapshotSel.innerHTML = '';
            list.forEach(function(x) {
                const opt = document.createElement('option');
                opt.value = x.snapshotId || '';
                const bv = x && x.versions ? (x.versions.baseRulesVersion || '-') : '-';
                const tv = x && x.versions ? (x.versions.timeRulesVersion || '-') : '-';
                opt.textContent = (x.createdAt || '-') + ' | ' + bv + ' / ' + tv;
                snapshotSel.appendChild(opt);
            });
        };
        const renderPlaceholderByFormat = function(formatId) {
            if (!placeholderTokenSel) return;
            const all = Array.isArray(catalogCache.placeholderCatalog) ? catalogCache.placeholderCatalog : [];
            const byFmt = Array.isArray(catalogCache.timeFormats)
                ? (catalogCache.timeFormats.find(function(f){ return String(f.id || '') === String(formatId || ''); }) || {})
                : {};
            const keys = Array.isArray(byFmt.placeholders) ? byFmt.placeholders : [];
            const view = all;
            placeholderTokenSel.innerHTML = '';
            if (!view.length) {
                const opt = document.createElement('option');
                opt.value = '';
                opt.textContent = '无占位符数据';
                placeholderTokenSel.appendChild(opt);
                if (placeholderValueInput) placeholderValueInput.value = '';
                return;
            }
            view.forEach(function(p) {
                const opt = document.createElement('option');
                opt.value = String(p.key || '');
                opt.setAttribute('data-value', String(p.value || ''));
                opt.setAttribute('data-kind', String(p.kind || ''));
                const usedMark = keys.includes(String(p.key || '')) ? '★' : ' ';
                opt.textContent = usedMark + ' ' + String(p.key || '') + ' => ' + String(p.value || '') + ' [' + String(p.kind || '-') + ']';
                placeholderTokenSel.appendChild(opt);
            });
            const first = placeholderTokenSel.options[0];
            if (placeholderValueInput) placeholderValueInput.value = first ? (first.getAttribute('data-value') || '') : '';
            if (formatDetailEl || previewUrlEl) {
                const selectedBaseId = baseRuleSel ? String(baseRuleSel.value || '') : '';
                const selectedBase = Array.isArray(catalogCache.baseRules) ? (catalogCache.baseRules.find(function(r){ return String(r.id || '') === selectedBaseId; }) || {}) : {};
                const selectedFmt = byFmt || {};
                if (formatDetailEl) {
                    formatDetailEl.value =
                        '基础规则: ' + (selectedBase.id || '(自动)') + '\n' +
                        '  scope=' + String(selectedBase.scope || '*') + ', protocols=' + String((selectedBase.protocols || []).join(',') || '-') + '\n' +
                        '  host=' + String(selectedBase.hostRegex || '-') + '\n' +
                        '  path=' + String(selectedBase.pathRegex || '-') + '\n' +
                        '  output=' + String(selectedBase.outputTemplate || '-') + '\n' +
                        '时间规则: ' + String(selectedFmt.id || '(未指定)') + '\n' +
                        '  template=' + String(selectedFmt.template || '-') + '\n' +
                        '  placeholders=' + String((selectedFmt.placeholders || []).join(', ') || '-');
                }
                if (previewUrlEl) {
                    const baseTpl = String(selectedBase.outputTemplate || '{live_base}');
                    const timeTpl = String(selectedFmt.template || '');
                    const joiner = baseTpl.includes('?') ? '&' : '?';
                    previewUrlEl.value = baseTpl + (timeTpl ? (joiner + timeTpl) : '');
                }
            }
        };
        const fillSelectionOptions = function(catalog, selection) {
            catalogCache = catalog || { baseRules: [], timeFormats: [], placeholderCatalog: [], proxyModes: [] };
            if (baseRuleSel) {
                baseRuleSel.innerHTML = '<option value="">未指定</option>';
                (catalog && Array.isArray(catalog.baseRules) ? catalog.baseRules : []).forEach(function(r) {
                    const opt = document.createElement('option');
                    opt.value = String(r.id || '');
                    opt.textContent = String(r.id || '') + ' [' + String(r.scope || '*') + ']';
                    baseRuleSel.appendChild(opt);
                });
            }
            if (timeFormatSel) {
                timeFormatSel.innerHTML = '';
                const emptyOpt = document.createElement('option');
                emptyOpt.value = '';
                emptyOpt.textContent = '未指定';
                timeFormatSel.appendChild(emptyOpt);
                const realGroup = document.createElement('optgroup');
                realGroup.label = '实规则';
                const aliasGroup = document.createElement('optgroup');
                aliasGroup.label = '别名规则';
                (catalog && Array.isArray(catalog.timeFormats) ? catalog.timeFormats : []).forEach(function(f) {
                    const opt = document.createElement('option');
                    opt.value = String(f.id || '');
                    const aliasMark = f && f.isAlias ? (' → ' + String(f.aliasTo || '-')) : '';
                    opt.textContent = String(f.id || '') + aliasMark;
                    if (f && f.isAlias) aliasGroup.appendChild(opt);
                    else realGroup.appendChild(opt);
                });
                if (realGroup.children.length > 0) timeFormatSel.appendChild(realGroup);
                if (aliasGroup.children.length > 0) timeFormatSel.appendChild(aliasGroup);
            }
            if (proxyModeSel) {
                proxyModeSel.innerHTML = '';
                (catalog && Array.isArray(catalog.proxyModes) ? catalog.proxyModes : []).forEach(function(p) {
                    const opt = document.createElement('option');
                    opt.value = String(p.id || '');
                    opt.textContent = String(p.name || p.id || '');
                    opt.setAttribute('data-desc', String(p.description || ''));
                    proxyModeSel.appendChild(opt);
                });
                if (!proxyModeSel.options.length) {
                    const opt = document.createElement('option');
                    opt.value = 'path_no_scheme';
                    opt.textContent = '格式1';
                    opt.setAttribute('data-desc', '单播代理/单播地址(去协议)');
                    proxyModeSel.appendChild(opt);
                }
            }
            const sel = selection || {};
            const baseSel = sel.base || {};
            const timeSel = sel.time || {};
            const proxySel = sel.proxy || {};
            const nextProxyMode = String(proxySel.mode || getReplayProxyMode() || 'path_no_scheme').toLowerCase();
            setReplayProxyMode(nextProxyMode);
            if (baseModeSel) baseModeSel.value = String(baseSel.mode || 'auto') === 'manual' ? 'manual' : 'auto';
            if (baseRuleSel) baseRuleSel.value = String(baseSel.ruleId || '');
            if (timeModeSel) timeModeSel.value = String(timeSel.mode || 'auto') === 'manual' ? 'manual' : 'auto';
            if (timeFormatSel) timeFormatSel.value = String(timeSel.formatId || '');
            if (baseRuleSel) baseRuleSel.disabled = !(baseModeSel && baseModeSel.value === 'manual');
            if (timeFormatSel) timeFormatSel.disabled = !(timeModeSel && timeModeSel.value === 'manual');
            if (proxyModeSel) proxyModeSel.value = String(proxySel.mode || 'path_no_scheme');
            if (proxyModeSel && !proxyModeSel.value && proxyModeSel.options[0]) proxyModeSel.value = proxyModeSel.options[0].value;
            if (proxyModeSel && proxyModeDesc) {
                const opt = proxyModeSel.options[proxyModeSel.selectedIndex];
                proxyModeDesc.value = opt ? String(opt.getAttribute('data-desc') || '') : '';
            }
            renderPlaceholderByFormat(timeFormatSel ? timeFormatSel.value : '');
        };
        const refreshAll = async function() {
            try {
                const payload = await replayRules.fetchDashboard();
                const statusJ = payload.statusJ;
                const snapsJ = payload.snapsJ;
                const hitsJ = payload.hitsJ;
                const catalogJ = payload.catalogJ;
                const selectionJ = payload.selectionJ;
                const c = statusJ && statusJ.current ? statusJ.current : {};
                if (baseVerEl) baseVerEl.textContent = '基础规则：' + String(c.baseRulesVersion || '-') + '（' + String(c.baseUpdatedAt || '-') + '）';
                if (timeVerEl) timeVerEl.textContent = '时间规则：' + String(c.timeRulesVersion || '-') + '（' + String(c.timeUpdatedAt || '-') + '）';
                const rb = statusJ && statusJ.lastRollback ? statusJ.lastRollback : null;
                if (rollbackEl) rollbackEl.textContent = '最近回滚：' + (rb ? (String(rb.snapshotId || '-') + ' @ ' + String(rb.at || '-')) : '无');
                renderSnapshots(snapsJ && snapsJ.snapshots ? snapsJ.snapshots : []);
                renderHits(hitsJ && hitsJ.hitLogs ? hitsJ.hitLogs : []);
                fillSelectionOptions(catalogJ || {}, (selectionJ && selectionJ.selection) || {});
            } catch (e) {
                showCenterConfirm('回放规则刷新失败', null, true);
            }
        };
        if (baseModeSel) baseModeSel.onchange = function() {
            if (baseRuleSel) baseRuleSel.disabled = this.value !== 'manual';
        };
        if (timeModeSel) timeModeSel.onchange = function() {
            if (timeFormatSel) timeFormatSel.disabled = this.value !== 'manual';
            renderPlaceholderByFormat(timeFormatSel ? timeFormatSel.value : '');
        };
        if (timeFormatSel) timeFormatSel.onchange = function() {
            renderPlaceholderByFormat(this.value);
        };
        if (proxyModeSel) proxyModeSel.onchange = function() {
            if (proxyModeDesc) {
                const opt = this.options[this.selectedIndex];
                proxyModeDesc.value = opt ? String(opt.getAttribute('data-desc') || '') : '';
            }
        };
        if (placeholderTokenSel) placeholderTokenSel.onchange = function() {
            const idx = this.selectedIndex;
            const opt = idx >= 0 ? this.options[idx] : null;
            if (placeholderValueInput) placeholderValueInput.value = opt ? (opt.getAttribute('data-value') || '') : '';
        };
        if (saveSelBtn) saveSelBtn.onclick = async function() {
            try {
                const body = {
                    base: {
                        mode: baseModeSel ? baseModeSel.value : 'auto',
                        ruleId: baseRuleSel ? (baseRuleSel.value || '') : ''
                    },
                    time: {
                        mode: timeModeSel ? timeModeSel.value : 'auto',
                        formatId: timeFormatSel ? (timeFormatSel.value || '') : ''
                    },
                    proxy: {
                        mode: proxyModeSel ? (proxyModeSel.value || 'path_no_scheme') : 'path_no_scheme'
                    }
                };
                const j = await replayRules.saveSelection(body);
                if (!j || !j.success) {
                    showCenterConfirm('保存规则选择失败：' + String((j && j.message) || '未知错误'), null, true);
                    return;
                }
                showCenterConfirm('规则选择已保存', null, true);
                await refreshAll();
            } catch (e) {
                showCenterConfirm('保存规则选择失败', null, true);
            }
        };
        if (refreshBtn) refreshBtn.onclick = refreshAll;
        if (snapshotBtn) snapshotBtn.onclick = async function() {
            try {
                const j = await replayRules.createSnapshot('ui_manual');
                if (!j || !j.success) {
                    showCenterConfirm('创建快照失败：' + String((j && j.message) || '未知错误'), null, true);
                    return;
                }
                showCenterConfirm('快照创建成功：' + String(j.snapshot && j.snapshot.snapshotId || ''), null, true);
                await refreshAll();
            } catch (e) {
                showCenterConfirm('创建快照失败', null, true);
            }
        };
        if (rollbackBtn) rollbackBtn.onclick = function() {
            const sid = snapshotSel ? String(snapshotSel.value || '').trim() : '';
            if (!sid) {
                showCenterConfirm('请先选择快照', null, true);
                return;
            }
            showCenterConfirm('确定回滚到选中快照？', async function(ok) {
                if (!ok) return;
                try {
                    const j = await replayRules.rollback(sid);
                    if (!j || !j.success) {
                        showCenterConfirm('回滚失败：' + String((j && j.message) || '未知错误'), null, true);
                        return;
                    }
                    showCenterConfirm('回滚成功：' + sid, null, true);
                    await refreshAll();
                } catch (e) {
                    showCenterConfirm('回滚失败', null, true);
                }
            });
        };
        modal.style.display = 'block';
        modal.querySelector('.modal').classList.add('show');
        refreshAll();
    };

    replayRules.openModal = function () {
        if (typeof window.openReplayRulesModal === 'function') {
            return window.openReplayRulesModal();
        }
        if (typeof window.showCenterConfirm === 'function') {
            window.showCenterConfirm('回放规则模块入口不可用，请刷新页面后重试', null, true);
        }
    };

    replayRules.bindTrigger = function (btnId) {
        const btn = document.getElementById(btnId || 'replayRulesBtn');
        if (btn) btn.onclick = replayRules.openModal;
    };
})();
