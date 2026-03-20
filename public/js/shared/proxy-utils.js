(function () {
    var ns = (window.IptvCore = window.IptvCore || {});
    var shared = (ns.shared = ns.shared || {});

    // 去除 URL 协议前缀（如 "http://" 或 "rtsp://"）
    shared.stripAnyScheme = function (url) {
        return String(url || '').replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, '');
    };

    // 检测 URL 协议类型（如 "http", "rtsp", "rtp", "udp"）
    shared.detectUrlScheme = function (url, fallback) {
        var m = String(url || '').trim().match(/^([a-zA-Z][a-zA-Z0-9+.-]*):\/\//);
        return (m && m[1]) ? String(m[1]).toLowerCase() : String(fallback || 'http').toLowerCase();
    };

    // 规范化代理基址（补全 http:// 前缀，去除尾部斜杠）
    shared.normalizeProxyBaseUrl = function (base) {
        var b = String(base || '').trim();
        if (!b) return '';
        if (!/^https?:\/\//i.test(b)) b = 'http://' + b.replace(/^\/+/, '');
        return b;
    };

    // 根据代理模式拼接原始 URL
    // mode: 'path_no_scheme' | 'with_proto_segment' | 'full_url'
    shared.applyProxyMode = function (rawUrl, proxyBaseUrl, mode, defaultScheme) {
        var raw = String(rawUrl || '').trim();
        var pb = shared.normalizeProxyBaseUrl(proxyBaseUrl).replace(/\/+$/, '');
        if (!raw || !pb) return raw;
        if (raw.toLowerCase().startsWith((pb + '/').toLowerCase())) return raw;
        var md = String(mode || 'path_no_scheme').toLowerCase();
        var sch = shared.detectUrlScheme(raw, defaultScheme || 'http');
        var rawNoScheme = shared.stripAnyScheme(raw).replace(/^\/+/, '');
        var rawWithScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(raw) ? raw : (sch + '://' + rawNoScheme);
        if (md === 'full_url') return pb + '/' + rawWithScheme;
        if (md === 'with_proto_segment') return pb + '/' + sch + '/' + rawNoScheme;
        return pb + '/' + rawNoScheme;
    };
})();
