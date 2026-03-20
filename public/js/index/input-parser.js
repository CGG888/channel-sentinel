(function() {
    function parsePlaylistText(t) {
        const lines = t.split('\n').map(s => s.trim()).filter(s => s);
        const out = [];
        const epgUrls = [];
        const headMatches = [];
        for (const ln of lines) {
            if (/^#EXTM3U/i.test(ln)) headMatches.push(ln);
            else if (/^#EXTINF/i.test(ln)) break;
        }
        headMatches.forEach(h => {
            const rx1 = /x-tvg-url\s*=\s*"([^"]+)"/ig;
            const rx2 = /x-tvg-url\s*=\s*'([^']+)'/ig;
            let m;
            while ((m = rx1.exec(h)) !== null) epgUrls.push(m[1]);
            while ((m = rx2.exec(h)) !== null) epgUrls.push(m[1]);
        });
        if (t.includes('#EXTM3U')) {
            let curAttrs = {};
            for (let i = 0; i < lines.length; i++) {
                const ln = lines[i];
                if (/^#EXTINF/i.test(ln)) {
                    const kv = ln.replace(/^#EXTINF:[^ ]*\s*/i, '');
                    const idx = kv.lastIndexOf(',');
                    const attrStr = idx !== -1 ? kv.slice(0, idx).trim() : '';
                    const nm = idx !== -1 ? kv.slice(idx + 1).trim() : '';
                    const attrs = {};
                    const re = /([\w\-]+)\s*=\s*"([^"]*)"|([\w\-]+)\s*=\s*'([^']*)'/g;
                    let m;
                    while ((m = re.exec(attrStr)) !== null) {
                        const k = (m[1] || m[3] || '').trim();
                        const v = (m[2] || m[4] || '').trim();
                        if (k) attrs[k] = v;
                    }
                    curAttrs = {
                        name: nm.replace(/^[`'"]+|[`'"]+$/g, ''),
                        tvgId: attrs['tvg-id'] || '',
                        tvgName: attrs['tvg-name'] || '',
                        tvgLogo: attrs['tvg-logo'] || '',
                        groupTitle: attrs['group-title'] || '',
                        catchup: attrs['catchup'] || '',
                        catchupSource: attrs['catchup-source'] || ''
                    };
                } else if (!ln.startsWith('#')) {
                    const uRaw = ln.trim();
                    const u = uRaw.replace(/^[`'"]+|[`'"]+$/g, '');
                    const item = {
                        name: curAttrs.name || '',
                        url: u,
                        tvgId: curAttrs.tvgId || '',
                        tvgName: curAttrs.tvgName || '',
                        tvgLogo: curAttrs.tvgLogo || '',
                        groupTitle: curAttrs.groupTitle || '',
                        catchup: curAttrs.catchup || '',
                        catchupSource: curAttrs.catchupSource || ''
                    };
                    out.push(item);
                    curAttrs = {};
                }
            }
        } else {
            for (const ln of lines) {
                if (ln.startsWith('#')) continue;
                if (ln.includes(',')) {
                    const sp = ln.split(',');
                    const n = sp.shift();
                    const u = sp.join(',');
                    const nm = (n || '').trim().replace(/^[`'"]+|[`'"]+$/g, '');
                    const url = (u || '').trim().replace(/^[`'"]+|[`'"]+$/g, '');
                    out.push({ name: nm, url: url, tvgId: '', tvgName: '', tvgLogo: '', groupTitle: '', catchup: '', catchupSource: '' });
                } else {
                    const url = ln.trim().replace(/^[`'"]+|[`'"]+$/g, '');
                    out.push({ name: '', url, tvgId: '', tvgName: '', tvgLogo: '', groupTitle: '', catchup: '', catchupSource: '' });
                }
            }
        }
        const filtered = out.filter(it => it.url && (it.url.startsWith('rtp://') || it.url.startsWith('http://') || it.url.startsWith('https://')));
        try { window.__lastM3UImport = { epgHeaderUrls: Array.from(new Set(epgUrls)), items: filtered }; } catch(e) {}
        return filtered;
    }

    function classifyScopeByUrl(u) {
        try {
            const x = new URL(u);
            const h = x.hostname || '';
            if (h === 'localhost' || h === '127.0.0.1') return '内网EPG';
            if (/^192\.168\./.test(h)) return '内网EPG';
            if (/^10\./.test(h)) return '内网EPG';
            if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(h)) return '内网EPG';
            return '外网EPG';
        } catch(e) { return '外网EPG'; }
    }

    async function persistImportedMeta(items) {
        try {
            const epgUrls = (window.__lastM3UImport && window.__lastM3UImport.epgHeaderUrls) ? window.__lastM3UImport.epgHeaderUrls : [];
            let groups = Array.from(new Set(items.map(x => String(x.groupTitle||'').trim()).filter(Boolean)));
            try {
                const cur = await apiJson('/api/config/group-titles').catch(()=>({titles:[],titlesObj:[]}));
                const now = Array.isArray(cur.titles) ? cur.titles : [];
                const merged = Array.from(new Set(now.concat(groups))).filter(Boolean).map(n => ({name:n,color:''}));
                await apiJson('/api/config/group-titles',{method:'POST',body:{titlesObj:merged}});
            } catch(e) {}
            if (Array.isArray(epgUrls) && epgUrls.length>0) {
                try {
                    const cur = await apiJson('/api/config/epg-sources').catch(()=>({sources:[]}));
                    const list = Array.isArray(cur.sources)?cur.sources:[];
                    const add = [];
                    epgUrls.forEach(u=>{
                        const scope = classifyScopeByUrl(u);
                        const exists = list.find(x => x && x.url === u);
                        if (!exists) add.push({ name: '导入EPG/'+(function(){try{ return new URL(u).hostname }catch(e){ return '源' }})(), url: u, scope });
                    });
                    if (add.length>0) {
                        const merged = list.concat(add).map(x=>({id:x.id||'',name:x.name||'未命名EPG',url:x.url,scope:(x.scope==='外网EPG'?'外网EPG':'内网EPG')}));
                        await apiJson('/api/config/epg-sources',{method:'POST',body:{sources:merged}});
                    }
                } catch(e) {}
            }
            let existing = [];
            try { existing = await apiJson('/api/streams').then(j=>Array.isArray(j.streams)?j.streams:[]); } catch(e) { existing = []; }
            const byKey = {};
            existing.forEach(s => { const k = normalizeKey(String(s.multicastUrl||'').trim()); if (k) byKey[k] = s; });
            const tasks = [];
            items.forEach(it=>{
                const u = String(it.url||'').trim();
                if(!u) return;
                const key = normalizeKey(u);
                const cur = byKey[key] || {};
                let mUrl = cur.multicastUrl || (function(){
                    try {
                        const uu = new URL(u);
                        if (uu.pathname.includes('/rtp/')) {
                            const seg = uu.pathname.split('/rtp/')[1] || '';
                            const ip = seg.split('?')[0] || '';
                            if (ip) return 'rtp://' + ip;
                        }
                    } catch(e) {}
                    return u;
                })();
                const upd = {};
                if (!cur.tvgId && it.tvgId) upd.tvgId = it.tvgId;
                if (!cur.tvgName && it.tvgName) upd.tvgName = it.tvgName;
                if (!cur.groupTitle && it.groupTitle) upd.groupTitle = it.groupTitle;
                if (!cur.name && it.name) upd.name = it.name;
                const logoNow = String(cur.logo||'').trim();
                if (!logoNow && it.tvgLogo) upd.logo = it.tvgLogo;
                if (it.catchup) upd.m3uCatchup = it.catchup;
                if (it.catchupSource) upd.m3uCatchupSource = it.catchupSource;
                if (Object.keys(upd).length>0) {
                    tasks.push(apiJson('/api/stream/update',{method:'POST',body:{udpxyUrl:cur.udpxyUrl||'',multicastUrl:mUrl,update:upd}}).catch(()=>null));
                }
            });
            if (tasks.length>0) await Promise.all(tasks);
        } catch(e) {}
    }

    function normalizeKey(url) {
        if (url.startsWith('rtp://')) {
            const p = parseRtpUrl(url);
            return p ? ('rtp:' + p.ip) : ('rtp:' + url);
        }
        try {
            const u = new URL(url);
            if (u.pathname.includes('/rtp/')) {
                const seg = u.pathname.split('/rtp/')[1] || '';
                const ip = seg.split(':')[0] || '';
                return ip ? ('rtp:' + ip) : ('http:' + u.hostname + u.pathname);
            }
            return 'http:' + u.hostname + u.pathname;
        } catch(e) {
            return (url.split('?')[0] || url);
        }
    }

    function unifyChannelNames(items) {
        const groups = new Map();
        for (const it of items) {
            const k = normalizeKey(String(it.url || '').trim().replace(/^[`'"]+|[`'"]+$/g, ''));
            const arr = groups.get(k) || [];
            arr.push(it);
            groups.set(k, arr);
        }
        for (const [k, arr] of groups.entries()) {
            let canonical = '';
            for (const x of arr) {
                if (x.name && x.name.trim()) { canonical = x.name.trim(); break; }
            }
            if (!canonical) {
                if (k.startsWith('rtp:')) canonical = k.slice(4);
                else canonical = (arr[0].name || '').trim() || '频道';
            }
            for (const x of arr) x.name = canonical;
        }
        return items;
    }

    window.parsePlaylistText = parsePlaylistText;
    window.classifyScopeByUrl = classifyScopeByUrl;
    window.persistImportedMeta = persistImportedMeta;
    window.normalizeKey = normalizeKey;
    window.unifyChannelNames = unifyChannelNames;
})();
