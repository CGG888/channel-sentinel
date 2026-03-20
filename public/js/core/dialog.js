(function () {
  const core = (window.IptvCore = window.IptvCore || {});

  function alertInfo(message) {
    window.alert(message || '');
  }

  function confirmAction(message) {
    return window.confirm(message || '确认继续操作吗？');
  }

  core.dialog = {
    alertInfo,
    confirmAction
  };
})();
