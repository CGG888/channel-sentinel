(function () {
    const ns = (window.IptvCore = window.IptvCore || {});
    const player = (ns.player = ns.player || {});
    const startKernel = (player.startKernel = player.startKernel || {});

    startKernel.isM3u8Url = function (rawUrl) {
        const src = String(rawUrl || '');
        return /\.m3u8(\?|$)/i.test(src) || src.indexOf('m3u8') > -1;
    };

    startKernel.createHls = function (HlsCtor) {
        return new HlsCtor({
            lowLatencyMode: false,
            capLevelToPlayerSize: true,
            backBufferLength: 30,
            liveSyncDurationCount: 3,
            liveMaxLatencyDurationCount: 8,
            maxBufferLength: 20,
            maxBufferHole: 1,
            nudgeOffset: 0.1,
            nudgeMaxRetry: 5,
            fragLoadingMaxRetry: 3,
            levelLoadingMaxRetry: 3,
            manifestLoadingMaxRetry: 3,
            fragLoadingRetryDelay: 1000,
            levelLoadingRetryDelay: 1000,
            manifestLoadingRetryDelay: 1000
        });
    };

    startKernel.canUseMpegts = function (mpegts) {
        return !!(mpegts && mpegts.isSupported() && mpegts.getFeatureList().mseLivePlayback);
    };

    startKernel.applyMpegtsLogging = function (mpegts) {
        if (mpegts && mpegts.LoggingControl) {
            try {
                mpegts.LoggingControl.enableDebug = false;
                mpegts.LoggingControl.enableVerbose = false;
            } catch (e) {}
        }
    };

    startKernel.createMpegtsProfile = function (playUrl) {
        return {
            mediaDataSource: { type: 'mse', isLive: true, url: playUrl, liveBufferLatencyChasing: true },
            config: {
                isLive: true,
                enableStashBuffer: true,
                stashInitialSize: 256 * 1024,
                liveBufferLatencyChasing: true,
                liveBufferLatencyMaxLatency: 1.2,
                liveBufferLatencyMinRemain: 0.3,
                autoCleanupSourceBuffer: true,
                autoCleanupMaxBackwardDuration: 120,
                autoCleanupMinBackwardDuration: 60,
                fixAudioTimestampGap: true,
                lazyLoad: false
            }
        };
    };

    // HEVC HLS 切换逻辑：检测到 HEVC HLS 源时自动切换到非 HLS 备选源
    // 返回 { shouldSwitch: boolean, altSource: object|null }
    startKernel.handleHevcSwitch = function (stream, sources, current, currentReplayProgram) {
        var result = { shouldSwitch: false, altSource: null };
        try {
            var c = String((current && current.codec) || '').toLowerCase();
            if (c !== 'hevc' || currentReplayProgram) {
                return result;
            }
            if (!sources || !Array.isArray(sources)) {
                return result;
            }
            var alts = sources.filter(function (x) {
                var u = String(x.multicastUrl || '').trim();
                return u && !/\.m3u8(\?|$)/i.test(u);
            });
            if (alts.length > 0) {
                result.shouldSwitch = true;
                result.altSource = alts[0];
            }
        } catch (e) {}
        return result;
    };

    // HLS 错误事件处理器工厂
    // seq: 当前播放序列号, playSeq: 全局播放序列, scheduleReco: 重试调度函数, logStatus: 日志函数
    startKernel.createHlsErrorHandler = function (seq, playSeq, scheduleReco, logStatus) {
        return function (_, data) {
            if (seq !== playSeq) return;
            if (!data || !data.fatal) return;
            logStatus('HLS fatal error: ' + data.type);
            if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                scheduleReco();
            } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
                try {
                    // Note: 需要外部传入 hls 实例的 recoverMediaError 方法
                    // 这里只负责调度重试
                    scheduleReco();
                } catch (e) {
                    scheduleReco();
                }
            } else {
                scheduleReco();
            }
        };
    };

    // mpegts 错误事件处理器工厂
    // seq: 当前播放序列号, playSeq: 全局播放序列, scheduleReco: 重试调度函数,
    // autoplayAwaitClick: 自动播放等待标记, logStatus: 日志函数
    startKernel.createMpegtsErrorHandler = function (seq, playSeq, scheduleReco, autoplayAwaitClick, logStatus) {
        return function (type, detail) {
            if (seq !== playSeq) return;
            logStatus('mpegts error: ' + type);
            if (!autoplayAwaitClick) {
                scheduleReco();
            }
        };
    };

    // 绑定 HLS 核心事件（MEDIA_ATTACHED、LEVEL_UPDATED）
    // handlers: { resetReco: fn, logStatus: fn }
    startKernel.bindHlsCoreEvents = function (h, handlers) {
        h.on(Hls.Events.MEDIA_ATTACHED, function () { handlers.resetReco(); handlers.logStatus('HLS 已绑定媒体'); });
        h.on(Hls.Events.LEVEL_UPDATED, function () { handlers.resetReco(); });
    };

    // 绑定视频元素播放事件（playing、loadeddata）
    // seq: 当前播放序列号, playSeq: 全局播放序列
    // handlers: { resetReco: fn, setPlayPriority: fn, logStatus: fn }
    startKernel.bindVideoPlayEvents = function (v, seq, playSeq, handlers) {
        v.addEventListener('playing', function () { if (seq === playSeq) { handlers.resetReco && handlers.resetReco(); handlers.setPlayPriority(false); } }, { once: true, passive: true });
        v.addEventListener('loadeddata', function () { if (seq === playSeq) { handlers.logStatus('已加载数据'); handlers.setPlayPriority(false); } }, { once: true, passive: true });
    };

    // 初始化视频播放尝试（unmute + play + coreController）
    // handlers: { onAutoplayBlocked: fn, onError: fn, logStatus: fn }
    startKernel.initVideoPlayAttempt = function (v, playResult, handlers) {
        try { v.muted = false; v.removeAttribute('muted'); } catch (e) {}
        var p = v.play && v.play();
        var core = window.IptvCore && window.IptvCore.player && window.IptvCore.player.coreController;
        if (core && typeof core.handlePlayAttempt === 'function') {
            core.handlePlayAttempt(p, {
                onBlocked: function () { handlers.onAutoplayBlocked(); },
                onError: function (e) { handlers.logStatus('play 调用失败: ' + e); }
            });
        }
    };

    // 初始化视频播放尝试（unmute + play + coreController）
    // handlers: { onAutoplayBlocked: fn, onError: fn, logStatus: fn }
    startKernel.initVideoPlayAttempt = function (v, playResult, handlers) {
        try { v.muted = false; v.removeAttribute('muted'); } catch (e) {}
        var p = v.play && v.play();
        var core = window.IptvCore && window.IptvCore.player && window.IptvCore.player.coreController;
        if (core && typeof core.handlePlayAttempt === 'function') {
            core.handlePlayAttempt(p, {
                onBlocked: function () { handlers.onAutoplayBlocked(); },
                onError: function (e) { handlers.logStatus('play 调用失败: ' + e); }
            });
        }
    };

    // 原生 HLS fallback：设置视频源 + stalled 处理 + 播放尝试
    // handlers: { initVideoPlayAttempt: fn, setPlayPriority: fn, logStatus: fn }
    startKernel.startNativeHls = function (v, playUrl, seq, playSeq, handlers) {
        v.src = playUrl;
        v.onstalled = function () {
            if (handlers._reco && handlers._reco.stall) clearTimeout(handlers._reco.stall);
            handlers._reco.stall = setTimeout(function () {
                v.load();
                v.play && v.play().catch(function () {});
            }, 15000);
        };
        v.onwaiting = v.onstalled;
        handlers.initVideoPlayAttempt(v, null, {
            onAutoplayBlocked: function () {
                handlers.onAutoplayBlocked();
            },
            onError: function (e) { handlers.logStatus('原生 HLS 播放失败: ' + e); },
            logStatus: handlers.logStatus
        });
        v.addEventListener('playing', function () { if (seq === playSeq) handlers.setPlayPriority(false); }, { once: true, passive: true });
        handlers.logStatus('使用原生 HLS 播放');
    };

    // 直接播放 TS（mpegts 不可用时的 fallback）
    startKernel.playDirectTs = function (v, playUrl, logStatus) {
        v.src = playUrl;
        v.play().catch(function (e) { logStatus('直接播放 TS 失败: ' + e); });
        logStatus('环境不支持 mpegts.js，尝试直接播放');
    };

    // 启动 mpegts.js 播放
    // mpegts: mpegts 对象, v: video 元素, profile: mpegts 配置, seq: 请求序列, playSeq: 全局序列
    // handlers: { onAutoplayBlocked: fn, setPlayPriority: fn, createMpegtsErrorHandler: fn, scheduleReco: fn, logStatus: fn }
    startKernel.startMpegtsPlayer = function (mpegts, v, profile, seq, playSeq, autoplayAwaitClick, handlers) {
        var player = mpegts.createPlayer(profile.mediaDataSource, profile.config);
        player.attachMediaElement(v);
        player.load();
        var _pp = player.play && player.play();
        var core = window.IptvCore && window.IptvCore.player && window.IptvCore.player.coreController;
        if (core && typeof core.handlePlayAttempt === 'function') {
            core.handlePlayAttempt(_pp, {
                onBlocked: function () { handlers.onAutoplayBlocked(); }
            });
        }
        v.addEventListener('playing', function () { if (seq === playSeq) handlers.setPlayPriority(false); }, { once: true, passive: true });
        player.on(mpegts.Events.ERROR, handlers.createMpegtsErrorHandler(seq, playSeq, function () { handlers.scheduleReco(); }, autoplayAwaitClick, handlers.logStatus));
        handlers.logStatus('开始 mpegts.js 播放');
        return player;
    };
})();
