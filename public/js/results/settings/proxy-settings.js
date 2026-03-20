(function() {
    const ns = (window.IptvCore = window.IptvCore || {});
    const settings = (ns.settings = ns.settings || {});
    const proxy = (settings.proxy = settings.proxy || {});

    proxy.uuid = function() {
        return 'prox-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
    };

    proxy.getList = function() {
        let list = [];
        try {
            const raw = JSON.parse(localStorage.getItem('proxyList') || '[]');
            list = Array.isArray(raw) ? raw : [];
        } catch(e) {
            list = [];
        }
        if (list.length === 0 && Array.isArray(window.appSettings && window.appSettings.proxyList)) {
            list = window.appSettings.proxyList;
        }
        return Array.isArray(list) ? list : [];
    };

    proxy.getByType = function(type) {
        const list = proxy.getList();
        return list.find(x => x && x.type === type) || null;
    };

    proxy.getNormalizedUrlByType = function(type) {
        const item = proxy.getByType(type);
        let url = item && item.url ? String(item.url).trim() : '';
        if (url && !/^https?:\/\//i.test(url)) {
            url = 'http://' + url.replace(/^\/+/, '');
        }
        return url;
    };

    proxy.openModal = function() {
        let modal = document.getElementById('proxyModalR');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'proxyModalR';
            modal.innerHTML = '<div class="modal fade" tabindex="-1" style="display:block;background:rgba(0,0,0,0.5);z-index:9999;"><div class="modal-dialog modal-dialog-centered modal-lg"><div class="modal-content border-0 shadow-lg" style="border-radius:12px;"><div class="modal-header border-bottom-0 pb-0"><h5 class="modal-title fw-bold text-dark"><i class="bi bi-diagram-3 me-2"></i>代理设置</h5><button type="button" class="btn-close" id="proxyCloseR"></button></div><div class="modal-body pt-2 pb-4 px-4"><div class="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-4 bg-light p-3 rounded-3"><div class="text-secondary small d-flex align-items-center"><i class="bi bi-info-circle me-2 fs-5 text-primary"></i><span>类型说明：代理设置主要用于组播单播能够在外网使用，组播代理和单播代理各设置一个地址即可，组播代理用于访问组播地址（rtp/udp）（一般使用端口映射或者lucky等工具实现）；单播代理用于访问单播地址（http/https）或者组播地址。组播单播代理推荐：<a href="https://github.com/qist/tvgate" target="_blank">TVGate</a></span></div><div class="d-flex flex-wrap align-items-center gap-2"><button class="btn btn-primary btn-sm" id="proxyAddBtnR"><i class="bi bi-plus-lg me-1"></i>添加</button><button class="btn btn-success btn-sm" id="proxySaveBtnR"><i class="bi bi-save me-1"></i>保存</button></div></div><div id="proxyListWrapR"></div></div></div></div></div>';
            document.body.appendChild(modal);
        }
        function close() {
            modal.style.display = 'none';
            modal.querySelector('.modal').classList.remove('show');
        }
        document.getElementById('proxyCloseR').onclick = close;

        const listWrap = document.getElementById('proxyListWrapR');

        function renderList(list) {
            listWrap.innerHTML = '<div class="table-responsive"><table class="table table-sm align-middle"><thead><tr><th style="width:140px;">类型</th><th>地址</th><th style="width:120px;">操作</th></tr></thead><tbody id="proxyTbodyR"></tbody></table></div>';
            const tbody = document.getElementById('proxyTbodyR');
            tbody.innerHTML = '';
            (Array.isArray(list) ? list : []).forEach(item => {
                const id = item && item.id ? item.id : proxy.uuid();
                const tr = document.createElement('tr');
                tr.innerHTML = '<td><select class="form-select form-select-sm" id="proxyType-'+id+'"><option value="组播代理">组播代理</option><option value="单播代理">单播代理</option></select></td><td><input class="form-control form-control-sm" id="proxyUrl-'+id+'" value="'+(item && item.url ? item.url : '')+'" placeholder="http(s)://域名或IP:端口"></td><td><button class="btn btn-outline-danger btn-sm" id="proxyDel-'+id+'">删除</button></td>';
                tbody.appendChild(tr);
                const typeSel = document.getElementById('proxyType-'+id);
                if (typeSel) typeSel.value = (item && item.type === '单播代理') ? '单播代理' : '组播代理';
                const delBtn = document.getElementById('proxyDel-'+id);
                if (delBtn) delBtn.onclick = function() {
                    tr.remove();
                };
            });
        }

        async function fetchList() {
            let arr = [];
            try {
                arr = JSON.parse(localStorage.getItem('proxyList') || '[]');
                if (!Array.isArray(arr) || arr.length === 0) arr = Array.isArray(window.appSettings && window.appSettings.proxyList) ? window.appSettings.proxyList : [];
            } catch(e) {}
            if (!Array.isArray(arr) || arr.length === 0) {
                try {
                    const j = await apiJson('/api/config/proxies');
                    if (j && j.success && Array.isArray(j.list)) arr = j.list;
                } catch(e) {}
            }
            renderList(Array.isArray(arr) ? arr : []);
        }

        const addBtn = document.getElementById('proxyAddBtnR');
        if (addBtn) addBtn.onclick = function() {
            const tbody = document.getElementById('proxyTbodyR');
            if (!tbody) return;
            const id = proxy.uuid();
            const tr = document.createElement('tr');
            tr.innerHTML = '<td><select class="form-select form-select-sm" id="proxyType-'+id+'"><option value="组播代理" selected>组播代理</option><option value="单播代理">单播代理</option></select></td><td><input class="form-control form-control-sm" id="proxyUrl-'+id+'" placeholder="http(s)://域名或IP:端口"></td><td><button class="btn btn-outline-danger btn-sm" id="proxyDel-'+id+'">删除</button></td>';
            tbody.appendChild(tr);
            const delBtn = document.getElementById('proxyDel-'+id);
            if (delBtn) delBtn.onclick = function() {
                tr.remove();
            };
        };

        const saveBtn = document.getElementById('proxySaveBtnR');
        if (saveBtn) saveBtn.onclick = async function() {
            const tbody = document.getElementById('proxyTbodyR');
            if (!tbody) return;
            const rows = Array.from(tbody.querySelectorAll('tr'));
            const list = rows.map(tr => {
                const typeEl = tr.querySelector('select[id^="proxyType-"]');
                const urlEl = tr.querySelector('input[id^="proxyUrl-"]');
                const type = typeEl ? typeEl.value : '组播代理';
                const url = urlEl ? (urlEl.value||'').trim() : '';
                if (!url) return null;
                return { type, url };
            }).filter(x => x);
            localStorage.setItem('proxyList', JSON.stringify(list));
            if (window.appSettings) window.appSettings.proxyList = list;
            try {
                await apiJson('/api/settings/update', {
                    method: 'POST',
                    body: { proxyList: list }
                });
            } catch(e) {}
            close();
        };

        modal.style.display = 'block';
        modal.querySelector('.modal').classList.add('show');
        fetchList();
    };
})();
