(function () {
    const ns = (window.IptvCore = window.IptvCore || {});
    const index = (ns.index = ns.index || {});

    index.initVersionManager = function () {
        if (!window.IptvCore || !window.IptvCore.persist || typeof window.IptvCore.persist.createManager !== 'function') return null;
        const manager = window.IptvCore.persist.createManager({
            selectId: 'versionsSelectIndex',
            safetyHintId: 'backupSafetyHintIndex',
            notify: function (msg) { if (window.showCenterConfirm) window.showCenterConfirm(msg, null, true); },
            confirm: function (msg, cb) { if (window.showCenterConfirm) window.showCenterConfirm(msg, cb); },
            applyStreams: async function (arr) {
                window.allStreams = arr;
                if (typeof window.updateStatsAndDisplay === 'function') window.updateStatsAndDisplay();
            },
            applySettings: async function (settings) {
                if (Array.isArray(settings && settings.groupTitles)) localStorage.setItem('groupTitles', JSON.stringify(settings.groupTitles));
                if (typeof (settings && settings.logoTemplate) === 'string') localStorage.setItem('logoTemplate', settings.logoTemplate);
                if (Array.isArray(settings && settings.fccServers)) localStorage.setItem('fccServers', JSON.stringify(settings.fccServers));
            },
            refreshData: async function () {
                if (typeof window.getStreams === 'function') await window.getStreams();
            },
            getCounts: function () {
                const list = Array.isArray(window.allStreams) ? window.allStreams : [];
                const total = list.length;
                const online = list.filter(s => s && s.isAvailable).length;
                return { total, online, offline: total - online };
            }
        });

        window.getCurrentVersionFile = manager.getCurrentVersionFile;
        window.setCurrentVersionFile = manager.setCurrentVersionFile;
        window.refreshVersionsIndex = manager.refresh;
        window.loadSelectedVersionIndex = manager.loadSelected;
        window.deleteSelectedVersionIndex = manager.deleteSelected;
        window.persistSaveIndex = manager.save;
        window.doPageRefreshIndex = manager.pageRefresh;

        const btnRefresh = document.getElementById('refreshVersionsBtnIndex');
        const btnLoad = document.getElementById('loadBtnIndex');
        const btnDelete = document.getElementById('deletePersistBtnIndex');
        const btnSave = document.getElementById('saveBtnIndex');
        if (btnRefresh) btnRefresh.onclick = manager.pageRefresh;
        if (btnLoad) btnLoad.onclick = manager.loadSelected;
        if (btnDelete) btnDelete.onclick = manager.deleteSelected;
        if (btnSave) btnSave.onclick = manager.save;

        manager.refresh(manager.getCurrentVersionFile(), true);
        return manager;
    };
})();
