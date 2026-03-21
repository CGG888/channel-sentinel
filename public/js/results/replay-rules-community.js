(function () {
    const ns = (window.IptvCore = window.IptvCore || {});
    const results = (ns.results = ns.results || {});
    const community = (results.community = results.community || {});

    // GitHub OAuth 状态
    community.getGithubStatus = async function () {
        return apiJson('/api/auth/github/status');
    };

    // 发起 GitHub OAuth
    community.linkGithub = function () {
        const redirectUri = encodeURIComponent(window.location.origin);
        window.location.href = '/api/auth/github/begin?redirect_uri=' + redirectUri;
    };

    // 解除 GitHub 关联
    community.unlinkGithub = async function () {
        return apiJson('/api/auth/github/disconnect', { method: 'DELETE' });
    };

    // 处理 GitHub OAuth 回调
    community.handleGithubCallback = async function () {
        const params = new URLSearchParams(window.location.search);
        if (params.get('github_callback') === '1') {
            // 清除 URL 中的回调参数
            const cleanUrl = window.location.pathname;
            window.history.replaceState({}, '', cleanUrl);

            // 调用后端回调接口
            const state = params.get('state');
            const j = await apiJson('/api/auth/github/callback?state=' + encodeURIComponent(state || ''));
            if (j && j.success) {
                if (typeof window.showCenterConfirm === 'function') {
                    window.showCenterConfirm('GitHub 账号关联成功！', null, true);
                }
                // 刷新状态
                const statusEl = document.getElementById('communityGithubStatus');
                if (statusEl) {
                    community.renderGithubStatus(statusEl, {
                        onLink: community.linkGithub,
                        onUnlink: community.unlinkGithub
                    });
                }
            } else {
                if (typeof window.showCenterConfirm === 'function') {
                    window.showCenterConfirm('GitHub 账号关联失败: ' + (j && j.message || '未知错误'), null, true);
                }
            }
            return true;
        }
        return false;
    };

    // 检查规则更新
    community.checkUpdate = async function () {
        return apiJson('/api/replay-rules/check-update');
    };

    // 获取规则库
    community.getRulesLibrary = async function () {
        return apiJson('/api/replay-rules/library');
    };

    // 应用远程规则
    community.applyRemoteRules = async function (version) {
        return apiJson('/api/replay-rules/apply-remote', {
            method: 'POST',
            body: { version }
        });
    };

    // 获取规则版本列表
    community.getRuleVersions = async function () {
        return apiJson('/api/replay-rules/versions');
    };

    // 获取我的提交记录
    community.getMyContributions = async function () {
        return apiJson('/api/replay-rules/contributions');
    };

    // 提交规则
    community.submitContribution = async function (body) {
        return apiJson('/api/replay-rules/contributions', {
            method: 'POST',
            body
        });
    };

    // 渲染 GitHub OAuth 状态
    community.renderGithubStatus = function (container, callbacks) {
        const { onLink, onUnlink } = callbacks || {};
        container.innerHTML = '<div class="text-center text-muted"><i class="bi bi-hourglass-split"></i> 加载中...</div>';
        community.getGithubStatus().then(function (j) {
            if (!j || !j.success) {
                container.innerHTML = '<div class="text-danger small">加载失败</div>';
                return;
            }
            const linked = j.linked;
            if (linked) {
                container.innerHTML = '<div class="d-flex align-items-center justify-content-between"><div class="small"><i class="bi bi-github me-1"></i> 已关联 <strong>' + escapeHtml(j.username || '') + '</strong></div><button class="btn btn-outline-danger btn-sm" id="communityGithubUnlink"><i class="bi bi-unlink"></i> 解除</button></div>';
                const unlinkBtn = document.getElementById('communityGithubUnlink');
                if (unlinkBtn) {
                    unlinkBtn.onclick = function () {
                        if (typeof onUnlink === 'function') {
                            onUnlink().then(function () {
                                community.renderGithubStatus(container, callbacks);
                            });
                        }
                    };
                }
            } else {
                container.innerHTML = '<div class="d-flex align-items-center justify-content-between"><div class="small text-muted"><i class="bi bi-github me-1"></i> 未关联 GitHub 账号</div><button class="btn btn-outline-primary btn-sm" id="communityGithubLink"><i class="bi bi-link"></i> 关联</button></div>';
                const linkBtn = document.getElementById('communityGithubLink');
                if (linkBtn) {
                    linkBtn.onclick = function () {
                        if (typeof onLink === 'function') {
                            onLink();
                        }
                    };
                }
            }
        }).catch(function () {
            container.innerHTML = '<div class="text-danger small">加载失败</div>';
        });
    };

    // 渲染规则库
    community.renderRulesLibrary = function (container, options) {
        const { onApply, currentVersion } = options || {};
        container.innerHTML = '<div class="text-center text-muted py-2"><i class="bi bi-hourglass-split"></i> 加载中...</div>';
        community.getRulesLibrary().then(function (j) {
            if (!j || !j.success) {
                container.innerHTML = '<div class="text-danger small">加载失败: ' + escapeHtml(j && j.message || '') + '</div>';
                return;
            }
            const lib = j;
            const latest = lib.latest;
            const versions = Array.isArray(lib.versions) ? lib.versions : [];

            if (versions.length === 0) {
                container.innerHTML = '<div class="text-muted small">暂无规则库信息</div>';
                return;
            }

            let html = '<div class="small fw-bold mb-2">规则版本</div>';
            html += '<div class="list-group list-group-flush small" style="max-height:200px;overflow-y:auto;">';

            versions.slice(0, 10).forEach(function (v) {
                const isLocal = v.isLocal;
                const isLatest = v.version === latest;
                const appliedAt = v.appliedAt ? new Date(v.appliedAt).toLocaleDateString('zh-CN') : '';
                const badge = isLocal ? '<span class="badge bg-success me-1">已应用</span>' : (isLatest ? '<span class="badge bg-primary me-1">最新</span>' : '');
                const changelog = Array.isArray(v.changelog) && v.changelog.length > 0
                    ? '<div class="text-muted small">' + escapeHtml(v.changelog.slice(0, 2).join(', ')) + '</div>'
                    : '';
                const ruleCount = v.total_rules || 0;
                const baseCount = v.base_rules_count || 0;
                const timeCount = v.time_formats_count || 0;
                html += '<div class="list-group-item d-flex justify-content-between align-items-start px-0 py-2">';
                html += '<div class="me-auto">' + badge + '<strong>' + escapeHtml(v.version || '') + '</strong>' + changelog;
                html += '<div class="text-muted small">规则: ' + ruleCount + ' (基础:' + baseCount + ' 时间:' + timeCount + ')</div>';
                if (appliedAt) html += '<div class="text-muted small">应用时间: ' + appliedAt + '</div>';
                html += '</div>';
                if (!isLocal && typeof onApply === 'function') {
                    html += '<button class="btn btn-outline-primary btn-sm community-apply-btn" data-version="' + escapeHtml(v.version || '') + '">应用</button>';
                }
                html += '</div>';
            });

            html += '</div>';
            container.innerHTML = html;

            // 绑定应用按钮
            container.querySelectorAll('.community-apply-btn').forEach(function (btn) {
                btn.onclick = function () {
                    const ver = btn.getAttribute('data-version');
                    if (typeof onApply === 'function') {
                        onApply(ver);
                    }
                };
            });
        }).catch(function () {
            container.innerHTML = '<div class="text-danger small">加载失败</div>';
        });
    };

    // 渲染规则贡献表单
    community.renderContributionForm = function (container, options) {
        const { onSubmit } = options || {};
        container.innerHTML = '<div class="row g-2">' +
            '<div class="col-md-4"><label class="form-label small">省份</label><select class="form-select form-select-sm" id="contribProvince"><option value="">请选择</option></select></div>' +
            '<div class="col-md-4"><label class="form-label small">运营商</label><select class="form-select form-select-sm" id="contribOperator"><option value="">请选择</option></select></div>' +
            '<div class="col-md-4"><label class="form-label small">城市（可选）</label><input type="text" class="form-control form-control-sm" id="contribCity" placeholder="可选"></div>' +
            '<div class="col-12"><label class="form-label small">M3U 行</label><textarea class="form-control form-control-sm" id="contribM3uLine" rows="2" placeholder="请粘贴完整的 M3U URL 行，如: #EXTINF:-1 tvg-name=&quot;频道名&quot; ... http://..."></textarea></div>' +
            '<div class="col-12"><label class="form-label small">说明（可选）</label><textarea class="form-control form-control-sm" id="contribDesc" rows="2" placeholder="可选，说明回放地址的来源或特殊说明"></textarea></div>' +
            '<div class="col-12"><button class="btn btn-primary btn-sm w-100" id="contribSubmitBtn"><i class="bi bi-send me-1"></i>提交规则</button></div>' +
            '<div class="col-12"><div class="small text-muted" id="contribStatus"></div></div>' +
            '</div>';

        // 省份数据（常用省份）
        const provinces = ['北京', '天津', '河北', '山西', '内蒙古', '辽宁', '吉林', '黑龙江', '上海', '江苏', '浙江', '安徽', '福建', '江西', '山东', '河南', '湖北', '湖南', '广东', '广西', '海南', '重庆', '四川', '贵州', '云南', '西藏', '陕西', '甘肃', '青海', '宁夏', '新疆'];
        const provinceSel = document.getElementById('contribProvince');
        provinces.forEach(function (p) {
            var opt = document.createElement('option');
            opt.value = p;
            opt.textContent = p;
            provinceSel.appendChild(opt);
        });

        // 运营商数据
        const operators = ['移动', '联通', '电信', '广电', '其他'];
        const operatorSel = document.getElementById('contribOperator');
        operators.forEach(function (o) {
            var opt = document.createElement('option');
            opt.value = o;
            opt.textContent = o;
            operatorSel.appendChild(opt);
        });

        const submitBtn = document.getElementById('contribSubmitBtn');
        const statusEl = document.getElementById('contribStatus');

        submitBtn.onclick = function () {
            var province = provinceSel.value;
            var operator = operatorSel.value;
            var city = document.getElementById('contribCity').value || '';
            var m3uLine = document.getElementById('contribM3uLine').value || '';
            var desc = document.getElementById('contribDesc').value || '';

            if (!province || !operator || !m3uLine) {
                statusEl.innerHTML = '<span class="text-danger">请填写省份、运营商和 M3U 行</span>';
                return;
            }

            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>提交中...';
            statusEl.innerHTML = '';

            var body = { province, operator, city, m3u_line: m3uLine, description: desc };

            if (typeof onSubmit === 'function') {
                onSubmit(body).then(function (j) {
                    if (j && j.success) {
                        statusEl.innerHTML = '<span class="text-success">提交成功！</span>';
                        document.getElementById('contribM3uLine').value = '';
                        document.getElementById('contribDesc').value = '';
                        document.getElementById('contribCity').value = '';
                    } else {
                        statusEl.innerHTML = '<span class="text-danger">提交失败: ' + escapeHtml(j && j.message || '未知错误') + '</span>';
                    }
                }).catch(function (e) {
                    statusEl.innerHTML = '<span class="text-danger">提交失败: ' + escapeHtml(e && e.message || '') + '</span>';
                }).finally(function () {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = '<i class="bi bi-send me-1"></i>提交规则';
                });
            }
        };
    };

    // 将社区功能附加到回放规则模态框
    community.attachToReplayRulesModal = function (modal) {
        const community = window.IptvCore.results.community;
        if (!community) return;

        const modalBody = modal.querySelector('.modal-body');
        if (!modalBody) return;

        // 检查是否已经添加过
        if (document.getElementById('communityFeaturesSection')) return;

        // 创建社区功能区块
        const section = document.createElement('div');
        section.id = 'communityFeaturesSection';
        section.className = 'mt-3 pt-3 border-top';
        section.innerHTML = '<div class="row g-3">' +
            // GitHub OAuth 状态
            '<div class="col-md-6">' +
            '<div class="card border-0 shadow-sm">' +
            '<div class="card-body">' +
            '<div class="d-flex align-items-center justify-content-between mb-2">' +
            '<div class="fw-bold"><i class="bi bi-github me-1"></i>GitHub 关联</div>' +
            '</div>' +
            '<div id="communityGithubStatus"></div>' +
            '</div>' +
            '</div>' +
            '</div>' +
            // 规则库
            '<div class="col-md-6">' +
            '<div class="card border-0 shadow-sm">' +
            '<div class="card-body">' +
            '<div class="d-flex align-items-center justify-content-between mb-2">' +
            '<div class="fw-bold"><i class="bi bi-cloud-download me-1"></i>规则库</div>' +
            '<button class="btn btn-outline-primary btn-sm" id="communityCheckUpdate"><i class="bi bi-arrow-repeat me-1"></i>检查更新</button>' +
            '</div>' +
            '<div id="communityRulesLibrary"></div>' +
            '</div>' +
            '</div>' +
            '</div>' +
            // 规则贡献
            '<div class="col-12">' +
            '<div class="card border-0 shadow-sm">' +
            '<div class="card-body">' +
            '<div class="fw-bold mb-2"><i class="bi bi-send me-1"></i>规则贡献</div>' +
            '<div id="communityContributionForm"></div>' +
            '</div>' +
            '</div>' +
            '</div>' +
            '</div>';

        modalBody.insertBefore(section, modalBody.firstChild);

        // 渲染 GitHub 状态
        const githubStatusEl = document.getElementById('communityGithubStatus');
        community.renderGithubStatus(githubStatusEl, {
            onLink: function () {
                community.linkGithub();
            },
            onUnlink: function () {
                return community.unlinkGithub();
            }
        });

        // 渲染规则库
        const rulesLibraryEl = document.getElementById('communityRulesLibrary');
        community.renderRulesLibrary(rulesLibraryEl, {
            onApply: function (version) {
                if (typeof window.showCenterConfirm === 'function') {
                    window.showCenterConfirm('确定要应用版本 ' + version + ' 吗？', async function (ok) {
                        if (!ok) return;
                        const j = await community.applyRemoteRules(version);
                        if (j && j.success) {
                            window.showCenterConfirm('规则已应用: ' + version, null, true);
                        } else {
                            window.showCenterConfirm('应用失败: ' + (j && j.message || '未知错误'), null, true);
                        }
                    });
                }
            }
        });

        // 检查更新按钮
        const checkUpdateBtn = document.getElementById('communityCheckUpdate');
        if (checkUpdateBtn) {
            checkUpdateBtn.onclick = function () {
                community.checkUpdate().then(function (j) {
                    if (j && j.hasUpdate) {
                        window.showCenterConfirm('发现新版本: ' + j.latestVersion + '，是否立即应用？', async function (ok) {
                            if (!ok) return;
                            const applyJ = await community.applyRemoteRules(j.latestVersion);
                            if (applyJ && applyJ.success) {
                                window.showCenterConfirm('规则已更新到: ' + j.latestVersion, null, true);
                                community.renderRulesLibrary(rulesLibraryEl, {
                                    onApply: function (ver) {
                                        // reuse logic
                                    }
                                });
                            } else {
                                window.showCenterConfirm('更新失败: ' + (applyJ && applyJ.message || '未知错误'), null, true);
                            }
                        });
                    } else {
                        window.showCenterConfirm('当前已是最新版本', null, true);
                    }
                });
            };
        }

        // 渲染贡献表单
        const contribFormEl = document.getElementById('communityContributionForm');
        community.renderContributionForm(contribFormEl, {
            onSubmit: function (body) {
                return community.submitContribution(body);
            }
        });
    };

    // 辅助函数
    function escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
})();
