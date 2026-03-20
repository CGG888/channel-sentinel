(function () {
    const ns = (window.IptvCore = window.IptvCore || {});
    const player = (ns.player = ns.player || {});
    const retry = (player.retryController = player.retryController || {});

    retry.create = function (options) {
        const opts = options || {};
        const state = opts.state || { n: 0, t: null, seq: 0 };
        const maxRetries = Number(opts.maxRetries || 5);
        const getSeq = typeof opts.getSeq === 'function' ? opts.getSeq : function () { return 0; };
        const startFn = typeof opts.startFn === 'function' ? opts.startFn : function () {};
        const logFn = typeof opts.logFn === 'function' ? opts.logFn : function () {};
        const setTimer = typeof opts.setTimer === 'function' ? opts.setTimer : setTimeout;
        const clearTimer = typeof opts.clearTimer === 'function' ? opts.clearTimer : clearTimeout;

        function reset() {
            state.n = 0;
            if (state.t) {
                clearTimer(state.t);
                state.t = null;
            }
        }

        function setSeq(seq) {
            state.seq = Number(seq || 0);
        }

        function schedule(playUrl) {
            if (state.seq !== getSeq()) return;
            if (state.n >= maxRetries) return;
            const delay = Math.min(15000, Math.round(1000 * Math.pow(1.8, state.n)));
            state.n += 1;
            if (state.t) clearTimer(state.t);
            const seq = getSeq();
            state.t = setTimer(function () {
                if (playUrl) startFn(playUrl, seq);
            }, delay);
            logFn('计划重试第 ' + state.n + ' 次，' + delay + 'ms 后');
        }

        return { reset, schedule, setSeq };
    };
})();
