(function () {
    const ns = (window.IptvCore = window.IptvCore || {});
    const player = (ns.player = ns.player || {});
    const core = (player.coreController = player.coreController || {});

    core.handlePlayAttempt = function (playResult, options) {
        const opts = options || {};
        if (!playResult || typeof playResult.catch !== 'function') return;
        playResult.catch(function (e) {
            const msg = String(e || '');
            if (msg.indexOf('NotAllowedError') !== -1) {
                if (typeof opts.onBlocked === 'function') opts.onBlocked();
                return;
            }
            if (typeof opts.onError === 'function') opts.onError(e);
        });
    };

    core.bindOneShotUserPlay = function (handler) {
        document.addEventListener('click', function () {
            if (typeof handler === 'function') handler();
        }, { once: true });
    };
})();
