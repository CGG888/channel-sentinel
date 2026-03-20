(function () {
    const ns = (window.IptvCore = window.IptvCore || {});
    const results = (ns.results = ns.results || {});
    const persist = (results.persist = results.persist || {});

    persist.autoloadLatest = async function () {
        try {
            const vj = await apiJson('/api/persist/load-backup', { method: 'POST', body: { type: 'sqlite-main', filename: 'channel_sentinel.db' } });
            if (vj.success) {
                if (vj.settings && typeof window.applySettingsSnapshotToLocal === 'function') {
                    window.applySettingsSnapshotToLocal(vj.settings, false);
                    if (window.IptvCore && window.IptvCore.settings && window.IptvCore.settings.fcc) {
                        window.IptvCore.settings.fcc.renderSelect();
                    }
                }
                if (Array.isArray(vj.streams) && typeof window.applyLoadedStreams === 'function') {
                    window.applyLoadedStreams(vj.streams);
                }
                return true;
            }
        } catch (e) {}
        try {
            const pj = await apiJson('/api/persist/load', { method: 'POST' });
            if (pj.success) {
                if (typeof window.fetchStreams === 'function') await window.fetchStreams();
                return true;
            }
        } catch (e) {}
        return false;
    };

    persist.load = async function () {
        const j = await apiJson('/api/persist/load', { method: 'POST' });
        if (!j.success) return;
        try {
            const sj = await apiJson('/api/settings');
            if (sj.success && sj.settings && typeof window.applySettingsSnapshotToLocal === 'function') {
                window.applySettingsSnapshotToLocal(sj.settings, true);
            }
        } catch (e) {}
        if (typeof window.refreshFccServersFromBackend === 'function') await window.refreshFccServersFromBackend();
        if (window.IptvCore && window.IptvCore.settings && window.IptvCore.settings.logo) await window.IptvCore.settings.logo.loadTemplates();
        if (window.IptvCore && window.IptvCore.settings && window.IptvCore.settings.group) await window.IptvCore.settings.group.loadTitlesFromServer();
        if (typeof window.loadUdpxyServers === 'function') await window.loadUdpxyServers();
        if (typeof window.refreshVersions === 'function') await window.refreshVersions();
        if (typeof window.fetchStreams === 'function') await window.fetchStreams();
        try {
            const cnt = Array.isArray(j.streams) ? j.streams.length : 0;
            if (typeof window.showCenterConfirm === 'function') window.showCenterConfirm('加载成功：streams.json（共 ' + cnt + ' 条）');
        } catch (e) {}
    };

    persist.delete = async function () {
        try {
            const j = await apiJson('/api/persist/delete', { method: 'POST' });
            if (j && j.success) {
                if (typeof window.refreshVersions === 'function') await window.refreshVersions();
                if (typeof window.showCenterConfirm === 'function') window.showCenterConfirm('已删除：streams.json');
            }
        } catch (e) {}
    };
})();
