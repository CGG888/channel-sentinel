(function () {
  const core = (window.IptvCore = window.IptvCore || {});

  async function request(url, options) {
    const opts = options || {};
    const method = opts.method || 'GET';
    const headers = Object.assign({}, opts.headers || {});
    const body = opts.body;
    const fetchOptions = Object.assign({}, opts, { method, headers });
    if (body !== undefined) {
      if (!headers['Content-Type'] && !(body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
      }
      fetchOptions.body = headers['Content-Type'] === 'application/json' && typeof body !== 'string' ? JSON.stringify(body) : body;
    }
    const r = await fetch(url, fetchOptions);
    const contentType = r.headers.get('content-type') || '';
    let data = null;
    if (contentType.includes('application/json')) {
      data = await r.json();
    } else {
      data = await r.text();
    }
    return { ok: r.ok, status: r.status, data };
  }

  core.api = { request };
})();
