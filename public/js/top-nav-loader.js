(function () {
  function getNavHeightKey(mode) {
    const m = mode === 'off' ? 'off' : 'on';
    return 'iptv:top-nav-height:' + m;
  }

  function getNavPlaceholderHeight(mode) {
    const key = getNavHeightKey(mode);
    try {
      const v = Number(localStorage.getItem(key) || 0);
      if (Number.isFinite(v) && v >= 40) return v;
    } catch (e) {}
    return 56;
  }

  function reserveNavSpace(mount, mode) {
    if (!mount) return;
    const h = getNavPlaceholderHeight(mode);
    mount.style.minHeight = h + 'px';
  }

  function syncNavSpace(mount, mode) {
    if (!mount) return;
    const nav = mount.firstElementChild;
    if (!nav) return;
    const h = Math.ceil(nav.getBoundingClientRect().height || 0);
    if (!h || h < 40) return;
    mount.style.minHeight = h + 'px';
    try {
      localStorage.setItem(getNavHeightKey(mode), String(h));
    } catch (e) {}
  }

  function initNavDropdowns(mount, retryCount) {
    if (!mount) return;
    const toggles = Array.from(mount.querySelectorAll('[data-bs-toggle="dropdown"]'));
    if (!toggles.length) return;
    const bs = window.bootstrap && window.bootstrap.Dropdown ? window.bootstrap : null;
    if (!bs) {
      const next = Number(retryCount || 0) + 1;
      if (next <= 8) {
        setTimeout(function () {
          initNavDropdowns(mount, next);
        }, 60);
      }
      return;
    }
    for (const btn of toggles) {
      try {
        bs.Dropdown.getOrCreateInstance(btn);
      } catch (e) {}
    }
  }

  function setActiveLink(mount, page) {
    if (!mount || !page) return;
    const link = mount.querySelector('[data-nav-link="' + page + '"]');
    if (link) {
      link.classList.remove('btn-outline-secondary');
      link.classList.add('btn-secondary');
    }
  }

  function setSettingsMode(mount, mode) {
    const group = mount ? mount.querySelector('#topSettingsGroup') : null;
    if (!group) return;
    if (mode === 'off') {
      group.classList.add('d-none');
    }
  }

  function ensureLogout() {
    if (typeof window.doLogout === 'function') return window.doLogout;
    return async function () {
      const logoutUrl = '/api/auth/logout';
      try {
        if (window.IptvCore && window.IptvCore.api && typeof window.IptvCore.api.request === 'function') {
          await window.IptvCore.api.request(logoutUrl, { method: 'POST' });
        } else {
          await fetch(logoutUrl, { method: 'POST' });
        }
      } catch (e) {}
      window.location.replace('/login.html');
    };
  }

  function bindUserMenu(mount) {
    const logoutAction = ensureLogout();
    mount.addEventListener('click', function (event) {
      const target = event.target ? event.target.closest('[data-nav-action]') : null;
      if (!target) return;
      const action = target.getAttribute('data-nav-action');
      if (action === 'logout') {
        event.preventDefault();
        logoutAction();
      }
    });

    const changePwdItem = mount.querySelector('[data-nav-action="change-password"]');
    if (changePwdItem && !document.getElementById('changePwdModal')) {
      changePwdItem.parentElement.style.display = 'none';
    }
  }

  function bindCommonMenu(mount) {
    function bindJump(btnId, action) {
      const btn = mount ? mount.querySelector('#' + btnId) : null;
      if (!btn) return;
      btn.onclick = function () {
        if (window.IptvCore && window.IptvCore.nav && typeof window.IptvCore.nav.openResultsSettings === 'function') {
          window.IptvCore.nav.openResultsSettings(action);
          return;
        }
        try {
          localStorage.setItem('openSettingsAction', action);
        } catch (e) {}
        window.location.href = '/results';
      };
    }
    bindJump('settingsAppBtn', 'app');
    bindJump('settingsFccBtn', 'fcc');
    bindJump('settingsGroupBtn', 'group');
    bindJump('settingsLogoBtn', 'logo');
    bindJump('settingsProxyBtn', 'proxy');
    bindJump('settingsApiBtn', 'api');
    bindJump('settingsEpgBtn', 'epg');
    bindJump('settingsReplayRulesBtn', 'replayRules');
    bindJump('settingsWebdavBtn', 'webdav');
  }

  function syncUserName(mount, username) {
    if (!mount) return;
    const userDisplay = mount.querySelector('#userDisplay');
    if (userDisplay) userDisplay.textContent = username || 'Admin';
  }

  async function loadTopNav() {
    const mount = document.getElementById('topNavMount');
    if (!mount) return;
    const body = document.body || {};
    const settingsMode = body.getAttribute('data-nav-settings') || 'off';
    reserveNavSpace(mount, settingsMode);
    try {
      let html = '';
      if (window.IptvCore && window.IptvCore.api && typeof window.IptvCore.api.request === 'function') {
        const resp = await window.IptvCore.api.request('/top-nav.html?_t=' + Date.now());
        if (!resp || !resp.ok) return;
        html = String(resp.data || '');
      } else {
        const resp = await fetch('/top-nav.html?_t=' + Date.now(), { cache: 'no-store' });
        if (!resp.ok) return;
        html = await resp.text();
      }
      mount.innerHTML = html;
      initNavDropdowns(mount, 0);
      syncNavSpace(mount, settingsMode);
      setActiveLink(mount, body.getAttribute('data-nav-page') || '');
      setSettingsMode(mount, body.getAttribute('data-nav-settings') || 'off');
      bindUserMenu(mount);
      bindCommonMenu(mount);
      if (window.IptvTheme && typeof window.IptvTheme.initAll === 'function') {
        window.IptvTheme.initAll();
      }
      if (window.currentUser) syncUserName(mount, window.currentUser);
      window.setTopNavUser = function (username) {
        syncUserName(mount, username);
      };
      document.addEventListener('iptv:user-ready', function (event) {
        const username = event && event.detail ? event.detail.username : '';
        syncUserName(mount, username);
      });
      document.dispatchEvent(new CustomEvent('iptv:top-nav-ready'));
    } catch (e) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadTopNav);
  } else {
    loadTopNav();
  }
})();
