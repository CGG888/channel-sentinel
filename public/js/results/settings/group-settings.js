(function() {
    const ns = (window.IptvCore = window.IptvCore || {});
    const settings = (ns.settings = ns.settings || {});
    const group = (settings.group = settings.group || {});

    group.getTitles = function() {
        try {
            const raw = JSON.parse(localStorage.getItem('groupTitles') || '[]');
            if (Array.isArray(raw) && raw.length > 0) {
                if (typeof raw[0] === 'string') return raw.map(n => ({ name: n, color: '' }));
                return raw;
            }
            return [];
        } catch(e) {
            return [];
        }
    };

    group.mergePreserveMatchers = function(incoming) {
        const prev = group.getTitles();
        const arr = Array.isArray(incoming) ? incoming : [];
        return arr.map(it => {
            if (typeof it === 'string') {
                const prevObj = prev.find(x => x.name === it);
                const matchers = Array.isArray(prevObj && prevObj.matchers) ? prevObj.matchers : [];
                const color = (prevObj && prevObj.color) ? prevObj.color : '';
                return { name: it, color, matchers };
            }
            const name = it && it.name ? it.name : '';
            const prevObj = prev.find(x => x.name === name);
            const color = (it && it.color) ? it.color : ((prevObj && prevObj.color) ? prevObj.color : '');
            const matchers = Array.isArray(it && it.matchers) ? it.matchers : (Array.isArray(prevObj && prevObj.matchers) ? prevObj.matchers : []);
            return { name, color, matchers };
        }).filter(x => x && x.name);
    };

    group.applyMergedToLocal = function(incoming) {
        const merged = group.mergePreserveMatchers(incoming);
        localStorage.setItem('groupTitles', JSON.stringify(merged));
        if (window.appSettings) window.appSettings.groupTitles = merged;
        return merged;
    };

    group.loadTitlesFromServer = async function() {
        try {
            const j = await apiJson('/api/config/group-titles');
            let serverList = [];
            if (Array.isArray(j && j.titlesObj)) {
                serverList = j.titlesObj;
            } else if (Array.isArray(j && j.titles)) {
                serverList = j.titles;
            }
            const merged = group.applyMergedToLocal(serverList);
            if (merged.length === 0) {
                const fallback = [{ name: '默认', color: '', matchers: [] }];
                localStorage.setItem('groupTitles', JSON.stringify(fallback));
                if (window.appSettings) window.appSettings.groupTitles = fallback;
                return fallback;
            }
            return merged;
        } catch(e) {
            return group.getTitles();
        }
    };

    group.saveTitles = async function(list) {
        const arr = Array.isArray(list) ? list : [];
        localStorage.setItem('groupTitles', JSON.stringify(arr));
        if (window.appSettings) window.appSettings.groupTitles = arr;
        const names = arr.map(x => x && x.name ? x.name : '').filter(Boolean);
        await apiJson('/api/config/group-titles', {
            method: 'POST',
            body: { titles: names, titlesObj: arr }
        });
    };

    group.ensureDefault = function() {
        const list = group.getTitles();
        if (list.length === 0) group.saveTitles([{ name: '默认', color: '' }]);
    };

    group.uuid = function() { return 'grp-' + Math.random().toString(36).slice(2) + Date.now().toString(36); };

    group.textColor = function(hex) {
        const h = String(hex || '').replace('#','');
        if (!/^[0-9a-fA-F]{6}$/.test(h)) return '#fff';
        const r = parseInt(h.substring(0,2),16);
        const g = parseInt(h.substring(2,4),16);
        const b = parseInt(h.substring(4,6),16);
        const yiq = ((r*299)+(g*587)+(b*114))/1000;
        return yiq >= 128 ? '#000' : '#fff';
    };

    group.openModal = async function() {
        let modal = document.getElementById('groupModalR');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'groupModalR';
            modal.innerHTML = '<div class="modal fade" tabindex="-1" style="display:block;background:rgba(0,0,0,0.5);z-index:9999;"><div class="modal-dialog modal-dialog-centered modal-lg"><div class="modal-content border-0 shadow-lg" style="border-radius:12px;"><div class="modal-header border-bottom-0 pb-0"><h5 class="modal-title fw-bold text-dark"><i class="bi bi-collection me-2"></i>分组设置</h5><button type="button" class="btn-close" id="groupCloseR"></button></div><div class="modal-body pt-2 pb-4 px-4"><div class="d-flex flex-wrap align-items-center justify-content-between gap-3 mb-4 bg-light p-3 rounded-3"><div class="text-secondary small d-flex align-items-center"><i class="bi bi-info-circle me-2 fs-5 text-primary"></i><span>分组用于统一导出与编辑中的 group-title</span></div><div class="d-flex flex-wrap align-items-center gap-2"><button class="btn btn-primary btn-sm" id="groupAddBtnR"><i class="bi bi-plus-lg me-1"></i>添加</button><button class="btn btn-success btn-sm" id="groupSaveBtnR"><i class="bi bi-save me-1"></i>保存</button><button class="btn btn-info btn-sm text-white" id="groupApplyMatchBtnR"><i class="bi bi-magic me-1"></i>应用匹配</button></div></div><div id="groupListWrapR"></div></div></div></div></div>';
            document.body.appendChild(modal);
        }
        function close() {
            modal.style.display = 'none';
            modal.querySelector('.modal').classList.remove('show');
        }
        document.getElementById('groupCloseR').onclick = close;

        const listWrap = document.getElementById('groupListWrapR');
        const groupRulesMap = window.groupRulesMap || (window.groupRulesMap = {});
        const streams = window.streams || [];

        function renderList(list) {
            listWrap.innerHTML = '<div class="table-responsive"><table class="table table-sm align-middle"><thead><tr><th>名称</th><th style="width:120px;">颜色</th><th style="width:200px;">操作</th></tr></thead><tbody id="groupTbodyR"></tbody></table></div>';
            const tbody = document.getElementById('groupTbodyR');
            tbody.innerHTML = '';
            list.forEach((item, idx) => {
                const id = 'grp-' + idx;
                const tr = document.createElement('tr');
                const nm = (item && item.name ? item.name : '');
                const clr = (item && item.color ? item.color : '#64748b');
                tr.innerHTML = '<td><div class="d-flex align-items-center" style="gap:8px;"><span class="badge badge-tag" id="groupBadge-'+id+'"></span><input class="form-control form-control-sm" id="groupName-'+id+'" value="'+nm+'" style="flex:1; min-width:160px;"></div></td><td><input type="color" class="form-control form-control-sm" id="groupColor-'+id+'" value="'+clr+'"></td><td><div class="d-flex" style="gap:8px;"><button class="btn btn-outline-primary btn-sm" id="groupRule-'+id+'">规则</button><button class="btn btn-outline-danger btn-sm" id="groupDel-'+id+'">删除</button></div></td>';
                tr.dataset.oldName = (item && item.name ? item.name : '');
                tbody.appendChild(tr);
                const badge = document.getElementById('groupBadge-'+id);
                const nameEl = document.getElementById('groupName-'+id);
                const colorEl = document.getElementById('groupColor-'+id);
                if (badge) {
                    badge.textContent = nm;
                    badge.style.backgroundColor = clr;
                    badge.style.color = group.textColor(clr);
                }
                if (nameEl) nameEl.oninput = function() {
                    if (badge) badge.textContent = (this.value || '').trim();
                };
                if (colorEl) colorEl.oninput = function() {
                    const v = (this.value || '').trim();
                    if (badge) {
                        badge.style.backgroundColor = v;
                        badge.style.color = group.textColor(v);
                    }
                };
                const ruleBtn = document.getElementById('groupRule-'+id);
                if (ruleBtn) ruleBtn.onclick = function() {
                    group.openRuleModal(nm);
                };
                const delBtn = document.getElementById('groupDel-'+id);
                if (delBtn) delBtn.onclick = function() {
                    tr.remove();
                };
                if (item && Array.isArray(item.matchers)) {
                    groupRulesMap[nm] = item.matchers;
                }
            });
        }

        function fetchList() {
            const list = group.getTitles();
            renderList(Array.isArray(list) ? list : []);
        }

        const addBtn = document.getElementById('groupAddBtnR');
        if (addBtn) addBtn.onclick = function() {
            const tbody = document.getElementById('groupTbodyR');
            if (!tbody) return;
            const id = group.uuid();
            const tr = document.createElement('tr');
            tr.innerHTML = '<td><div class="d-flex align-items-center" style="gap:8px;"><span class="badge badge-tag" id="groupBadge-'+id+'"></span><input class="form-control form-control-sm" id="groupName-'+id+'" placeholder="分组名称" style="flex:1; min-width:160px;"></div></td><td><input type="color" class="form-control form-control-sm" id="groupColor-'+id+'" value="#64748b"></td><td><div class="d-flex" style="gap:8px;"><button class="btn btn-outline-primary btn-sm" id="groupRule-'+id+'">规则</button><button class="btn btn-outline-danger btn-sm" id="groupDel-'+id+'">删除</button></div></td>';
            tbody.appendChild(tr);
            const badge = document.getElementById('groupBadge-'+id);
            if (badge) {
                badge.textContent = '';
                badge.style.backgroundColor = '#64748b';
                badge.style.color = group.textColor('#64748b');
            }
            const nameEl = document.getElementById('groupName-'+id);
            const colorEl = document.getElementById('groupColor-'+id);
            if (nameEl) nameEl.oninput = function() {
                if (badge) badge.textContent = (this.value || '').trim();
            };
            if (colorEl) colorEl.oninput = function() {
                const v = (this.value || '').trim();
                if (badge) {
                    badge.style.backgroundColor = v;
                    badge.style.color = group.textColor(v);
                }
            };
            const ruleBtn = document.getElementById('groupRule-'+id);
            if (ruleBtn) ruleBtn.onclick = function() {
                const nmEl = document.getElementById('groupName-'+id);
                const nm = nmEl ? (nmEl.value || '').trim() : '';
                group.openRuleModal(nm || '');
            };
            const delBtn = document.getElementById('groupDel-'+id);
            if (delBtn) delBtn.onclick = function() {
                tr.remove();
            };
        };

        const saveBtn = document.getElementById('groupSaveBtnR');
        if (saveBtn) saveBtn.onclick = async function() {
            const tbody = document.getElementById('groupTbodyR');
            if (!tbody) return;
            const rows = Array.from(tbody.querySelectorAll('tr'));
            const renameMap = {};
            const list = rows.map(tr => {
                const nameEl = tr.querySelector('input[id^="groupName-"]');
                const colorEl = tr.querySelector('input[id^="groupColor-"]');
                const oldName = (tr.dataset && tr.dataset.oldName) ? tr.dataset.oldName : '';
                const name = nameEl ? (nameEl.value||'').trim() : '';
                const color = colorEl ? (colorEl.value||'').trim() : '';
                if (oldName && name && oldName !== name) renameMap[oldName] = name;
                if (!name) return null;
                const matchers = groupRulesMap[oldName] || groupRulesMap[name] || [];
                return { name, color: color || '', matchers: Array.isArray(matchers) ? matchers : [] };
            }).filter(x => x);
            await group.saveTitles(list);
            if (window.saveGroupRulesFromLocal) await window.saveGroupRulesFromLocal();
            if (window.renderTable) window.renderTable();
            const keys = Object.keys(renameMap);
            if (keys.length > 0) {
                keys.forEach(k => {
                    const nn = renameMap[k];
                    if (groupRulesMap[k]) {
                        groupRulesMap[nn] = groupRulesMap[k];
                        delete groupRulesMap[k];
                    }
                });
                if (window.saveGroupRulesFromLocal) await window.saveGroupRulesFromLocal();
                for (const s of streams) {
                    const gt = s.groupTitle || '';
                    const nn = renameMap[gt];
                    if (nn) {
                        const payload = {
                            udpxyUrl: s.udpxyUrl,
                            multicastUrl: s.multicastUrl,
                            update: { groupTitle: nn }
                        };
                        try {
                            await apiJson('/api/stream/update', { method: 'POST', body: payload });
                        } catch(e) {}
                    }
                }
                if (window.fetchStreams) await window.fetchStreams();
            }
            close();
        };

        const applyBtn = document.getElementById('groupApplyMatchBtnR');
        if (applyBtn) applyBtn.onclick = async function() {
            const list = group.getTitles();
            const arr = Array.isArray(list) ? list : [];
            for (const s of streams) {
                let target = '';
                for (const g of arr) {
                    const ms = Array.isArray(g.matchers) ? g.matchers : [];
                    let ok = ms.length > 0;
                    for (const m of ms) {
                        const f = String(m.field || '').toLowerCase();
                        const op = String(m.op || '').toLowerCase();
                        const val = String(m.value || '');
                        let src = '';
                        if (f === 'name') src = String(s.name || '');
                        else if (f === 'tvgname') src = String(s.tvgName || '');
                        else if (f === 'tvgid') src = String(s.tvgId || '');
                        else if (f === 'addr') src = String(s.multicastUrl || '');
                        else if (f === 'codec') src = String(s.codec || '');
                        else if (f === 'resolution') src = String(s.resolution || '');
                        else if (f === 'grouptitle') src = String(s.groupTitle || '');
                        const a = src.toLowerCase();
                        const b = val.toLowerCase();
                        let cond = false;
                        if (op === 'contains') cond = a.includes(b);
                        else if (op === 'not_contains') cond = !a.includes(b);
                        else if (op === 'equals') cond = a === b;
                        else if (op === 'prefix') cond = a.startsWith(b);
                        else if (op === 'suffix') cond = a.endsWith(b);
                        else if (op === 'regex') {
                            try {
                                cond = new RegExp(val, 'i').test(src);
                            } catch(e) {
                                cond = false;
                            }
                        }
                        if (!cond) {
                            ok = false;
                            break;
                        }
                    }
                    if (ok) {
                        target = g.name;
                        break;
                    }
                }
                if (target && s.groupTitle !== target) {
                    const payload = {
                        udpxyUrl: s.udpxyUrl,
                        multicastUrl: s.multicastUrl,
                        update: { groupTitle: target }
                    };
                    try {
                        await apiJson('/api/stream/update', { method: 'POST', body: payload });
                    } catch(e) {}
                }
            }
            if (window.fetchStreams) await window.fetchStreams();
            close();
        };

        modal.style.display = 'block';
        modal.querySelector('.modal').classList.add('show');
        if (window.loadGroupTitles) await window.loadGroupTitles();
        if (window.loadGroupRules) await window.loadGroupRules();
        fetchList();
    };

    group.openRuleModal = function(groupName) {
        let modal = document.getElementById('groupRuleModalR');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'groupRuleModalR';
            modal.innerHTML = '<div class="modal fade" tabindex="-1" style="display:block;background:rgba(0,0,0,0.3);z-index:10000;"><div class="modal-dialog modal-dialog-centered"><div class="modal-content" style="border-radius:14px;"><div class="modal-header"><h5 class="modal-title"><i class="bi bi-sliders me-2"></i>匹配规则</h5><button type="button" class="btn-close" id="groupRuleCloseR"></button></div><div class="modal-body"><div id="groupRuleListWrapR"></div><div class="d-flex justify-content-between mt-2"><button class="btn btn-outline-primary btn-sm" id="groupRuleAddBtnR">添加规则</button><button class="btn btn-outline-success btn-sm" id="groupRuleSaveBtnR">保存</button></div></div><div class="modal-footer justify-content-center"><button class="btn btn-outline-secondary" id="groupRuleCancelR">关闭</button></div></div></div></div>';
            document.body.appendChild(modal);
        }
        const listWrap = document.getElementById('groupRuleListWrapR');
        const groupRulesMap = window.groupRulesMap || (window.groupRulesMap = {});
        const rules = Array.isArray(groupRulesMap[groupName]) ? groupRulesMap[groupName] : [];

        function renderRules(rs) {
            listWrap.innerHTML = '<div class="table-responsive"><table class="table table-sm align-middle"><thead><tr><th style="width:120px;">字段</th><th style="width:120px;">条件</th><th>值</th><th style="width:100px;">操作</th></tr></thead><tbody id="groupRuleTbodyR"></tbody></table></div>';
            const tbody = document.getElementById('groupRuleTbodyR');
            tbody.innerHTML = '';
            rs.forEach((r, i) => {
                const id = 'grm-' + i;
                const tr = document.createElement('tr');
                tr.innerHTML = '<td><select class="form-select form-select-sm" id="ruleField-'+id+'"><option value="name">名称</option><option value="tvgName">tvg-name</option><option value="tvgId">tvg-id</option><option value="addr">地址</option><option value="codec">编码</option><option value="resolution">分辨率</option><option value="groupTitle">分组</option></select></td><td><select class="form-select form-select-sm" id="ruleOp-'+id+'"><option value="contains">包含</option><option value="not_contains">不包含</option><option value="equals">等于</option><option value="prefix">前缀</option><option value="suffix">后缀</option><option value="regex">正则</option></select></td><td><input class="form-control form-control-sm" id="ruleVal-'+id+'" value="'+(r.value||'')+'"></td><td><button class="btn btn-outline-danger btn-sm" id="ruleDel-'+id+'">删除</button></td>';
                tbody.appendChild(tr);
                const f = document.getElementById('ruleField-'+id);
                const o = document.getElementById('ruleOp-'+id);
                if (f) f.value = r.field || 'name';
                if (o) o.value = r.op || 'contains';
                const del = document.getElementById('ruleDel-'+id);
                if (del) del.onclick = function() {
                    tr.remove();
                };
            });
        }

        renderRules(rules);

        function close() {
            modal.style.display = 'none';
            modal.querySelector('.modal').classList.remove('show');
        }
        document.getElementById('groupRuleCloseR').onclick = close;
        document.getElementById('groupRuleCancelR').onclick = close;

        const addBtn = document.getElementById('groupRuleAddBtnR');
        if (addBtn) addBtn.onclick = function() {
            const tbody = document.getElementById('groupRuleTbodyR');
            if (!tbody) return;
            const id = 'grm-' + Date.now();
            const tr = document.createElement('tr');
            tr.innerHTML = '<td><select class="form-select form-select-sm" id="ruleField-'+id+'"><option value="name">名称</option><option value="tvgName">tvg-name</option><option value="tvgId">tvg-id</option><option value="addr">地址</option><option value="codec">编码</option><option value="resolution">分辨率</option><option value="groupTitle">分组</option></select></td><td><select class="form-select form-select-sm" id="ruleOp-'+id+'"><option value="contains" selected>包含</option><option value="not_contains">不包含</option><option value="equals">等于</option><option value="prefix">前缀</option><option value="suffix">后缀</option><option value="regex">正则</option></select></td><td><input class="form-control form-control-sm" id="ruleVal-'+id+'" placeholder="匹配值"></td><td><button class="btn btn-outline-danger btn-sm" id="ruleDel-'+id+'">删除</button></td>';
            tbody.appendChild(tr);
            const delBtn = document.getElementById('ruleDel-'+id);
            if (delBtn) delBtn.onclick = function() {
                tr.remove();
            };
        };

        const saveBtn = document.getElementById('groupRuleSaveBtnR');
        if (saveBtn) saveBtn.onclick = function() {
            const rows = Array.from(document.querySelectorAll('#groupRuleTbodyR tr'));
            const rs = rows.map(tr => {
                const f = tr.querySelector('select[id^="ruleField-"]');
                const o = tr.querySelector('select[id^="ruleOp-"]');
                const v = tr.querySelector('input[id^="ruleVal-"]');
                const field = f ? f.value : 'name';
                const op = o ? o.value : 'contains';
                const value = v ? (v.value || '').trim() : '';
                if (!value) return null;
                return { field, op, value };
            }).filter(x => x);
            groupRulesMap[groupName] = rs;
            try {
                const list = group.getTitles();
                const arr = Array.isArray(list) ? list.map(g => (g && g.name) === groupName ? {
                    name: g.name,
                    color: g.color || '',
                    matchers: rs
                } : g) : [];
                localStorage.setItem('groupTitles', JSON.stringify(arr));
            } catch(e) {}
            close();
        };

        modal.style.display = 'block';
        modal.querySelector('.modal').classList.add('show');
    };
})();
