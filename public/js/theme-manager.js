(function () {
    const THEME_KEY = 'iptv:theme';
    const listeners = [];

    function normalizeTheme(theme) {
        return theme === 'dark' ? 'dark' : 'light';
    }

    function getSystemTheme() {
        try {
            return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        } catch (e) {
            return 'light';
        }
    }

    function getStoredTheme() {
        try {
            const v = localStorage.getItem(THEME_KEY);
            if (v === 'dark' || v === 'light') return v;
            return '';
        } catch (e) {
            return '';
        }
    }

    function getTheme() {
        const stored = getStoredTheme();
        if (stored === 'dark' || stored === 'light') {
            return stored;
        }
        return getSystemTheme();
    }

    function setHtmlTheme(theme) {
        const next = normalizeTheme(theme);
        document.documentElement.setAttribute('data-theme', next);
        document.documentElement.style.colorScheme = next;
        return next;
    }

    function notify(theme) {
        for (const fn of listeners) {
            try {
                fn(theme);
            } catch (e) {}
        }
        try {
            window.dispatchEvent(new CustomEvent('iptv-theme-change', { detail: { theme } }));
        } catch (e) {}
    }

    function applyTheme(theme) {
        const next = setHtmlTheme(theme);
        try {
            localStorage.setItem(THEME_KEY, next);
        } catch (e) {}
        notify(next);
        return next;
    }

    function toggleTheme() {
        const current = document.documentElement.getAttribute('data-theme') || getTheme();
        return applyTheme(current === 'dark' ? 'light' : 'dark');
    }

    function applyButtonState(button, theme) {
        if (!button) return;
        const dark = theme === 'dark';
        const icon = dark ? 'bi bi-sun me-1' : 'bi bi-moon me-1';
        const text = dark ? '浅色' : '深色';
        button.innerHTML = '<i class="' + icon + '"></i>' + text;
        button.setAttribute('aria-label', '切换主题');
        button.setAttribute('title', dark ? '切换为浅色' : '切换为深色');
    }

    function initToggle(buttonOrId) {
        const button = typeof buttonOrId === 'string'
            ? document.getElementById(buttonOrId)
            : buttonOrId;
        if (!button) return null;
        const firstTheme = setHtmlTheme(document.documentElement.getAttribute('data-theme') || getTheme());
        applyButtonState(button, firstTheme);
        button.onclick = function () {
            const next = toggleTheme();
            applyButtonState(button, next);
        };
        const onTheme = function (theme) {
            applyButtonState(button, theme);
        };
        listeners.push(onTheme);
        return button;
    }

    function initAll(selector) {
        const nodes = Array.from(document.querySelectorAll(selector || '[data-theme-toggle]'));
        const current = setHtmlTheme(document.documentElement.getAttribute('data-theme') || getTheme());
        for (const node of nodes) {
            initToggle(node);
            applyButtonState(node, current);
        }
        return nodes.length;
    }

    try {
        setHtmlTheme(document.documentElement.getAttribute('data-theme') || getTheme());
    } catch (e) {}

    window.addEventListener('storage', function (e) {
        if (e && e.key === THEME_KEY) {
            const next = normalizeTheme(e.newValue || getSystemTheme());
            setHtmlTheme(next);
            notify(next);
        }
    });

    window.IptvTheme = {
        getTheme,
        applyTheme,
        toggleTheme,
        initToggle,
        initAll
    };
})();
