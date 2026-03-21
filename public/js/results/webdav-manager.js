(function () {
    const ns = (window.IptvCore = window.IptvCore || {});
    const results = (ns.results = ns.results || {});
    const webdav = (results.webdav = results.webdav || {});

    webdav.openModal = function () {
        let modal = document.getElementById('webdavModalR');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'webdavModalR';
            modal.innerHTML =
                '<style>#webdavModalR .modal-content{border-radius:14px}#webdavModalR .wd-section{border:1px solid #e9ecef;border-radius:10px;padding:12px;background:#fafbfc}#webdavModalR .wd-title{display:flex;align-items:center;gap:8px;margin-bottom:8px;color:#6c757d;font-size:13px}#webdavModalR .form-label{margin-bottom:6px;color:#6c757d}#webdavModalR .input-group-text{background:#f8f9fa}</style>'
                + '<div class="modal fade" tabindex="-1" style="display:block;background:rgba(0,0,0,0.5);z-index:9999;">'
                + '<div class="modal-dialog modal-dialog-centered modal-lg"><div class="modal-content border-0 shadow-lg">'
                + '<div class="modal-header border-0 pb-0"><h5 class="modal-title fw-bold text-dark d-flex align-items-center gap-2"><i class="bi bi-cloud"></i><span>WebDAV 备份/恢复</span></h5><button type="button" class="btn-close" id="webdavCloseR"></button></div>'
                + '<div class="modal-body pt-2 pb-4 px-4">'
                + '<div class="row g-3 mb-3">'
                + '<div class="col-md-6"><label class="form-label small">WebDAV 地址</label><div class="input-group"><span class="input-group-text"><i class="bi bi-link-45deg"></i></span><input class="form-control" id="wdUrl" placeholder="例如：https://dav.example.com/dav/"></div></div>'
                + '<div class="col-md-3"><label class="form-label small">用户名</label><div class="input-group"><span class="input-group-text"><i class="bi bi-person"></i></span><input class="form-control" id="wdUser" placeholder="可选"></div></div>'
                + '<div class="col-md-3"><label class="form-label small">密码</label><div class="input-group"><span class="input-group-text"><i class="bi bi-shield-lock"></i></span><input class="form-control" id="wdPass" type="password" placeholder="可选"></div></div>'
                + '<div class="col-md-9"><label class="form-label small">根目录</label><div class="input-group"><span class="input-group-text"><i class="bi bi-folder2-open"></i></span><input class="form-control" id="wdRoot" placeholder="/channel-sentinel"></div></div>'
                + '<div class="col-md-3 d-flex align-items-end"><div class="form-check form-switch"><input class="form-check-input" type="checkbox" id="wdInsecure"><label class="form-check-label small" for="wdInsecure">忽略证书校验</label></div></div>'
                + '</div>'
                + '<div class="d-flex flex-wrap gap-2 mb-3"><button class="btn btn-primary btn-sm" id="wdSaveCfg"><i class="bi bi-save me-1"></i>保存配置</button><button class="btn btn-secondary btn-sm" id="wdTest"><i class="bi bi-plug me-1"></i>测试连接</button><button class="btn btn-success btn-sm" id="wdBackup"><i class="bi bi-cloud-upload me-1"></i>备份到 WebDAV</button></div>'
                + '<div class="wd-section">'
                + '<div class="wd-title"><i class="bi bi-archive"></i><span>选择备份目录恢复</span><div class="ms-auto"><button class="btn btn-outline-secondary btn-sm" id="wdRefresh" title="刷新目录"><i class="bi bi-arrow-repeat"></i></button></div></div>'
                + '<select class="form-select form-select-sm" id="wdDirList" size="8"></select>'
                + '<div class="d-flex gap-2 mt-2"><button class="btn btn-danger btn-sm flex-fill" id="wdRestore"><i class="bi bi-cloud-download me-1"></i>从所选目录恢复</button><button class="btn btn-outline-danger btn-sm" id="wdDelete"><i class="bi bi-trash me-1"></i>删除目录</button></div>'
                + '</div>'
                + '</div></div></div></div>';
            document.body.appendChild(modal);
        }
        function close() {
            modal.style.display = 'none';
            modal.querySelector('.modal').classList.remove('show');
        }
        document.getElementById('webdavCloseR').onclick = close;
        apiJson('/api/settings').then(j => {
            if (j && j.settings) {
                const s = j.settings;
                const g = function (id, val) { const el = document.getElementById(id); if (el) el.value = val || ''; };
                g('wdUrl', s.webdavUrl || '');
                g('wdUser', s.webdavUser || '');
                g('wdPass', s.webdavPass || '');
                g('wdRoot', s.webdavRoot || '/');
                const chk = document.getElementById('wdInsecure');
                if (chk) chk.checked = !!s.webdavInsecure;
            }
        }).catch(() => {});

        const saveBtn = document.getElementById('wdSaveCfg');
        if (saveBtn) saveBtn.onclick = async function () {
            const payload = {
                webdavUrl: (document.getElementById('wdUrl').value || '').trim(),
                webdavUser: (document.getElementById('wdUser').value || '').trim(),
                webdavPass: (document.getElementById('wdPass').value || ''),
                webdavRoot: (document.getElementById('wdRoot').value || '/').trim() || '/',
                webdavInsecure: !!document.getElementById('wdInsecure').checked
            };
            await apiJson('/api/settings/update', { method: 'POST', body: payload });
            alert('已保存 WebDAV 配置');
        };

        const testBtn = document.getElementById('wdTest');
        if (testBtn) testBtn.onclick = async function () {
            const j = await apiJson('/api/webdav/test', { method: 'POST' });
            alert(j.success ? '连接正常' : '连接失败');
        };

        const dirSel = document.getElementById('wdDirList');
        async function refreshDirs() {
            dirSel.innerHTML = '';
            const j = await apiJson('/api/webdav/list', { method: 'POST' });
            if (j.success && Array.isArray(j.dirs)) {
                j.dirs.forEach(p => {
                    const opt = document.createElement('option');
                    opt.value = p;
                    let label = p;
                    try {
                        const parts = p.split('/').filter(Boolean);
                        let i = -1;
                        for (let k = 0; k < parts.length - 2; k++) {
                            if (/^\d{4}$/.test(parts[k]) && /^\d{8}$/.test(parts[k + 1]) && /^\d{6}$/.test(parts[k + 2])) { i = k; break; }
                        }
                        if (i !== -1) {
                            const ymd = parts[i + 1];
                            const hms = parts[i + 2];
                            const y2 = ymd.slice(0, 4);
                            const m2 = ymd.slice(4, 6);
                            const d2 = ymd.slice(6, 8);
                            const h = hms.slice(0, 2);
                            const m = hms.slice(2, 4);
                            const s = hms.slice(4, 6);
                            label = y2 + '-' + m2 + '-' + d2 + ' ' + h + ':' + m + ':' + s;
                        }
                    } catch (e) {}
                    opt.textContent = label;
                    dirSel.appendChild(opt);
                });
            }
        }

        const refreshBtn = document.getElementById('wdRefresh');
        if (refreshBtn) refreshBtn.onclick = refreshDirs;

        const backupBtn = document.getElementById('wdBackup');
        if (backupBtn) backupBtn.onclick = async function () {
            const j = await apiJson('/api/webdav/backup', { method: 'POST' });
            if (j.success) {
                alert('备份完成：' + j.folder);
                await refreshDirs();
            } else {
                alert('备份失败');
            }
        };

        const restoreBtn = document.getElementById('wdRestore');
        if (restoreBtn) restoreBtn.onclick = async function () {
            const folder = (dirSel && dirSel.value) || '';
            if (!folder) {
                alert('请选择要恢复的目录');
                return;
            }
            const j = await apiJson('/api/webdav/restore', { method: 'POST', body: { folder } });
            if (j.success) {
                alert('恢复完成');
                location.reload();
            } else {
                alert('恢复失败：' + (j.message || '') + ' ' + (j.details ? JSON.stringify(j.details).slice(0, 500) : ''));
            }
        };

        const deleteBtn = document.getElementById('wdDelete');
        if (deleteBtn) deleteBtn.onclick = async function () {
            const folder = (dirSel && dirSel.value) || '';
            if (!folder) {
                alert('请选择要删除的目录');
                return;
            }
            if (!confirm('确定删除所选 WebDAV 备份目录吗？此操作不可恢复。')) return;
            const j = await apiJson('/api/webdav/delete', { method: 'POST', body: { folder } });
            if (j && j.success) {
                alert('删除成功');
                await refreshDirs();
            } else {
                alert('删除失败：' + ((j && j.message) || ''));
            }
        };

        modal.style.display = 'block';
        modal.querySelector('.modal').classList.add('show');
        refreshDirs().catch(() => {});
    };

    webdav.bindTrigger = function (btnId) {
        const btn = document.getElementById(btnId || 'webdavBtn');
        if (btn) btn.onclick = webdav.openModal;
    };
})();
