(function () {
  var siteId = null;
  var scripts = document.getElementsByTagName('script');
  for (var i = 0; i < scripts.length; i++) {
    if (/\/tracker\.js/.test(scripts[i].src || '')) {
      siteId = scripts[i].getAttribute('data-site');
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

  function scrollDepth() {
    var doc = document.documentElement;
    var h = doc.scrollHeight - doc.clientHeight;
    return h > 0 ? Math.round(((window.pageYOffset || doc.scrollTop) / h) * 100) : 0;
  }

  function buildPayload() {
    return {
      site_id: siteId,
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

  document.addEventListener('mousemove', function () { moves++; scheduleSend(); });
  document.addEventListener('scroll', function () {
    maxScroll = Math.max(maxScroll, scrollDepth());
    scheduleSend();
  }, { passive: true });
  document.addEventListener('click', function () { clicks++; scheduleSend(); });
  window.addEventListener('beforeunload', send);
  window.addEventListener('pagehide', send);
})();
