(function () {
  const ns = (window.IptvCore = window.IptvCore || {});
  const logs = (ns.logs = ns.logs || {});

  function escapeHtml(v) {
    return String(v || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function formatPercent(v) {
    const n = Number(v || 0);
    return (n * 100).toFixed(2) + '%';
  }

  function asBadgeClass(ok) {
    return ok ? 'text-bg-success' : 'text-bg-danger';
  }

  function getDriftState(trend) {
    const t = trend || {};
    const reason = String(t.calibrationReason || '');
    const ready = !!t.calibrationReady;
    if (ready) return { text: 'ready', cls: 'text-bg-success' };
    if (/history-not-enough/i.test(reason)) return { text: 'warming', cls: 'text-bg-warning' };
    if (reason) return { text: 'drift', cls: 'text-bg-danger' };
    return { text: 'warming', cls: 'text-bg-secondary' };
  }

  function renderSummary(data) {
    const sumEl = document.getElementById('moduleHealthSummary');
    const sourceEl = document.getElementById('moduleHealthGateSource');
    const trendEl = document.getElementById('moduleHealthTrendSummary');
    const exEl = document.getElementById('moduleHealthExceptionSummary');
    if (!sumEl || !sourceEl) return;
    const reg = data && data.registry ? data.registry : {};
    const gate = data && data.gate ? data.gate : {};
    const ex = data && data.exceptions ? data.exceptions : {};
    const trend = data && data.trend ? data.trend : {};
    const regText = '注册 ' + Number(reg.registered || 0) + '/' + Number(reg.total || 0);
    const gateText = '门禁 ' + Number(gate.passed || 0) + '/' + Number(gate.total || 0);
    const exText = '异常 ' + Number(ex.openIncidents || 0);
    sumEl.textContent = regText + ' ｜ ' + gateText + ' ｜ ' + exText;
    sourceEl.textContent = gate && gate.source ? String(gate.source) : '--';
    if (trendEl) {
      const w = Number(trend.windowRuns || 0);
      const p = formatPercent(trend.p90FailRate || 0);
      const driftInfo = getDriftState(trend);
      const driftMsg = trend.calibrationReason ? (' ｜ 漂移: ' + String(trend.calibrationReason)) : '';
      trendEl.innerHTML = '窗口 ' + w + ' ｜ P90失败率 ' + p + ' ｜ <span class="badge ' + driftInfo.cls + '">' + driftInfo.text + '</span>' + escapeHtml(driftMsg);
    }
    if (exEl) {
      const top = Number(ex.errorDomains || 0);
      const all = Number(ex.error5xxTotal || 0);
      exEl.textContent = '5xx域 ' + top + ' ｜ 5xx总数 ' + all;
    }
  }

  function renderRows(data) {
    const body = document.getElementById('moduleHealthBody');
    if (!body) return;
    const reg = data && data.registry ? data.registry : {};
    const modules = Array.isArray(reg.modules) ? reg.modules : [];
    const missings = modules.filter(function (x) { return !x.registered; });
    const list = missings.length ? missings : modules.slice(0, 8);
    if (!list.length) {
      body.innerHTML = '<tr><td colspan="4" class="text-secondary">暂无数据</td></tr>';
      return;
    }
    body.innerHTML = list.map(function (x) {
      const ok = !!x.registered;
      const st = ok ? '已注册' : '缺失';
      const updatedAt = x.updatedAt ? new Date(x.updatedAt).toLocaleString() : '--';
      return '<tr>' +
        '<td>' + escapeHtml(x.id) + '</td>' +
        '<td><span class="badge ' + asBadgeClass(ok) + '">' + st + '</span></td>' +
        '<td><code>' + escapeHtml(x.file) + '</code></td>' +
        '<td>' + escapeHtml(updatedAt) + '</td>' +
      '</tr>';
    }).join('');
  }

  function renderGateState(data) {
    const el = document.getElementById('moduleHealthGateResult');
    if (!el) return;
    const gate = data && data.gate ? data.gate : {};
    const failed = Number(gate.failed || 0);
    const passRate = formatPercent(gate.passRate || 0);
    if (!Number(gate.total || 0)) {
      el.innerHTML = '<span class="badge text-bg-secondary">未采集</span>';
      return;
    }
    const cls = failed > 0 ? 'text-bg-danger' : 'text-bg-success';
    const text = failed > 0 ? ('失败 ' + failed) : ('通过率 ' + passRate);
    el.innerHTML = '<span class="badge ' + cls + '">' + text + '</span>';
  }

  function renderTrendRows(data) {
    const body = document.getElementById('moduleHealthTrendBody');
    if (!body) return;
    const trend = data && data.trend ? data.trend : {};
    const recent = Array.isArray(trend.recent) ? trend.recent : [];
    if (!recent.length) {
      body.innerHTML = '<tr><td colspan="4" class="text-secondary">暂无趋势数据</td></tr>';
      return;
    }
    body.innerHTML = recent.slice().reverse().map(function (x) {
      const ts = x.ts ? new Date(x.ts).toLocaleString() : '--';
      return '<tr>' +
        '<td>' + escapeHtml(ts) + '</td>' +
        '<td>' + escapeHtml(formatPercent(x.failRate || 0)) + '</td>' +
        '<td>' + escapeHtml(String(Number(x.failed || 0))) + '</td>' +
        '<td>' + escapeHtml(String(Number(x.contractFailed || 0))) + '</td>' +
      '</tr>';
    }).join('');
  }

  function renderExceptions(data) {
    const body = document.getElementById('moduleHealthExceptionBody');
    if (!body) return;
    const ex = data && data.exceptions ? data.exceptions : {};
    const list = Array.isArray(ex.openIncidentSamples) ? ex.openIncidentSamples : [];
    if (!list.length) {
      body.innerHTML = '<tr><td colspan="4" class="text-secondary">无未关闭事件</td></tr>';
      return;
    }
    body.innerHTML = list.map(function (x) {
      return '<tr>' +
        '<td>' + escapeHtml(x.domain || 'app') + '</td>' +
        '<td>' + escapeHtml(String(x.severity || '').toUpperCase()) + '</td>' +
        '<td>' + escapeHtml(x.id || '') + '</td>' +
        '<td>' + escapeHtml(x.summary || '') + '</td>' +
      '</tr>';
    }).join('');
  }

  function renderErrorDomainTop(data) {
    const body = document.getElementById('moduleHealthErrorDomainBody');
    if (!body) return;
    const ex = data && data.exceptions ? data.exceptions : {};
    const list = Array.isArray(ex.errorDomainTop) ? ex.errorDomainTop : [];
    if (!list.length) {
      body.innerHTML = '<tr><td colspan="4" class="text-secondary">无错误域</td></tr>';
      return;
    }
    body.innerHTML = list.map(function (x) {
      return '<tr>' +
        '<td>' + escapeHtml(x.domain || '') + '</td>' +
        '<td>' + escapeHtml(formatPercent(x.errorRate || 0)) + '</td>' +
        '<td>' + escapeHtml(String(Number(x.error5xx || 0))) + '</td>' +
        '<td>' + escapeHtml(String(Number(x.requests || 0))) + '</td>' +
      '</tr>';
    }).join('');
  }

  function renderThresholdCompare(data) {
    const body = document.getElementById('moduleHealthThresholdBody');
    const hint = document.getElementById('moduleHealthThresholdHint');
    if (!body) return;
    const trend = data && data.trend ? data.trend : {};
    const th = trend && trend.threshold ? trend.threshold : {};
    const base = th.base && typeof th.base === 'object' ? th.base : {};
    const recommended = th.recommended && typeof th.recommended === 'object' ? th.recommended : {};
    const applied = th.applied && typeof th.applied === 'object' ? th.applied : {};
    const alertSummary = th.alertSummary && typeof th.alertSummary === 'object' ? th.alertSummary : {};
    const keys = ['serviceCritical', 'smokeCritical', 'contractHigh', 'contractMedium'];
    const maxDrift = Number(th.maxDrift || 0);
    if (hint) {
      const a = Number(th.alpha || 0).toFixed(2);
      const m = Number(th.minRuns || 0);
      const d = Number(th.maxDrift || 0);
      const alertCount = Number(alertSummary.alertCount || 0);
      hint.textContent = 'alpha=' + a + ' ｜ minRuns=' + m + ' ｜ maxDrift=' + d + ' ｜ alerts=' + alertCount;
    }
    if (!keys.some(function (k) { return k in base || k in recommended || k in applied; })) {
      body.innerHTML = '<tr><td colspan="5" class="text-secondary">暂无阈值建议</td></tr>';
      return;
    }
    body.innerHTML = keys.map(function (k) {
      const b = Number(base[k] || 0);
      const r = Number(recommended[k] || 0);
      const a = Number(applied[k] || 0);
      const diff = r - a;
      const diffText = (diff > 0 ? '+' : '') + String(diff);
      const diffAbs = Math.abs(diff);
      const status = diffAbs > maxDrift ? '超阈' : (diffAbs > 0 ? '偏移' : '对齐');
      const diffCls = diffAbs > maxDrift ? 'text-bg-danger' : (diffAbs > 0 ? 'text-bg-warning' : 'text-bg-success');
      const suggest = diffAbs > maxDrift
        ? '<button class="btn btn-outline-danger btn-sm ms-2" data-threshold-suggest="1" data-threshold-key="' + escapeHtml(k) + '" data-threshold-diff="' + escapeHtml(String(diff)) + '" data-threshold-maxdrift="' + escapeHtml(String(maxDrift)) + '">建议建单</button>'
        : '';
      return '<tr>' +
        '<td>' + escapeHtml(k) + '</td>' +
        '<td>' + escapeHtml(String(b)) + '</td>' +
        '<td>' + escapeHtml(String(r)) + '</td>' +
        '<td>' + escapeHtml(String(a)) + '</td>' +
        '<td><span class="badge ' + diffCls + '">' + escapeHtml(diffText + ' ' + status) + '</span>' + suggest + '</td>' +
      '</tr>';
    }).join('');
  }

  logs.renderModuleHealth = function (data) {
    renderSummary(data);
    renderRows(data);
    renderGateState(data);
    renderTrendRows(data);
    renderExceptions(data);
    renderErrorDomainTop(data);
    renderThresholdCompare(data);
  };
})();
