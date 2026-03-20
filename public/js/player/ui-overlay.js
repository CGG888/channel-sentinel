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
        const clearTimer = typeof opts.clearTimer === 'function' ? opts.clearTimer : clearTimeout;
        const setTimer = typeof opts.setTimer === 'function' ? opts.setTimer : setTimeout;

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

        function hideUi() {
            if (getUiCompact()) return;
            if (getHovering()) {
                resetUiTimer();
                return;
            }
            if (channelLayer) channelLayer.classList.add('collapsed');
            if (epgLayer) epgLayer.classList.add('hidden');
            setLastHideTs(Date.now());
        }

        function showUi() {
            if (getUiCompact()) return;
            if (channelLayer) channelLayer.classList.remove('collapsed');
            if (epgLayer) epgLayer.classList.remove('hidden');
            resetUiTimer();
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

        return { showInfo, hideUi, showUi, resetUiTimer, onHoverStart, onHoverEnd, shouldIgnoreRecentHide };
    };
})();
