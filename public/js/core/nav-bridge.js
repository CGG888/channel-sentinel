(function () {
  const core = (window.IptvCore = window.IptvCore || {});

  function openResultsSettings(action) {
    try {
      localStorage.setItem('openSettingsAction', action || 'app');
    } catch (e) {}
    window.location.href = '/results';
  }

  core.nav = {
    openResultsSettings
  };
})();
