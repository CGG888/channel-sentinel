(function () {
    const ns = (window.IptvCore = window.IptvCore || {});
    const player = (ns.player = ns.player || {});
    const wiring = (player.uiWiring = player.uiWiring || {});

    function debounce(fn, wait) {
        let timer = null;
        return function () {
            const ctx = this;
            const args = arguments;
            if (timer) clearTimeout(timer);
            timer = setTimeout(function () {
                fn.apply(ctx, args);
            }, wait);
        };
    }

    wiring.create = function (options) {
        const opts = options || {};
        const uiCompact = !!opts.uiCompact;
        const themeToggleBtn = opts.themeToggleBtn || null;
        const channelLayer = opts.channelLayer || null;
        const epgLayer = opts.epgLayer || null;
        const closeBtn = opts.closeBtn || null;
        const epgSel = opts.epgSel || null;
        const epgRefresh = opts.epgRefresh || null;
        const searchInput = opts.searchInput || null;
        const getUiOverlayController = typeof opts.getUiOverlayController === 'function' ? opts.getUiOverlayController : function () { return null; };
        const getLastHideTs = typeof opts.getLastHideTs === 'function' ? opts.getLastHideTs : function () { return 0; };
        const getChannelDark = typeof opts.getChannelDark === 'function' ? opts.getChannelDark : function () { return false; };
        const setChannelDark = typeof opts.setChannelDark === 'function' ? opts.setChannelDark : function () {};
        const applyChannelTheme = typeof opts.applyChannelTheme === 'function' ? opts.applyChannelTheme : function () {};
        const showUi = typeof opts.showUi === 'function' ? opts.showUi : function () {};
        const hideUi = typeof opts.hideUi === 'function' ? opts.hideUi : function () {};
        const showInfo = typeof opts.showInfo === 'function' ? opts.showInfo : function () {};
        const onEpgChange = typeof opts.onEpgChange === 'function' ? opts.onEpgChange : function () {};
        const onEpgRefresh = typeof opts.onEpgRefresh === 'function' ? opts.onEpgRefresh : function () {};
        const onSearchInput = typeof opts.onSearchInput === 'function' ? opts.onSearchInput : function () {};
        const searchDebounceMs = Number(opts.searchDebounceMs || 200);

        function shouldIgnoreRecentHide() {
            const ctrl = getUiOverlayController();
            if (ctrl && typeof ctrl.shouldIgnoreRecentHide === 'function') {
                return !!ctrl.shouldIgnoreRecentHide();
            }
            return (Date.now() - getLastHideTs()) < 800;
        }

        function bindHover(layer) {
            if (!layer) return;
            layer.addEventListener('mouseenter', function () {
                const ctrl = getUiOverlayController();
                if (ctrl && typeof ctrl.onHoverStart === 'function') ctrl.onHoverStart();
            });
            layer.addEventListener('mouseleave', function () {
                const ctrl = getUiOverlayController();
                if (ctrl && typeof ctrl.onHoverEnd === 'function') ctrl.onHoverEnd();
            });
        }

        function bindTheme() {
            if (themeToggleBtn) {
                themeToggleBtn.onclick = function () {
                    setChannelDark(!getChannelDark());
                    if (window.IptvTheme) {
                        window.IptvTheme.applyTheme(getChannelDark() ? 'dark' : 'light');
                    }
                    applyChannelTheme();
                };
            }
            window.addEventListener('iptv-theme-change', function (e) {
                const t = e && e.detail && e.detail.theme ? e.detail.theme : 'light';
                setChannelDark(t === 'dark');
                applyChannelTheme();
            });
        }

        function bindOverlay() {
            bindHover(channelLayer);
            bindHover(epgLayer);
            if (closeBtn && !uiCompact) {
                closeBtn.onclick = function () {
                    hideUi();
                };
            }
            if (!uiCompact) {
                document.addEventListener('mousemove', function () {
                    if (shouldIgnoreRecentHide()) return;
                    showUi();
                });
                document.addEventListener('touchstart', function () {
                    if (shouldIgnoreRecentHide()) return;
                    showUi();
                });
            }
            document.addEventListener('mousemove', function () { showInfo(); });
            document.addEventListener('touchstart', function () { showInfo(); });
        }

        function bindEpg() {
            if (epgSel) {
                epgSel.onchange = function () {
                    onEpgChange();
                };
            }
            if (epgRefresh) {
                epgRefresh.onclick = function () {
                    onEpgRefresh();
                };
            }
        }

        function bindSearch() {
            if (!searchInput) return;
            searchInput.oninput = debounce(function () {
                onSearchInput();
            }, searchDebounceMs);
        }

        function bindAll() {
            bindTheme();
            bindOverlay();
            bindEpg();
            bindSearch();
        }

        return { bindAll: bindAll };
    };
})();
