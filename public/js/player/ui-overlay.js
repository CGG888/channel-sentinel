(function () {
    const ns = (window.IptvCore = window.IptvCore || {});
    const player = (ns.player = ns.player || {});
    const overlay = (player.uiOverlay = player.uiOverlay || {});

    overlay.create = function (options) {
        const opts = options || {};
        const getUiCompact = typeof opts.getUiCompact === 'function' ? opts.getUiCompact : function () { return false; };
        const getHovering = typeof opts.getHovering === 'function' ? opts.getHovering : function () { return false; };
        const setHovering = typeof opts.setHovering === 'function' ? opts.setHovering : function () {};
        const getLastHideTs = typeof opts.getLastHideTs === 'function' ? opts.getLastHideTs : function () { return 0; };
        const setLastHideTs = typeof opts.setLastHideTs === 'function' ? opts.setLastHideTs : function () {};
        const getUiTimer = typeof opts.getUiTimer === 'function' ? opts.getUiTimer : function () { return null; };
        const setUiTimer = typeof opts.setUiTimer === 'function' ? opts.setUiTimer : function () {};
        const getInfoTimer = typeof opts.getInfoTimer === 'function' ? opts.getInfoTimer : function () { return null; };
        const setInfoTimer = typeof opts.setInfoTimer === 'function' ? opts.setInfoTimer : function () {};
        const channelLayer = opts.channelLayer || null;
        const epgLayer = opts.epgLayer || null;
        const infoOverlay = opts.infoOverlay || null;
        const uiHideMs = Number(opts.uiHideMs || 3000);
        const infoHideMs = Number(opts.infoHideMs || 10000);
        const epgAutoHideMs = Number(opts.epgAutoHideMs || 3000);
        const clearTimer = typeof opts.clearTimer === 'function' ? opts.clearTimer : clearTimeout;
        const setTimer = typeof opts.setTimer === 'function' ? opts.setTimer : setTimeout;

        let isEpgVisible = true; // 初始为显示状态
        let initialEpgHidden = false;

        function showInfo() {
            if (!infoOverlay) return;
            infoOverlay.classList.remove('is-hidden');
            const old = getInfoTimer();
            if (old) clearTimer(old);
            const timer = setTimer(function () {
                if (infoOverlay) infoOverlay.classList.add('is-hidden');
            }, infoHideMs);
            setInfoTimer(timer);
        }

        function showEpg() {
            if (!epgLayer) return;
            epgLayer.classList.remove('hidden');
        }

        function hideEpg() {
            if (!epgLayer) return;
            epgLayer.classList.add('hidden');
        }

        function hideUi() {
            if (getUiCompact()) return;
            if (getHovering()) {
                resetUiTimer();
                return;
            }
            setLastHideTs(Date.now());
        }

        function showUi() {
            if (getUiCompact()) return;
            resetUiTimer();
        }

        function toggleChannelLayer() {
            if (!channelLayer) return;
            if (channelLayer.classList.contains('collapsed')) {
                channelLayer.classList.remove('collapsed');
            } else {
                channelLayer.classList.add('collapsed');
            }
        }

        function resetUiTimer() {
            if (getUiCompact()) return;
            const old = getUiTimer();
            if (old) clearTimer(old);
            const timer = setTimer(hideUi, uiHideMs);
            setUiTimer(timer);
        }

        function onHoverStart() {
            setHovering(true);
            const old = getUiTimer();
            if (old) clearTimer(old);
        }

        function onHoverEnd() {
            setHovering(false);
            resetUiTimer();
        }

        function shouldIgnoreRecentHide() {
            return (Date.now() - getLastHideTs()) < 800;
        }

        // EPG 自动隐藏（3秒后执行一次，仅桌面端）
        function scheduleInitialEpgHide(isMobile) {
            if (initialEpgHidden) return;
            initialEpgHidden = true;
            // 手机端不自动隐藏，抽屉始终显示
            if (isMobile) return;
            setTimer(function () {
                hideEpg();
            }, epgAutoHideMs);
        }

        return {
            showInfo, showEpg, hideEpg, hideUi, showUi, resetUiTimer,
            onHoverStart, onHoverEnd, shouldIgnoreRecentHide,
            scheduleInitialEpgHide
        };
    };
})();
