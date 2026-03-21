(function() {
    const ns = (window.IptvCore = window.IptvCore || {});
    const settings = (ns.settings = ns.settings || {});
    const cdn = (settings.cdn = settings.cdn || {});

    // 获取 CDN 列表
    cdn.fetchList = async function() {
        try {
            return await apiJson('/api/cdn/list');
        } catch(e) {
            return null;
        }
    };

    // 重新检测 CDN
    cdn.testCdns = async function() {
        try {
            return await apiJson('/api/cdn/test', { method: 'POST' });
        } catch(e) {
            return null;
        }
    };

    // 添加自定义 CDN
    cdn.addCustom = async function(url) {
        try {
            return await apiJson('/api/cdn/custom', {
                method: 'POST',
                body: { url }
            });
        } catch(e) {
            return { success: false, message: '添加失败' };
        }
    };

    // 删除自定义 CDN
    cdn.removeCustom = async function(url) {
        try {
            return await apiJson('/api/cdn/custom', {
                method: 'DELETE',
                body: { url }
            });
        } catch(e) {
            return { success: false, message: '删除失败' };
        }
    };

    // 更新 CDN 设置
    cdn.updateSettings = async function(settings) {
        try {
            return await apiJson('/api/cdn/settings', {
                method: 'PUT',
                body: settings
            });
        } catch(e) {
            return { success: false };
        }
    };

    // 渲染 CDN 列表到指定容器
    cdn.renderToContainer = async function(containerEl) {
        if (!containerEl) return;

        const data = await cdn.fetchList();
        if (!data || !data.success || !data.cdn) {
            containerEl.innerHTML = '<div class="text-muted">加载 CDN 配置失败</div>';
            return;
        }

        const cdnData = data.cdn;
        const builtInCdns = cdnData.builtInCdns || [];
        const customCdns = cdnData.customCdns || [];
        const rankedList = cdnData.rankedList || [];

        containerEl.innerHTML = `
            <div class="cdn-settings-panel">
                <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
                    <div class="form-check form-switch">
                        <input class="form-check-input" type="checkbox" id="cdnEnabledR" ${cdnData.enabled ? 'checked' : ''}>
                        <label class="form-check-label" for="cdnEnabledR">启用 CDN 加速</label>
                    </div>
                    <button class="btn btn-outline-primary btn-sm" id="cdnTestBtnR">
                        <i class="bi bi-activity me-1"></i>检测延迟
                    </button>
                </div>

                <div class="form-check form-switch mb-3">
                    <input class="form-check-input" type="checkbox" id="cdnAutoSelectR" ${cdnData.autoSelect ? 'checked' : ''}>
                    <label class="form-check-label" for="cdnAutoSelectR">自动选择最快 CDN</label>
                </div>

                <div class="mb-3">
                    <label class="form-label small fw-bold">内置 CDN</label>
                    <div class="cdn-list-group" id="cdnBuiltInListR">
                        ${builtInCdns.map((c, i) => `
                            <div class="cdn-item ${c.url === cdnData.selected ? 'selected' : ''}" data-url="${c.url}">
                                <div class="d-flex align-items-center justify-content-between">
                                    <div class="form-check">
                                        <input class="form-check-input" type="radio" name="cdnSelect" value="${c.url}"
                                            id="cdnBuiltin${i}" ${c.url === cdnData.selected ? 'checked' : ''}
                                            ${cdnData.autoSelect ? 'disabled' : ''}>
                                        <label class="form-check-label" for="cdnBuiltin${i}">
                                            ${c.name}
                                        </label>
                                    </div>
                                    <div class="cdn-status">
                                        ${c.available
                                            ? `<span class="badge bg-success">${c.latency}ms</span>`
                                            : `<span class="badge bg-secondary">不可用</span>`
                                        }
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <div class="mb-3">
                    <label class="form-label small fw-bold">自定义 CDN</label>
                    <div class="input-group input-group-sm mb-2">
                        <input class="form-control" id="cdnCustomUrlR" placeholder="输入 CDN 地址，如 https://your-cdn.com/">
                        <button class="btn btn-outline-success" id="cdnAddCustomBtnR">
                            <i class="bi bi-plus-lg"></i>添加
                        </button>
                    </div>
                    <div class="cdn-list-group" id="cdnCustomListR">
                        ${customCdns.length === 0
                            ? '<div class="small text-muted">暂无自定义 CDN</div>'
                            : customCdns.map((c, i) => `
                                <div class="cdn-item custom ${c.url === cdnData.selected ? 'selected' : ''}" data-url="${c.url}">
                                    <div class="d-flex align-items-center justify-content-between">
                                        <div class="form-check">
                                            <input class="form-check-input" type="radio" name="cdnSelect" value="${c.url}"
                                                id="cdnCustom${i}" ${c.url === cdnData.selected ? 'checked' : ''}
                                                ${cdnData.autoSelect ? 'disabled' : ''}>
                                            <label class="form-check-label" for="cdnCustom${i}">
                                                ${c.url}
                                            </label>
                                        </div>
                                        <div class="d-flex align-items-center gap-2">
                                            ${c.available
                                                ? `<span class="badge bg-success">${c.latency}ms</span>`
                                                : `<span class="badge bg-secondary">不可用</span>`
                                            }
                                            <button class="btn btn-outline-danger btn-sm cdn-remove-btn" data-url="${c.url}">
                                                <i class="bi bi-trash"></i>
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            `).join('')
                        }
                    </div>
                </div>

                <div class="mb-3">
                    <label class="form-label small fw-bold">CDN 用途说明</label>
                    <div class="small text-muted">
                        <p class="mb-1"><i class="bi bi-check-circle text-success me-1"></i>GitHub API 调用（评论 Issue、获取用户信息）</p>
                        <p class="mb-1"><i class="bi bi-check-circle text-success me-1"></i>规则文件获取（raw.githubusercontent.com）</p>
                        <p class="mb-0"><i class="bi bi-x-circle text-danger me-1"></i>GitHub OAuth 授权/回调（需直连）</p>
                    </div>
                </div>

                <div class="current-selection mb-3 p-2 bg-light rounded">
                    <div class="small text-muted">当前使用:</div>
                    <div class="fw-bold">${cdnData.selected || '未选择'}</div>
                </div>
            </div>
        `;

        // 绑定事件
        const enabledEl = document.getElementById('cdnEnabledR');
        const autoSelectEl = document.getElementById('cdnAutoSelectR');
        const testBtn = document.getElementById('cdnTestBtnR');
        const addCustomBtn = document.getElementById('cdnAddCustomBtnR');
        const customUrlInput = document.getElementById('cdnCustomUrlR');
        const customList = document.getElementById('cdnCustomListR');

        // 启用/禁用切换
        if (enabledEl) {
            enabledEl.onchange = async function() {
                await cdn.updateSettings({ enabled: this.checked });
                await cdn.renderToContainer(containerEl);
            };
        }

        // 自动选择切换
        if (autoSelectEl) {
            autoSelectEl.onchange = async function() {
                await cdn.updateSettings({ autoSelect: this.checked });
                await cdn.renderToContainer(containerEl);
            };
        }

        // 检测延迟按钮
        if (testBtn) {
            testBtn.onclick = async function() {
                testBtn.disabled = true;
                testBtn.innerHTML = '<i class="bi bi-hourglass me-1"></i>检测中...';
                const result = await cdn.testCdns();
                testBtn.disabled = false;
                testBtn.innerHTML = '<i class="bi bi-activity me-1"></i>检测延迟';
                if (result && result.success) {
                    await cdn.renderToContainer(containerEl);
                }
            };
        }

        // 添加自定义 CDN
        if (addCustomBtn && customUrlInput) {
            addCustomBtn.onclick = async function() {
                const url = customUrlInput.value.trim();
                if (!url) return;

                const result = await cdn.addCustom(url);
                customUrlInput.value = '';

                if (result.success) {
                    await cdn.renderToContainer(containerEl);
                } else {
                    if (window.showCenterConfirm) {
                        window.showCenterConfirm(result.message || '添加失败', null, true);
                    }
                }
            };

            customUrlInput.onkeypress = function(e) {
                if (e.key === 'Enter') {
                    addCustomBtn.click();
                }
            };
        }

        // 删除自定义 CDN
        if (customList) {
            customList.querySelectorAll('.cdn-remove-btn').forEach(function(btn) {
                btn.onclick = async function() {
                    const url = this.getAttribute('data-url');
                    if (!url) return;

                    const result = await cdn.removeCustom(url);
                    if (result.success) {
                        await cdn.renderToContainer(containerEl);
                    }
                };
            });
        }

        // 选择 CDN
        containerEl.querySelectorAll('input[name="cdnSelect"]').forEach(function(radio) {
            radio.onchange = async function() {
                if (cdnData.autoSelect) return;
                const result = await cdn.updateSettings({ selected: this.value });
                if (result.success) {
                    await cdn.renderToContainer(containerEl);
                }
            };
        });
    };
})();
