(function () {
  var siteId = null;
  var token = null;
  var shieldMode = false;
  var scripts = document.getElementsByTagName('script');
  for (var i = 0; i < scripts.length; i++) {
    if (/\/tracker\.js/.test(scripts[i].src || '')) {
      siteId = scripts[i].getAttribute('data-site');
      token = scripts[i].getAttribute('data-token');
      shieldMode = !!scripts[i].getAttribute('data-shield');
      break;
    }
  }
  if (!siteId) return;

  var API = '__API_BASE_URL__';
  var started = Date.now();
  var moves = 0;
  var clicks = 0;
  var maxScroll = 0;
  var idleTimer = null;
  var sent = false;
  // Shield verdict from the evaluate call (only set in data-shield mode). The
  // beacon carries it so the server records how the pageview was judged.
  var shieldResult = null;

  function scrollDepth() {
    var doc = document.documentElement;
    var h = doc.scrollHeight - doc.clientHeight;
    return h > 0 ? Math.round(((window.pageYOffset || doc.scrollTop) / h) * 100) : 0;
  }

  function buildPayload() {
    var payload = {
      site_id: siteId,
      token: token || '',
      page_url: window.location.href,
      referrer: document.referrer,
      signals: {
        user_agent: navigator.userAgent,
        language: navigator.language,
        cookies_enabled: navigator.cookieEnabled,
        timezone: (function () {
          try { return Intl.DateTimeFormat().resolvedOptions().timeZone; }
          catch (e) { return ''; }
        })(),
        touch_support: 'ontouchstart' in window,
        screen_depth: window.screen ? screen.colorDepth : null,
        plugins: navigator.plugins ? navigator.plugins.length : 0,
        viewport: { width: window.innerWidth, height: window.innerHeight }
      },
      engagement: {
        moves: moves,
        clicks: clicks,
        scroll_depth: maxScroll,
        time_on_page: Math.round((Date.now() - started) / 1000)
      }
    };
    if (shieldResult) {
      payload.verdict = shieldResult.verdict || '';
      payload.is_bot = !!shieldResult.isBot;
      payload.reason = shieldResult.reason || '';
    }
    return payload;
  }

  function send() {
    if (sent) return;
    sent = true;
    var endpoint = API + 'tracker/event/';
    var body = JSON.stringify(buildPayload());
    if (navigator.sendBeacon) {
      navigator.sendBeacon(endpoint, new Blob([body], { type: 'application/json' }));
    } else {
      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body,
        keepalive: true
      });
    }
  }

  function scheduleSend() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(send, 3000);
  }

  function run() {
    document.addEventListener('mousemove', function () { moves++; scheduleSend(); });
    document.addEventListener('scroll', function () {
      maxScroll = Math.max(maxScroll, scrollDepth());
      scheduleSend();
    }, { passive: true });
    document.addEventListener('click', function () { clicks++; scheduleSend(); });
    window.addEventListener('beforeunload', send);
    window.addEventListener('pagehide', send);
  }

  function showBlockPage(reasonLabel) {
    var overlay = document.createElement('div');
    overlay.style.cssText =
      'position:fixed;top:0;left:0;width:100%;height:100%;z-index:2147483647;' +
      'background:#ffffff;display:flex;align-items:center;justify-content:center;' +
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;';
    var box = document.createElement('div');
    box.style.cssText = 'text-align:center;max-width:420px;padding:24px;';
    box.innerHTML =
      '<div style="font-size:28px;margin-bottom:12px;">&#128274;</div>' +
      '<h1 style="font-size:20px;font-weight:700;color:#0f172a;margin:0 0 8px;">Traffic blocked</h1>' +
      '<p style="font-size:14px;color:#64748b;margin:0;">' +
      (reasonLabel || 'This visit was blocked by the site\'s traffic protection.') +
      '</p>';
    overlay.appendChild(box);
    document.documentElement.appendChild(overlay);
  }

  if (shieldMode) {
    // Site Shield: evaluate first, fail-open. If anything goes wrong (network,
    // server, missing fields) we treat the visitor as allowed and run the
    // normal tracker, so real visitors are never harmed by a flaky check.
    fetch(API + 'tracker/shield-evaluate/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        site_id: siteId,
        token: token || '',
        page_url: window.location.href,
        referrer: document.referrer
      }),
      keepalive: true
    })
      .then(function (resp) {
        return resp.json().catch(function () { return null; });
      })
      .catch(function () { return null; })
      .then(function (result) {
        if (result && result.verdict === 'blocked') {
          // The server already recorded the blocked pageview; no beacon needed.
          showBlockPage(result.reason_label);
          return;
        }
        if (result && result.verdict === 'allowed') {
          shieldResult = result;
        }
        run();
      });
  } else {
    run();
  }
})();
