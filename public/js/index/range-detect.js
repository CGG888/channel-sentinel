(function() {
    function parseCIDR(cidrStr) {
        const parts = (cidrStr || '').trim().split('/');
        if (parts.length !== 2) return null;
        const ipStr = parts[0].trim();
        const maskLen = parseInt(parts[1], 10);
        if (isNaN(maskLen) || maskLen < 0 || maskLen > 32) return null;
        const octets = ipStr.split('.').map(n => parseInt(n, 10));
        if (octets.length !== 4 || octets.some(n => isNaN(n) || n < 0 || n > 255)) return null;
        const ip = ((octets[0] << 24) >>> 0) | (octets[1] << 16) | (octets[2] << 8) | (octets[3] >>> 0);
        const mask = maskLen === 0 ? 0 : ((0xFFFFFFFF << (32 - maskLen)) >>> 0);
        const network = (ip & mask) >>> 0;
        const hostmask = (~mask) >>> 0;
        let start = network;
        let end = (network | hostmask) >>> 0;
        if (maskLen <= 30) {
            start = (network + 1) >>> 0;
            end = (end - 1) >>> 0;
        }
        function toIpString(v) {
            return [(v >>> 24) & 0xFF, (v >>> 16) & 0xFF, (v >>> 8) & 0xFF, v & 0xFF].join('.');
        }
        return { start: toIpString(start), end: toIpString(end) };
    }

    function parseRtpUrl(u) {
        const s = (u || '').trim();
        if (!s.startsWith('rtp://')) return null;
        const body = s.slice(6);
        const parts = body.split(':');
        if (parts.length !== 2) return null;
        const ip = parts[0];
        const port = parseInt(parts[1], 10);
        const octets = ip.split('.').map(n => parseInt(n, 10));
        if (octets.length !== 4 || octets.some(n => isNaN(n) || n < 0 || n > 255)) return null;
        if (isNaN(port) || port < 1 || port > 65535) return null;
        return { ip, port };
    }

    function ipv4ToInt(ip) {
        const o = ip.split('.').map(n => parseInt(n, 10));
        return ((o[0] << 24) >>> 0) | (o[1] << 16) | (o[2] << 8) | (o[3] >>> 0);
    }

    function updateRangeSummary() {
        const startEl = document.getElementById('rangeStart');
        const endEl = document.getElementById('rangeEnd');
        const sumEl = document.getElementById('rangeSummary');
        const cidrEl = document.getElementById('cidrInput');
        if (!startEl || !endEl || !sumEl) return;
        const s = parseRtpUrl(startEl.value);
        const e = parseRtpUrl(endEl.value);
        if (!s || !e) {
            const cidrStr = cidrEl ? cidrEl.value.trim() : '';
            const parts = cidrStr.split('/');
            if (parts.length === 2) {
                const maskLen = parseInt(parts[1], 10);
                if (!isNaN(maskLen) && maskLen >= 0 && maskLen <= 32) {
                    const total = maskLen === 32 ? 1 : (1 << (32 - maskLen));
                    const count = maskLen <= 30 ? Math.max(total - 2, 0) : total;
                    sumEl.value = `${cidrStr}  组播数量：${count}`;
                    return;
                }
            }
            sumEl.value = '';
            return;
        }
        const si = ipv4ToInt(s.ip);
        const ei = ipv4ToInt(e.ip);
        if (si > ei) {
            sumEl.value = `${s.ip} - ${e.ip}  组播数量：-`;
            return;
        }
        const count = (ei - si + 1);
        sumEl.value = `${s.ip} - ${e.ip}  组播数量：${count}`;
    }

    function ipToInt(ip) {
        const parts = ip.split('.').map(Number);
        if (parts.length !== 4 || parts.some(n => isNaN(n) || n < 0 || n > 255)) return null;
        return (parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3];
    }

    function intToIp(intv) {
        const a = (intv >>> 24) & 255, b = (intv >>> 16) & 255, c = (intv >>> 8) & 255, d = intv & 255;
        return `${a}.${b}.${c}.${d}`;
    }

    function parseRtp(url) {
        const u = (url || '').trim();
        if (!u.startsWith('rtp://')) return null;
        const hostPort = u.replace('rtp://', '');
        const parts = hostPort.split(':');
        const host = parts[0];
        const port = Number(parts[1]);
        const ipInt = ipToInt(host);
        if (!ipInt || !port) return null;
        return { ipInt, port, host };
    }

    async function rangeCheckStreams(udpxyUrl, startUrl, endUrl) {
        if (!udpxyUrl) { showCenterConfirm('请先选择UDPXY服务器', null, true); return; }
        const s = parseRtp(startUrl);
        const e = parseRtp(endUrl);
        if (!s || !e) { showCenterConfirm('请输入正确的范围（rtp://ip:port）', null, true); return; }
        if (s.port !== e.port) { showCenterConfirm('起止端口需一致', null, true); return; }
        let a = s.ipInt, b = e.ipInt;
        if (a > b) [a, b] = [b, a];
        const total = (b - a + 1);
        let count = total;
        showProgress(0, count, `正在范围检测，共${count}条`);
        const multicastList = [];
        for (let i = 0; i < count; i++) {
            const ip = intToIp(a + i);
            multicastList.push({ name: '', multicastUrl: `rtp://${ip}:${s.port}` });
        }
        try {
            let finished = 0;
            const limit = parseInt((document.getElementById('concurrencySelect') && document.getElementById('concurrencySelect').value) || '5', 10);
            async function detectOne(item) {
                if (detectCancel) return;
                const data = await apiJson('/api/check-stream', {
                    method: 'POST',
                    body: { udpxyUrl, multicastUrl: item.multicastUrl, name: '' }
                });
                finished++;
                showProgress(finished, count, `检测: ${item.multicastUrl} | ${data.isAvailable ? '✅在线' : '❌离线'}`);
            }
            let idx = 0;
            async function runNext() {
                if (detectCancel || idx >= multicastList.length) return;
                const item = multicastList[idx++];
                await detectOne(item);
                await runNext();
            }
            await Promise.all(Array(Math.min(limit, multicastList.length)).fill(0).map(() => runNext()));
            const allData = await apiJson('/api/streams');
            const onlineCount = (allData.streams || []).filter(r => r.isAvailable).length;
            const offlineCount = (allData.streams || []).filter(r => !r.isAvailable).length;
            showProgress(multicastList.length, multicastList.length, detectCancel ? `检测停止 | 已完成: ${finished} 在线: ${onlineCount} 离线: ${offlineCount}` : `检测完成 | 总数: ${multicastList.length} 在线: ${onlineCount} 离线: ${offlineCount}`);
            getStreams();
        } catch (err) {
            showProgress(1, 1, '范围检测请求失败');
            setTimeout(hideProgress, 1800);
        }
    }

    window.parseCIDR = parseCIDR;
    window.parseRtpUrl = parseRtpUrl;
    window.ipv4ToInt = ipv4ToInt;
    window.updateRangeSummary = updateRangeSummary;
    window.parseRtp = parseRtp;
    window.rangeCheckStreams = rangeCheckStreams;
    window.intToIp = intToIp;
})();
