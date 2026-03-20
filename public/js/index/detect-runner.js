(function() {
    async function apiJson(url, options) {
        if (window.IptvCore && window.IptvCore.api && typeof window.IptvCore.api.request === 'function') {
            const resp = await window.IptvCore.api.request(url, options || {});
            return resp && resp.data ? resp.data : {};
        }
        const r = await fetch(url, options || {});
        return await r.json();
    }

    async function checkStream(udpxyUrl, multicastUrl, name = '') {
        showProgress(0, 1, `正在检测: ${name || '-'}`);
        const startTime = Date.now();
        try {
            const data = await apiJson('/api/check-stream', {
                method: 'POST',
                body: { udpxyUrl, multicastUrl, name },
            });
            if (!data.success) throw new Error(data.message || '检测失败');
            showProgress(1, 1, `检测完成: ${name || '-'} | 分辨率:${data.resolution || '-'} | 编码:${data.codec || '-'} | 帧率:${data.frameRate || '-'} | ${data.isAvailable ? '✅在线' : '❌离线'}`);
            showLastResult(data, name, multicastUrl);
            setTimeout(() => {
                const total = 1;
                const online = data.isAvailable ? 1 : 0;
                const offline = data.isAvailable ? 0 : 1;
                const usedSec = ((Date.now() - startTime) / 1000).toFixed(2);
                showProgress(1, 1, `检测完成 | 总数: ${total} 在线: ${online} 离线: ${offline} 耗时: ${usedSec}s | 分辨率:${data.resolution || '-'} | 编码:${data.codec || '-'} | 帧率:${data.frameRate || '-'} | ${data.isAvailable ? '✅在线' : '❌离线'}`);
                getStreams();
            }, 1800);
            return data;
        } catch (error) {
            showProgress(1, 1, `检测失败: ${name || '-'}`);
            setTimeout(hideProgress, 1800);
            console.error('Error:', error);
            return { success: false, message: '请求失败' };
        }
    }

    async function getStreams() {
        try {
            const data = await apiJson('/api/streams');
            allStreams = data.streams || [];
            updateStatsAndDisplay();
        } catch (error) {
            console.error('Error:', error);
        }
    }

    async function deleteStream(index) {
        showCenterConfirm('确定要删除该流吗？', async function(ok) {
            if (!ok) return;
            try {
                const data = await apiJson(`/api/stream/${index}`, { method: 'DELETE' });
                if (data.success) getStreams();
            } catch (error) { console.error('Error:', error); }
        });
    }

    async function batchCheckStreams(udpxyUrl, batchText) {
        const lines = batchText.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('#'));
        const multicastList = lines.map(line => {
            const parts = line.split(',');
            return { name: parts[0] ? parts[0].trim() : '', multicastUrl: parts.slice(1).join(',').trim() };
        }).filter(item => item.multicastUrl.startsWith('rtp://'));
        if (multicastList.length === 0) {
            showCenterConfirm('请粘贴组播地址', null, true);
            return;
        }
        try {
            let lastSuccess = null;
            for (let i = 0; i < multicastList.length; i++) {
                if (detectCancel) { showProgress(i, multicastList.length, '检测已停止'); break; }
                const item = multicastList[i];
                showProgress(i, multicastList.length, `正在检测: ${item.name || '-'}`);
                const data = await apiJson('/api/check-stream', {
                    method: 'POST',
                    body: { udpxyUrl, multicastUrl: item.multicastUrl, name: item.name },
                });
                showProgress(i + 1, multicastList.length, `检测: ${item.name || '-'} | 分辨率:${data.resolution || '-'} | 编码:${data.codec || '-'} | 帧率:${data.frameRate || '-'} | ${data.isAvailable ? '✅在线' : '❌离线'}`);
                if (data.success) lastSuccess = { ...data, name: item.name, multicastUrl: item.multicastUrl };
                if (lastSuccess) showLastResult(lastSuccess, lastSuccess.name, lastSuccess.multicastUrl);
                await new Promise(r => setTimeout(r, 400));
            }
            const allData = await apiJson('/api/streams');
            const onlineCount = (allData.streams || []).filter(r => r.isAvailable).length;
            const offlineCount = (allData.streams || []).filter(r => !r.isAvailable).length;
            showProgress(multicastList.length, multicastList.length, detectCancel ? `检测停止 | 已完成: ${onlineCount+offlineCount} 在线: ${onlineCount} 离线: ${offlineCount}` : `检测完成 | 总数: ${multicastList.length} 在线: ${onlineCount} 离线: ${offlineCount}`);
            try { showDetectionSummary(allData.streams || []); } catch(e) {}
            try { notifyDetectionDone(onlineCount, offlineCount, (allData.streams||[]).length); } catch(e) {}
            getStreams();
        } catch (error) {
            showProgress(1, 1, '批量检测请求失败');
            setTimeout(hideProgress, 1800);
            console.error('Error:', error);
        }
    }

    async function batchCheckStreamsMixed(udpxyUrl, batchText) {
        const lines = batchText.split('\n').map(line => line.trim()).filter(line => line && !line.startsWith('#'));
        const rawList = lines.map(line => {
            const parts = line.split(',');
            let nm = '';
            let u0 = '';
            if (parts.length <= 1) {
                u0 = parts[0] ? parts[0].trim() : '';
            } else {
                nm = parts[0] ? parts[0].trim() : '';
                u0 = parts.slice(1).join(',').trim();
            }
            nm = nm.replace(/^[`'"]+|[`'"]+$/g, '');
            u0 = u0.replace(/^[`'"]+|[`'"]+$/g, '');
            return { name: nm, url: u0 };
        }).filter(item => item.url && (item.url.startsWith('rtp://') || item.url.startsWith('http://') || item.url.startsWith('https://')));
        function expandBracketRange(u) {
            const m = u.match(/\[(\d+)\s*-\s*(\d+)\]/);
            if (!m) return [u];
            const a = m[1], b = m[2];
            let start = parseInt(a, 10), end = parseInt(b, 10);
            if (isNaN(start) || isNaN(end)) return [u];
            if (start > end) { const t = start; start = end; end = t; }
            const width = a.length;
            const prefix = u.slice(0, m.index);
            const suffix = u.slice(m.index + m[0].length);
            const out = [];
            for (let i = start; i <= end; i++) {
                const num = String(i).padStart(width, '0');
                out.push(prefix + num + suffix);
            }
            return out;
        }
        let list = [];
        rawList.forEach(item => {
            const urls = expandBracketRange(item.url);
            urls.forEach(exp => list.push({ name: item.name, url: exp }));
        });
        if (list.length === 0) {
            showCenterConfirm('请粘贴有效的地址', null, true);
            return;
        }
        try {
            let finished = 0;
            let lastSuccess = null;
            const limit = parseInt((document.getElementById('concurrencySelect') && document.getElementById('concurrencySelect').value) || '5', 10);
            showProgress(0, list.length, `正在检测（单播范围），共${list.length}条`);
            let idx = 0;
            async function detectOne(item, index) {
                if (detectCancel) return;
                showProgress(finished, list.length, `正在检测: ${item.name || '-'} (${index+1}/${list.length})`);
                let resp;
                const isUdpRtpHttp = item.url.startsWith('http://') || item.url.startsWith('https://');
                let asRtp = null;
                if (isUdpRtpHttp) {
                    try {
                        const u = new URL(item.url);
                        if (u.pathname.includes('/rtp/')) {
                            const seg = u.pathname.split('/rtp/')[1] || '';
                            const ipPort = seg.split('?')[0];
                            if (ipPort && ipPort.includes(':')) {
                                asRtp = 'rtp://' + ipPort;
                            }
                        }
                    } catch(e) {}
                }
                if (item.url.startsWith('rtp://') || asRtp) {
                    resp = await apiJson('/api/check-stream', {
                        method: 'POST',
                        body: { udpxyUrl, multicastUrl: asRtp ? asRtp : item.url, name: item.name },
                    });
                } else {
                    resp = await apiJson('/api/check-http-stream', {
                        method: 'POST',
                        body: { url: item.url, name: item.name },
                    });
                }
                const data = resp;
                finished++;
                showProgress(finished, list.length, `检测: ${item.name || '-'} | 分辨率:${data.resolution || '-'} | 编码:${data.codec || '-'} | 帧率:${data.frameRate || '-'} | ${data.isAvailable ? '✅在线' : '❌离线'}`);
                if (data.success) {
                    lastSuccess = { ...data, name: item.name, multicastUrl: item.url };
                }
                if (lastSuccess) showLastResult(lastSuccess, lastSuccess.name, lastSuccess.multicastUrl);
            }
            async function runNext() {
                if (detectCancel || idx >= list.length) return;
                const i = idx++;
                const item = list[i];
                await detectOne(item, i);
                await runNext();
            }
            await Promise.all(Array(Math.min(limit, list.length)).fill(0).map(() => runNext()));
            const allData = await apiJson('/api/streams');
            const onlineCount = (allData.streams || []).filter(r => r.isAvailable).length;
            const offlineCount = (allData.streams || []).filter(r => !r.isAvailable).length;
            showProgress(list.length, list.length, detectCancel ? `检测停止 | 已完成: ${finished} 在线: ${onlineCount} 离线: ${offlineCount}` : `检测完成 | 总数: ${list.length} 在线: ${onlineCount} 离线: ${offlineCount}`);
            try { showDetectionSummary(allData.streams || []); } catch(e) {}
            try { notifyDetectionDone(onlineCount, offlineCount, (allData.streams||[]).length); } catch(e) {}
            getStreams();
        } catch (error) {
            showProgress(1, 1, '批量检测请求失败');
            setTimeout(hideProgress, 1800);
        }
    }

    window.apiJson = apiJson;
    window.checkStream = checkStream;
    window.getStreams = getStreams;
    window.deleteStream = deleteStream;
    window.batchCheckStreams = batchCheckStreams;
    window.batchCheckStreamsMixed = batchCheckStreamsMixed;
})();
