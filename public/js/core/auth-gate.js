(function () {
  const core = (window.IptvCore = window.IptvCore || {});

  function buildLoginTarget() {
    const back = encodeURIComponent(location.pathname + location.search + location.hash);
    return '/login.html?redirect=' + back + '&_t=' + Date.now();
  }

  function redirectToLogin() {
    const target = buildLoginTarget();
    try {
      if (window.top && window.top !== window.self) {
        window.top.location.replace(target);
        return;
      }
    } catch (e) {}
    window.location.replace(target);
  }

  async function ensureAuth(options) {
    const opts = options || {};
    const onSuccess = typeof opts.onSuccess === 'function' ? opts.onSuccess : null;
    const onFail = typeof opts.onFail === 'function' ? opts.onFail : null;
    const removePendingClass = opts.removePendingClass !== false;
    const authCheckUrl = '/api/auth/check';
    try {
      let j = null;
      if (core.api && typeof core.api.request === 'function') {
        const resp = await core.api.request(authCheckUrl);
        j = resp && resp.data ? resp.data : null;
      } else {
        const r = await fetch(authCheckUrl);
        j = await r.json();
      }
      if (!j || !j.success) {
        if (onFail) onFail(j || null);
        redirectToLogin();
        return null;
      }
      if (removePendingClass) {
        document.documentElement.classList.remove('auth-pending');
      }
      if (j.username) {
        window.currentUser = j.username;
        if (typeof window.setTopNavUser === 'function') window.setTopNavUser(j.username);
        try {
          document.dispatchEvent(new CustomEvent('iptv:user-ready', { detail: { username: j.username } }));
        } catch (e) {}
      }
      if (onSuccess) onSuccess(j);
      return j;
    } catch (e) {
      if (onFail) onFail(null);
      redirectToLogin();
      return null;
    }
  }

  core.auth = {
    ensureAuth,
    redirectToLogin
  };
})();
