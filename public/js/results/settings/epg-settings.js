(function() {
    const ns = (window.IptvCore = window.IptvCore || {});
    const settings = (ns.settings = ns.settings || {});
    const epg = (settings.epg = settings.epg || {});

    epg.uuid = function() {
        return 'epg-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    };

    epg.openModal = async function() {
        let modal = document.getElementById('epgModalR');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'epgModalR';
            modal.innerHTML = '<div class="modal fade" tabindex="-1" style="display:block;background:rgba(0,0,0,0.5);z-index:9999;"><div class="modal-dialog modal-dialog-centered modal-lg"><div class="modal-content border-0 shadow-lg" style="border-radius:12px;"><div class="modal-header border-bottom-0 pb-0"><h5 class="modal-title fw-bold text-dark"><i class="bi bi-calendar-week me-2"></i>EPG设置</h5><button type="button" class="btn-close" id="epgCloseR"></button></div><div class="modal-body pt-2 pb-4 px-4"><div class="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-4 bg-light p-3 rounded-3"><div class="text-secondary small d-flex align-items-center"><i class="bi bi-info-circle me-2 fs-5 text-primary"></i><span>支持xmltv格式，支持自建EPG或者使用第三方EPG，推荐使用<a href="https://github.com/taksssss/iptv-tool" target="_blank">iptv-tool</a></span></div><div class="d-flex flex-wrap align-items-center gap-2"><button class="btn btn-primary btn-sm" id="epgAddBtn"><i class="bi bi-plus-lg me-1"></i>添加</button><button class="btn btn-success btn-sm" id="epgSaveBtn"><i class="bi bi-save me-1"></i>保存</button></div></div><div id="epgListWrapR"></div></div></div></div></div>';
            document.body.appendChild(modal);
        }
        function close() {
            modal.style.display = 'none';
            modal.querySelector('.modal').classList.remove('show');
        }
        document.getElementById('epgCloseR').onclick = close;

        const listWrap = document.getElementById('epgListWrapR');

        async function fetchList() {
            try {
                const j = await apiJson('/api/config/epg-sources');
                const list = Array.isArray(j.sources) ? j.sources : [];
                renderList(list);
            } catch(e) {
                renderList([]);
            }
        }

        function renderList(list) {
            const origin = location.origin;
            listWrap.innerHTML = '<div class="table-responsive"><table class="table table-sm align-middle"><thead><tr><th style="width:160px;">名称</th><th>地址</th><th style="width:120px;">分类</th><th style="width:120px;">操作</th></tr></thead><tbody id="epgTbodyR"></tbody></table></div>';
            const tbody = document.getElementById('epgTbodyR');
            tbody.innerHTML = '';
            list.forEach(item => {
                const href = item.url && !item.url.startsWith('http') ? (origin + item.url) : item.url;
                const tr = document.createElement('tr');
                tr.innerHTML = '<td><input class="form-control form-control-sm" id="epgName-'+item.id+'" value="'+(item.name||'')+'"></td><td><input class="form-control form-control-sm" id="epgUrl-'+item.id+'" value="'+(href||'')+'"></td><td><select class="form-select form-select-sm" id="epgScope-'+item.id+'"><option value="内网EPG">内网EPG</option><option value="外网EPG">外网EPG</option></select></td><td><button class="btn btn-outline-danger btn-sm" id="epgDel-'+item.id+'">删除</button></td>';
                tbody.appendChild(tr);
                const sel = document.getElementById('epgScope-'+item.id);
                if (sel) sel.value = (item.scope === '外网EPG') ? '外网EPG' : '内网EPG';
                const delBtn = document.getElementById('epgDel-'+item.id);
                if (delBtn) delBtn.onclick = function() {
                    tr.remove();
                };
            });
        }

        const addBtn = document.getElementById('epgAddBtn');
        if (addBtn) addBtn.onclick = function() {
            const tbody = document.getElementById('epgTbodyR');
            if (!tbody) return;
            const id = epg.uuid();
            const tr = document.createElement('tr');
            tr.innerHTML = '<td><input class="form-control form-control-sm" id="epgName-'+id+'" placeholder="名称"></td><td><input class="form-control form-control-sm" id="epgUrl-'+id+'" placeholder="http://... 或 https://..."></td><td><select class="form-select form-select-sm" id="epgScope-'+id+'"><option value="内网EPG">内网EPG</option><option value="外网EPG">外网EPG</option></select></td><td><button class="btn btn-outline-danger btn-sm" id="epgDel-'+id+'">删除</button></td>';
            tbody.appendChild(tr);
            const delBtn = document.getElementById('epgDel-'+id);
            if (delBtn) delBtn.onclick = function() {
                tr.remove();
            };
        };

        const saveBtn = document.getElementById('epgSaveBtn');
        if (saveBtn) saveBtn.onclick = async function() {
            const tbody = document.getElementById('epgTbodyR');
            if (!tbody) return;
            const rows = Array.from(tbody.querySelectorAll('tr'));
            const list = rows.map(tr => {
                const nameEl = tr.querySelector('input[id^="epgName-"]');
                const urlEl = tr.querySelector('input[id^="epgUrl-"]');
                const scopeEl = tr.querySelector('select[id^="epgScope-"]');
                const id = (nameEl && nameEl.id ? nameEl.id.replace('epgName-','') : epg.uuid());
                const name = nameEl ? (nameEl.value || '').trim() : '';
                const url = urlEl ? (urlEl.value || '').trim() : '';
                const scope = scopeEl ? scopeEl.value : '内网EPG';
                return { id, name: name || '未命名EPG', url, scope };
            }).filter(x => x.url && /^https?:\/\//i.test(x.url));
            try {
                await apiJson('/api/config/epg-sources', {
                    method: 'POST',
                    body: { sources: list }
                });
                close();
            } catch(e) {}
        };

        modal.style.display = 'block';
        modal.querySelector('.modal').classList.add('show');
        await fetchList();
    };
})();