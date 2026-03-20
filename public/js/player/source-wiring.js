(function () {
    const ns = (window.IptvCore = window.IptvCore || {});
    const player = (ns.player = ns.player || {});
    const sourceWiring = (player.sourceWiring = player.sourceWiring || {});

    sourceWiring.create = function (options) {
        const opts = options || {};
        const getRawUrl = typeof opts.getRawUrl === 'function' ? opts.getRawUrl : function () { return ''; };
        const getQierPlayer = typeof opts.getQierPlayer === 'function' ? opts.getQierPlayer : function () { return null; };
        const getSourceBtn = typeof opts.getSourceBtn === 'function' ? opts.getSourceBtn : function () { return null; };
        const setSourceBtn = typeof opts.setSourceBtn === 'function' ? opts.setSourceBtn : function () {};
        const getSourcePanel = typeof opts.getSourcePanel === 'function' ? opts.getSourcePanel : function () { return null; };
        const setSourcePanel = typeof opts.setSourcePanel === 'function' ? opts.setSourcePanel : function () {};
        const setSourceLabelEl = typeof opts.setSourceLabelEl === 'function' ? opts.setSourceLabelEl : function () {};
        const setLiveBtn = typeof opts.setLiveBtn === 'function' ? opts.setLiveBtn : function () {};
        const setLiveDot = typeof opts.setLiveDot === 'function' ? opts.setLiveDot : function () {};
        const setLiveLabelEl = typeof opts.setLiveLabelEl === 'function' ? opts.setLiveLabelEl : function () {};
        const updateLiveBadge = typeof opts.updateLiveBadge === 'function' ? opts.updateLiveBadge : function () {};
        const getSources = typeof opts.getSources === 'function' ? opts.getSources : function () { return []; };
        const getCurrentSourceIndex = typeof opts.getCurrentSourceIndex === 'function' ? opts.getCurrentSourceIndex : function () { return -1; };
        const onSelectSource = typeof opts.onSelectSource === 'function' ? opts.onSelectSource : function () {};

        function showSourcePanel() {
            const sourcePanel = getSourcePanel();
            const sourceBtn = getSourceBtn();
            if (!sourcePanel || !sourceBtn) return false;
            sourcePanel.style.display = 'block';
            return true;
        }

        function hideSourcePanel() {
            const sourcePanel = getSourcePanel();
            if (!sourcePanel) return false;
            sourcePanel.style.display = 'none';
            return true;
        }

        function renderSourceList() {
            const sourcePanel = getSourcePanel();
            if (!sourcePanel) return false;
            sourcePanel.innerHTML = '';
            const sources = getSources();
            const currentSourceIndex = getCurrentSourceIndex();
            sources.forEach(function (s, idx) {
                const row = document.createElement('div');
                row.className = 'source-row' + (idx === currentSourceIndex ? ' active' : '');
                const dot = document.createElement('span');
                dot.className = 'source-tag';
                row.appendChild(dot);
                const text = document.createElement('span');
                text.textContent = s.label;
                row.appendChild(text);
                row.addEventListener('click', function (e) {
                    e.stopPropagation();
                    hideSourcePanel();
                    onSelectSource(idx, true);
                });
                sourcePanel.appendChild(row);
            });
            return true;
        }

        function ensureSourceUi() {
            if (getRawUrl()) return true;
            if (getSourceBtn() && getSourcePanel()) return true;
            const qierPlayer = getQierPlayer();
            const root = qierPlayer && qierPlayer.el;
            if (!root) return false;
            const volume = root.querySelector('.qier-player_controller_volume');
            if (!volume) return false;
            const row = volume.parentElement;
            if (!row) return false;

            const liveBtn = document.createElement('button');
            liveBtn.id = 'liveBtn';
            const liveDot = document.createElement('span');
            liveDot.id = 'liveBtn_dot';
            const liveLabelEl = document.createElement('span');
            liveBtn.appendChild(liveDot);
            liveBtn.appendChild(liveLabelEl);
            setLiveBtn(liveBtn);
            setLiveDot(liveDot);
            setLiveLabelEl(liveLabelEl);
            updateLiveBadge();

            const sourceBtn = document.createElement('button');
            sourceBtn.id = 'sourceBtn';
            const srcIcon = document.createElement('i');
            srcIcon.className = 'bi bi-diagram-3';
            sourceBtn.appendChild(srcIcon);
            sourceBtn.title = '选择线路';
            const sourceLabelEl = document.createElement('span');
            sourceLabelEl.style.display = 'none';
            sourceBtn.appendChild(sourceLabelEl);
            setSourceBtn(sourceBtn);
            setSourceLabelEl(sourceLabelEl);
            sourceBtn.addEventListener('mouseenter', function (e) {
                e.stopPropagation();
                showSourcePanel();
            });
            sourceBtn.addEventListener('mouseleave', function () {
                setTimeout(function () {
                    const panel = getSourcePanel();
                    const btn = getSourceBtn();
                    if (!panel || !btn) return;
                    if (!panel.matches(':hover') && !btn.matches(':hover')) {
                        hideSourcePanel();
                    }
                }, 80);
            });

            row.insertBefore(sourceBtn, volume);
            row.insertBefore(liveBtn, sourceBtn);
            const sourcePanel = document.createElement('div');
            sourcePanel.id = 'sourcePanel';
            sourcePanel.className = 'qier-player_popover_panel';
            sourcePanel.addEventListener('mouseleave', function () {
                hideSourcePanel();
            });
            sourceBtn.appendChild(sourcePanel);
            setSourcePanel(sourcePanel);
            renderSourceList();
            return true;
        }

        return {
            ensureSourceUi: ensureSourceUi,
            renderSourceList: renderSourceList,
            showSourcePanel: showSourcePanel,
            hideSourcePanel: hideSourcePanel
        };
    };
})();
