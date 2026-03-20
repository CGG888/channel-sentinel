(function () {
    const ns = (window.IptvCore = window.IptvCore || {});
    const persist = (ns.persist = ns.persist || {});

    function parseBackupValue(v) {
        const raw = String(v || '');
        const idx = raw.indexOf('|');
        if (idx <= 0) return { type: '', filename: raw };
        return { type: raw.slice(0, idx), filename: raw.slice(idx + 1) };
    }

    function formatBackupLabel(v) {
        const dt = v && v.time ? new Date(v.time) : null;
        const t = dt && !isNaN(dt.getTime()) ? dt.toLocaleString() : '-';
        const tag = v && v.type === 'sqlite-main' ? '主库' : (v && v.type === 'sqlite' ? 'SQLite备份' : 'JSON备份');
        return '[' + tag + '] ' + v.file + ' · ' + t;
    }

    function createManager(options) {
        const opts = options || {};
        const selectId = opts.selectId || 'versionsSelect';
        const safetyHintId = opts.safetyHintId || 'backupSafetyHint';
        const notify = typeof opts.notify === 'function' ? opts.notify : function () {};
        const confirmFn = typeof opts.confirm === 'function' ? opts.confirm : null;
        const getCurrent = typeof opts.getCurrentVersionFile === 'function'
            ? opts.getCurrentVersionFile
            : function () { try { return localStorage.getItem('currentVersionFile') || ''; } catch (e) { return ''; } };
        const setCurrent = typeof opts.setCurrentVersionFile === 'function'
            ? opts.setCurrentVersionFile
            : function (f) { try { localStorage.setItem('currentVersionFile', f || ''); } catch (e) {} };
        const applyStreams = typeof opts.applyStreams === 'function' ? opts.applyStreams : async function () {};
        const applySettings = typeof opts.applySettings === 'function' ? opts.applySettings : async function () {};
        const refreshData = typeof opts.refreshData === 'function' ? opts.refreshData : async function () {};
        const getCounts = typeof opts.getCounts === 'function'
            ? opts.getCounts
            : function () { return { total: 0, online: 0, offline: 0 }; };

        function getSelect() {
            return document.getElementById(selectId);
        }

        function ensureBackupSafetyHint() {
            const sel = getSelect();
            if (!sel) return;
            let tip = document.getElementById(safetyHintId);
            if (!tip) {
                tip = document.createElement('div');
                tip.id = safetyHintId;
                tip.style.cssText = 'margin-top:8px;color:#dc3545;font-size:12px;font-weight:600;';
                sel.parentNode && sel.parentNode.appendChild(tip);
            }
            tip.textContent = '重要提示：请先预览备份数据。确认无误后，再通过确认弹窗恢复到主库。';
        }

        async function refresh(selectedFile, quiet) {
            try {
                const j = await apiJson('/api/persist/backups');
                const sel = getSelect();
                if (!sel) return;
                sel.innerHTML = '';
                const placeholder = document.createElement('option');
                placeholder.value = '';
                placeholder.text = '请选择版本';
                sel.appendChild(placeholder);
                sel.value = '';
                if (j.success && Array.isArray(j.backups) && j.backups.length > 0) {
                    j.backups.forEach(v => {
                        const opt = document.createElement('option');
                        opt.value = v.type + '|' + v.file;
                        opt.text = formatBackupLabel(v);
                        sel.appendChild(opt);
                    });
                    if (selectedFile) {
                        const has = j.backups.find(v => (v.type + '|' + v.file) === selectedFile);
                        sel.value = has ? selectedFile : '';
                    }
                    if (!quiet) notify('刷新成功：共 ' + j.backups.length + ' 个备份（当前模式：' + (j.mode || '-') + '）');
                } else {
                    if (!quiet) notify('刷新成功：当前模式暂无可用备份');
                }
                ensureBackupSafetyHint();
            } catch (e) {}
        }

        async function applyLoadedPayload(meta, filename, payload, selected, previewMode) {
            if (Array.isArray(payload && payload.streams)) {
                await applyStreams(payload.streams);
            } else {
                await refreshData();
            }
            if (payload && payload.settings) {
                await applySettings(payload.settings);
            }
            const counts = getCounts() || {};
            const total = typeof payload.loadedCount === 'number' ? payload.loadedCount : Number(counts.total || 0);
            const online = Number(counts.online || 0);
            const offline = typeof counts.offline === 'number' ? counts.offline : (total - online);
            const label = meta.type === 'sqlite-main'
                ? ('SQLite主库 ' + filename)
                : (meta.type === 'sqlite' ? ('SQLite备份 ' + filename) : ('JSON备份 ' + filename));
            setCurrent(selected);
            await refresh(selected, true);
            if (previewMode) {
                notify('已预览：' + label + '（总 ' + total + '，在线 ' + online + '，离线 ' + offline + '）。请确认无误后再恢复主库。');
                return;
            }
            const backupTip = payload && payload.preBackup ? ('；恢复前已创建保护备份：' + payload.preBackup) : '';
            notify('已恢复：' + label + ' 到主库（总 ' + total + '，在线 ' + online + '，离线 ' + offline + '）' + backupTip);
        }

        async function loadSelected() {
            const sel = getSelect();
            if (!sel || !sel.value) {
                notify('请先选择要加载的版本');
                return;
            }
            const selected = sel.value;
            const meta = parseBackupValue(selected);
            const filename = meta.filename;
            if (meta.type === 'sqlite') {
                const preview = await apiJson('/api/persist/preview-backup', { method: 'POST', body: { type: meta.type, filename } });
                if (!(preview && preview.success)) {
                    notify('预览失败：' + (preview && preview.message ? preview.message : '未知错误'));
                    return;
                }
                await applyLoadedPayload(meta, filename, preview, selected, true);
                const ask = async function (ok) {
                    if (!ok) return;
                    const restore = await apiJson('/api/persist/restore-backup', {
                        method: 'POST',
                        body: { type: meta.type, filename, confirmed: true }
                    });
                    if (!(restore && restore.success)) {
                        notify('恢复失败：' + (restore && restore.message ? restore.message : '未知错误'));
                        return;
                    }
                    await applyLoadedPayload(meta, filename, restore, selected, false);
                };
                if (confirmFn) {
                    confirmFn('预览完成。确认恢复后将覆盖主库，是否继续恢复？', ask);
                } else {
                    ask(window.confirm('预览完成。确认恢复后将覆盖主库，是否继续恢复？'));
                }
                return;
            }
            const loaded = await apiJson('/api/persist/load-backup', { method: 'POST', body: { type: meta.type, filename } });
            if (!(loaded && loaded.success)) {
                notify('加载失败：' + (loaded && loaded.message ? loaded.message : '未知错误'));
                return;
            }
            await applyLoadedPayload(meta, filename, loaded, selected, false);
        }

        async function deleteSelected() {
            const sel = getSelect();
            const selected = sel && sel.value ? sel.value : '';
            if (!selected) {
                notify('请先选择要删除的版本');
                return;
            }
            const meta = parseBackupValue(selected);
            if (meta.type === 'sqlite-main') {
                notify('主库不可删除');
                return;
            }
            const filename = meta.filename;
            const j = await apiJson('/api/persist/delete-backup', { method: 'POST', body: { type: meta.type, filename } });
            if (j && j.success) {
                if (getCurrent() === selected) setCurrent('');
                await refresh('', true);
                notify('已删除备份：' + filename);
                return;
            }
            notify('删除失败：' + (j && j.message ? j.message : '未知错误'));
        }

        async function save() {
            const j = await apiJson('/api/persist/save', { method: 'POST' });
            if (j && j.success) {
                await refresh(getCurrent(), true);
                const parts = [];
                if (j.jsonBackup) parts.push('JSON=' + j.jsonBackup);
                if (j.sqliteBackup) parts.push('SQLite=' + j.sqliteBackup);
                const txt = parts.length > 0 ? ('；同时间备份：' + parts.join('，')) : '';
                notify('保存成功：streams.json' + txt);
            }
        }

        async function pageRefresh() {
            const curr = getCurrent();
            let verCount = 0;
            try {
                const j = await apiJson('/api/persist/backups');
                if (j.success && Array.isArray(j.backups)) verCount = j.backups.length;
            } catch (e) {}
            await refresh(curr, true);
            await refreshData();
            const counts = getCounts() || {};
            const total = Number(counts.total || 0);
            const online = Number(counts.online || 0);
            const offline = typeof counts.offline === 'number' ? counts.offline : (total - online);
            const currMeta = parseBackupValue(curr);
            const currLabel = curr && curr.length
                ? ((currMeta.type === 'sqlite-main' ? 'SQLite主库 ' : (currMeta.type === 'sqlite' ? 'SQLite备份 ' : 'JSON备份 ')) + currMeta.filename)
                : 'streams.json';
            notify('刷新成功：当前版本 ' + currLabel + '，版本 ' + verCount + ' 个，当前数据条数 ' + total + '（在线 ' + online + '，离线 ' + offline + '）');
        }

        return {
            parseBackupValue,
            formatBackupLabel,
            refresh,
            loadSelected,
            deleteSelected,
            save,
            pageRefresh,
            getCurrentVersionFile: getCurrent,
            setCurrentVersionFile: setCurrent
        };
    }

    persist.createManager = createManager;
})();
