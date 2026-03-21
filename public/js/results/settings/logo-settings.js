(function() {
    const ns = (window.IptvCore = window.IptvCore || {});
    const settings = (ns.settings = ns.settings || {});
    const logo = (settings.logo = settings.logo || {});

    const LOGO_TPLS_KEY = 'logoTemplates';
    const LOGO_CURR_KEY = 'logoTemplateCurrentId';

    logo.getTpls = function() {
        try {
            const raw = localStorage.getItem(LOGO_TPLS_KEY);
            const list = raw ? JSON.parse(raw) : [];
            return Array.isArray(list) ? list : [];
        } catch(e) {
            return [];
        }
    };

    logo.saveTpls = function(list) {
        localStorage.setItem(LOGO_TPLS_KEY, JSON.stringify(Array.isArray(list) ? list : []));
    };

    logo.getCurrentId = function() {
        return localStorage.getItem(LOGO_CURR_KEY) || '';
    };

    logo.setCurrentId = function(id) {
        localStorage.setItem(LOGO_CURR_KEY, id || '');
    };

    logo.getTemplate = function() {
        const id = logo.getCurrentId();
        const list = logo.getTpls();
        const useExternal = (localStorage.getItem('useExternal') === 'true') ||
            (typeof window.appSettings !== 'undefined' && !!window.appSettings.useExternal);
        if (useExternal) {
            const ext = list.find(x => x.category === '外网台标');
            if (ext && ext.url) return ext.url;
        } else {
            const int = list.find(x => x.category === '内网台标');
            if (int && int.url) return int.url;
        }
        const item = list.find(x => x.id === id);
        if (item && item.url) return item.url;
        return localStorage.getItem('logoTemplate') || '';
    };

    logo.saveTemplate = async function(tpl) {
        localStorage.setItem('logoTemplate', tpl);
        if (window.appSettings) window.appSettings.logoTemplate = tpl;
        await apiJson('/api/settings/update', {
            method: 'POST',
            body: { logoTemplate: tpl }
        });
    };

    logo.loadTemplates = async function() {
        try {
            const j = await apiJson('/api/config/logo-templates');
            const sel = document.getElementById('logoTplSelect');
            const nameInput = document.getElementById('logoTplNameInput');
            const addrInput = document.getElementById('logoTplAddrInput');
            const serverList = Array.isArray(j.templatesObj) ? j.templatesObj :
                (Array.isArray(j.templates) ? j.templates : []);
            const merged = [];
            serverList.forEach((t) => {
                const url = (typeof t === 'string') ? t : (t && t.url) ? t.url : '';
                if (!url) return;
                const nm = (typeof t === 'object' && t && t.name) ? t.name :
                    (url.replace(/^https?:\/\//,'').split('/')[0] || '未命名模板');
                const id = (typeof t === 'object' && t && t.id) ? t.id :
                    ('ltpl-' + Math.random().toString(36).slice(2) + Date.now().toString(36));
                const category = (typeof t === 'object' && t && t.category) ? t.category : '内网台标';
                merged.push({ id, name: nm, url, category });
            });
            if (merged.length === 0) {
                logo.saveTpls([]);
                logo.setCurrentId('');
                localStorage.setItem('logoTemplate', '');
                if (sel) sel.innerHTML = '';
                if (nameInput) nameInput.value = '';
                if (addrInput) addrInput.value = '';
                return;
            }
            logo.saveTpls(merged);
            if (sel) {
                sel.innerHTML = '';
                merged.forEach(t => {
                    const opt = document.createElement('option');
                    opt.value = t.id;
                    opt.text = t.name + ' (' + t.url + ')';
                    sel.appendChild(opt);
                });
                const currId = j.currentId || logo.getCurrentId();
                const currItem = merged.find(x => x.id === currId) ||
                    merged.find(x => x.url === (j.current || logo.getTemplate())) ||
                    merged[0];
                if (currItem) {
                    sel.value = currItem.id;
                    logo.setCurrentId(currItem.id);
                    localStorage.setItem('logoTemplate', currItem.url);
                }
            }
        } catch(e) {}
    };

    logo.setTemplate = async function(curr, list) {
        localStorage.setItem('logoTemplate', curr);
        if (window.appSettings) window.appSettings.logoTemplate = curr;
        const objs = logo.getTpls();
        const currId = logo.getCurrentId();
        await apiJson('/api/config/logo-templates', {
            method: 'POST',
            body: { templates: list, current: curr, templatesObj: objs, currentId: currId }
        });
    };

    logo.nameVariants = function(name) {
        const n = (name || '').trim();
        const plain = n.replace(/\s+/g, '');
        const base = [n, plain];
        const extras = ['4K', '高清', 'HD'];
        const vars = [];
        base.forEach(b => {
            vars.push(b);
            extras.forEach(ex => vars.push(b + ex));
        });
        return [...new Set(vars)];
    };

    logo.buildCandidates = function(name) {
        const tpl = logo.getTemplate();
        const names = logo.nameVariants(name);
        const exts = ['.png', '.jpg', '.jpeg'];
        const urls = [];
        names.forEach(nn => {
            exts.forEach(ext => {
                let u = tpl.replace('{name}', nn);
                u = u.replace(/\.(png|jpg|jpeg)$/i, ext);
                urls.push(u);
            });
        });
        return [...new Set(urls)];
    };

    logo.chooseCandidate = function(name, resolution) {
        const cands = logo.buildCandidates(name);
        if ((resolution || '').toLowerCase() === '3840x2160') {
            const i = cands.findIndex(u => /4k/i.test(u));
            if (i >= 0) return cands[i];
        }
        return cands[0] || '';
    };

    logo.openModal = function() {
        let modal = document.getElementById('logoTplModalR');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'logoTplModalR';
            modal.innerHTML = '<div class="modal fade" tabindex="-1" style="display:block;background:rgba(0,0,0,0.5);z-index:9999;"><div class="modal-dialog modal-dialog-centered modal-lg"><div class="modal-content border-0 shadow-lg" style="border-radius:12px;"><div class="modal-header border-bottom-0 pb-0"><h5 class="modal-title fw-bold text-dark"><i class="bi bi-card-image me-2"></i>台标设置</h5><button type="button" class="btn-close" id="logoTplCloseR"></button></div><div class="modal-body pt-2 pb-4 px-4"><div class="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-4 bg-light p-3 rounded-3"><div class="text-secondary small d-flex align-items-center"><i class="bi bi-info-circle me-2 fs-5 text-primary"></i><span>用于批量匹配台标，{name} 将替换为频道名，格式：http(s)://xxx.com/{name}.png</span></div><div class="d-flex flex-wrap align-items-center gap-2"><button class="btn btn-primary btn-sm" id="logoTplAddBtnR"><i class="bi bi-plus-lg me-1"></i>添加</button><button class="btn btn-success btn-sm" id="logoTplSaveBtnR"><i class="bi bi-save me-1"></i>保存</button><button class="btn btn-info btn-sm text-white" id="syncLogoTplBtn"><i class="bi bi-arrow-repeat me-1"></i>同步台标</button></div></div><div id="logoTplListWrapR"></div></div></div></div></div>';
            document.body.appendChild(modal);
        }
        function close() {
            modal.style.display = 'none';
            modal.querySelector('.modal').classList.remove('show');
        }
        document.getElementById('logoTplCloseR').onclick = close;

        const listWrap = document.getElementById('logoTplListWrapR');

        function uuid() {
            return 'ltpl-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
        }

        function renderList(list) {
            listWrap.innerHTML = '<div class="table-responsive"><table class="table table-sm align-middle"><thead><tr><th style="width:160px;">名称</th><th>地址</th><th style="width:120px;">分类</th><th style="width:100px;">操作</th></tr></thead><tbody id="logoTplTbodyR"></tbody></table></div>';
            const tbody = document.getElementById('logoTplTbodyR');
            tbody.innerHTML = '';
            list.forEach(item => {
                const tr = document.createElement('tr');
                tr.innerHTML = '<td><input class="form-control form-control-sm" id="logoTplName-'+item.id+'" value="'+(item.name||'')+'"></td><td><input class="form-control form-control-sm" id="logoTplAddr-'+item.id+'" value="'+(item.url||'')+'"></td><td><select class="form-select form-select-sm" id="logoTplCat-'+item.id+'"><option value="内网台标">内网台标</option><option value="外网台标">外网台标</option><option value="自定义">自定义</option></select></td><td><button class="btn btn-outline-danger btn-sm" id="logoTplDel-'+item.id+'">删除</button></td>';
                tbody.appendChild(tr);
                const catSel = document.getElementById('logoTplCat-'+item.id);
                if (catSel) catSel.value = item.category || '内网台标';
                const delBtn = document.getElementById('logoTplDel-'+item.id);
                if (delBtn) delBtn.onclick = function() {
                    tr.remove();
                };
            });
        }

        function fetchList() {
            const list = logo.getTpls();
            renderList(Array.isArray(list) ? list : []);
        }

        const addBtn = document.getElementById('logoTplAddBtnR');
        if (addBtn) addBtn.onclick = function() {
            const tbody = document.getElementById('logoTplTbodyR');
            if (!tbody) return;
            const id = uuid();
            const tr = document.createElement('tr');
            tr.innerHTML = '<td><input class="form-control form-control-sm" id="logoTplName-'+id+'" placeholder="名称"></td><td><input class="form-control form-control-sm" id="logoTplAddr-'+id+'" placeholder="http(s)://xxx.com/{name}.png"></td><td><select class="form-select form-select-sm" id="logoTplCat-'+id+'"><option value="内网台标">内网台标</option><option value="外网台标">外网台标</option><option value="自定义">自定义</option></select></td><td><button class="btn btn-outline-danger btn-sm" id="logoTplDel-'+id+'">删除</button></td>';
            tbody.appendChild(tr);
            const delBtn = document.getElementById('logoTplDel-'+id);
            if (delBtn) delBtn.onclick = function() {
                tr.remove();
            };
        };

        const saveBtn = document.getElementById('logoTplSaveBtnR');
        if (saveBtn) saveBtn.onclick = async function() {
            const tbody = document.getElementById('logoTplTbodyR');
            if (!tbody) return;
            const rows = Array.from(tbody.querySelectorAll('tr'));
            const list = rows.map(tr => {
                const nameEl = tr.querySelector('input[id^="logoTplName-"]');
                const addrEl = tr.querySelector('input[id^="logoTplAddr-"]');
                const catEl = tr.querySelector('select[id^="logoTplCat-"]');
                const id = (nameEl && nameEl.id) ? nameEl.id.replace('logoTplName-','') : uuid();
                const name = nameEl ? (nameEl.value||'').trim() : '';
                const url = addrEl ? (addrEl.value||'').trim() : '';
                const category = catEl ? (catEl.value||'内网台标') : '内网台标';
                return { id, name: name || '未命名模板', url, category };
            }).filter(x => x.url);
            logo.saveTpls(list);
            const curr = logo.getCurrentId();
            const currItem = list.find(x => x.id === curr) || list[0];
            if (currItem) {
                logo.setCurrentId(currItem.id);
                localStorage.setItem('logoTemplate', currItem.url);
            }
            close();
        };

        const syncBtn = document.getElementById('syncLogoTplBtn');
        if (syncBtn) syncBtn.onclick = async function() {
            try {
                await apiJson('/api/config/logo-templates');
                if (window.showCenterConfirm) {
                    window.showCenterConfirm('台标模板已同步', null, true);
                }
            } catch(e) {}
        };

        modal.style.display = 'block';
        modal.querySelector('.modal').classList.add('show');
        fetchList();
    };
})();