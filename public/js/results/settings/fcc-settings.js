(function() {
    const ns = (window.IptvCore = window.IptvCore || {});
    const settings = (ns.settings = ns.settings || {});
    const fcc = (settings.fcc = settings.fcc || {});

    function uuid() { return 'fcc-' + Math.random().toString(36).slice(2) + Date.now().toString(36); }

    fcc.getServers = function() {
        try {
            return JSON.parse(localStorage.getItem('fccServers') || '[]');
        } catch(e) {
            return [];
        }
    };

    fcc.saveServers = async function(list) {
        localStorage.setItem('fccServers', JSON.stringify(list));
        if (window.appSettings) window.appSettings.fccServers = list;
        await apiJson('/api/config/fcc-servers', {
            method: 'POST',
            body: { servers: list, currentId: fcc.getCurrentId() }
        });
    };

    fcc.syncBackend = async function() {
        const list = fcc.getServers();
        const curr = fcc.getCurrentId();
        await apiJson('/api/config/fcc-servers', {
            method: 'POST',
            body: { servers: list, currentId: curr }
        });
    };

    fcc.getCurrentId = function() {
        return localStorage.getItem('currentFccId') || '';
    };

    fcc.setCurrentId = function(id) {
        localStorage.setItem('currentFccId', id || '');
    };

    fcc.renderSelect = function() {
        const sel = document.getElementById('fccSelect');
        if (!sel) return;
        const list = fcc.getServers();
        sel.innerHTML = '';
        list.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.id;
            opt.text = s.name + ' (' + s.addr + ')';
            sel.appendChild(opt);
        });
        const curr = fcc.getCurrentId();
        if (curr) sel.value = curr;
        if (!sel.value && list[0]) sel.value = list[0].id;
    };

    fcc.add = function(name, addr) {
        const n = (name || '').trim();
        const a = (addr || '').trim();
        if (!n || !a) return;
        const list = fcc.getServers();
        const id = uuid();
        list.push({ id, name: n, addr: a });
        fcc.saveServers(list);
        fcc.setCurrentId(id);
        fcc.renderSelect();
    };

    fcc.deleteCurrent = function() {
        const curr = fcc.getCurrentId();
        if (!curr) return;
        const list = fcc.getServers();
        const idx = list.findIndex(s => s.id === curr);
        if (idx >= 0) list.splice(idx, 1);
        fcc.saveServers(list);
        fcc.setCurrentId(list[0] ? list[0].id : '');
        fcc.renderSelect();
    };

    fcc.openModal = function() {
        let modal = document.getElementById('fccModalR');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'fccModalR';
            modal.innerHTML = '<div class="modal fade" tabindex="-1" style="display:block;background:rgba(0,0,0,0.5);z-index:9999;"><div class="modal-dialog modal-dialog-centered modal-lg"><div class="modal-content border-0 shadow-lg" style="border-radius:12px;"><div class="modal-header border-bottom-0 pb-0"><h5 class="modal-title fw-bold text-dark"><i class="bi bi-lightning-charge me-2"></i>FCC设置</h5><button type="button" class="btn-close" id="fccCloseR"></button></div><div class="modal-body pt-2 pb-4 px-4"><div class="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-4 bg-light p-3 rounded-3"><div class="text-secondary small d-flex align-items-center"><i class="bi bi-info-circle me-2 fs-5 text-primary"></i><span>支持 ip:port 或 fcc=ip:port，保存后将同步到服务端</span></div><div class="d-flex flex-wrap align-items-center gap-2"><button class="btn btn-primary btn-sm" id="fccAddBtnR"><i class="bi bi-plus-lg me-1"></i>添加</button><button class="btn btn-success btn-sm" id="fccSaveBtnR"><i class="bi bi-save me-1"></i>保存</button></div></div><div id="fccListWrapR"></div></div></div></div></div>';
            document.body.appendChild(modal);
        }
        function close() {
            modal.style.display = 'none';
            modal.querySelector('.modal').classList.remove('show');
        }
        document.getElementById('fccCloseR').onclick = close;

        const listWrap = document.getElementById('fccListWrapR');
        function uuidLocal() { return 'fcc-' + Math.random().toString(36).slice(2) + Date.now().toString(36); }
        function renderList(list) {
            listWrap.innerHTML = '<div class="table-responsive"><table class="table table-sm align-middle"><thead><tr><th style="width:160px;">名称</th><th>地址</th><th style="width:120px;">操作</th></tr></thead><tbody id="fccTbodyR"></tbody></table></div>';
            const tbody = document.getElementById('fccTbodyR');
            tbody.innerHTML = '';
            list.forEach(item => {
                const tr = document.createElement('tr');
                tr.innerHTML = '<td><input class="form-control form-control-sm" id="fccName-'+item.id+'" value="'+(item.name||'')+'"></td><td><input class="form-control form-control-sm" id="fccAddr-'+item.id+'" value="'+(item.addr||'')+'"></td><td><div class="d-flex" style="gap:8px;"><button class="btn btn-outline-primary btn-sm" id="fccSync-'+item.id+'">同步FCC</button><button class="btn btn-outline-danger btn-sm" id="fccDel-'+item.id+'">删除</button></div></td>';
                tbody.appendChild(tr);
                const delBtn = document.getElementById('fccDel-'+item.id);
                if (delBtn) delBtn.onclick = function() { tr.remove(); };
                const syncBtn = document.getElementById('fccSync-'+item.id);
                if (syncBtn) syncBtn.onclick = async function() {
                    const addrEl = document.getElementById('fccAddr-'+item.id);
                    const addr = addrEl ? (addrEl.value || '').trim() : '';
                    if (!addr) return;
                    fcc.setCurrentId(item.id);
                    try {
                        const j = await apiJson('/api/set-fcc', { method: 'POST', body: { fcc: addr } });
                        if (j && j.success) {
                            if (window.fetchStreams) await window.fetchStreams();
                        }
                    } catch(e) {}
                };
            });
        }
        function fetchList() {
            const list = fcc.getServers();
            renderList(Array.isArray(list) ? list : []);
        }
        const addBtn = document.getElementById('fccAddBtnR');
        if (addBtn) addBtn.onclick = function() {
            const tbody = document.getElementById('fccTbodyR');
            if (!tbody) return;
            const id = uuidLocal();
            const tr = document.createElement('tr');
            tr.innerHTML = '<td><input class="form-control form-control-sm" id="fccName-'+id+'" placeholder="名称"></td><td><input class="form-control form-control-sm" id="fccAddr-'+id+'" placeholder="ip:port 或 fcc=ip:port"></td><td><button class="btn btn-outline-danger btn-sm" id="fccDel-'+id+'">删除</button></td>';
            tbody.appendChild(tr);
            const delBtn = document.getElementById('fccDel-'+id);
            if (delBtn) delBtn.onclick = function() { tr.remove(); };
        };
        const saveBtn = document.getElementById('fccSaveBtnR');
        if (saveBtn) saveBtn.onclick = async function() {
            const tbody = document.getElementById('fccTbodyR');
            if (!tbody) return;
            const rows = Array.from(tbody.querySelectorAll('tr'));
            const list = rows.map(tr => {
                const nameEl = tr.querySelector('input[id^="fccName-"]');
                const addrEl = tr.querySelector('input[id^="fccAddr-"]');
                const id = (nameEl && nameEl.id ? nameEl.id.replace('fccName-','') : uuidLocal());
                const name = nameEl ? (nameEl.value||'').trim() : '';
                const addr = addrEl ? (addrEl.value||'').trim() : '';
                return { id, name: name || '未命名FCC', addr };
            }).filter(x => x.addr);
            await fcc.saveServers(list);
            fcc.setCurrentId(list[0] ? list[0].id : '');
            close();
        };
        modal.style.display = 'block';
        modal.querySelector('.modal').classList.add('show');
        fetchList();
    };
})();