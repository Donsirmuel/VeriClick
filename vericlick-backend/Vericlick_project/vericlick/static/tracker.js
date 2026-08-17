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
  var shieldResult = null;

  // Layer 1: Canvas fingerprint
  var canvasHash = '';

  // Layer 2: Mouse trajectory (buffered)
  var mousePoints = [];
  var MAX_MOUSE_POINTS = 500;
  var clickTimestamps = [];

  function scrollDepth() {
    var doc = document.documentElement;
    var h = doc.scrollHeight - doc.clientHeight;
    return h > 0 ? Math.round(((window.pageYOffset || doc.scrollTop) / h) * 100) : 0;
  }

  // Layer 1: Compute canvas fingerprint hash
  function computeCanvasHash() {
    try {
      var canvas = document.createElement('canvas');
      canvas.width = 240;
      canvas.height = 60;
      var ctx = canvas.getContext('2d');
      if (!ctx) return 'unsupported';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#f60';
      ctx.fillRect(100, 1, 62, 20);
      ctx.fillStyle = '#069';
      ctx.font = '11pt "Times New Roman"';
      ctx.fillText('Cwm fjordbank gly \u{1F603}', 2, 15);
      ctx.fillStyle = 'rgba(102, 204, 0, 0.2)';
      ctx.font = '18pt Arial';
      ctx.fillText('Cwm fjordbank gly \u{1F603}', 4, 45);

      var geoCanvas = document.createElement('canvas');
      geoCanvas.width = 122;
      geoCanvas.height = 110;
      var geoCtx = geoCanvas.getContext('2d');
      if (!geoCtx) return 'unsupported';
      geoCtx.globalCompositeOperation = 'multiply';
      var colors = [['#f2f', 40, 40], ['#2ff', 80, 40], ['#ff2', 60, 80]];
      for (var c = 0; c < colors.length; c++) {
        geoCtx.fillStyle = colors[c][0];
        geoCtx.beginPath();
        geoCtx.arc(colors[c][1], colors[c][2], 40, 0, Math.PI * 2, true);
        geoCtx.closePath();
        geoCtx.fill();
      }
      geoCtx.fillStyle = '#f9c';
      geoCtx.beginPath();
      geoCtx.arc(60, 60, 60, 0, Math.PI * 2, true);
      geoCtx.arc(60, 60, 20, 0, Math.PI * 2, true);
      geoCtx.fill('evenodd');

      var textData = canvas.toDataURL();
      var geoData = geoCanvas.toDataURL();

      // Hash both canvases and combine
      var textLen = textData.length;
      var geoLen = geoData.length;
      // Simple but fast hash: mix length + character codes
      var hash = 0;
      for (var i = 0; i < textLen; i++) {
        hash = ((hash << 5) - hash + textData.charCodeAt(i)) | 0;
      }
      for (var i = 0; i < geoLen; i++) {
        hash = ((hash << 5) - hash + geoData.charCodeAt(i)) | 0;
      }
      return 'cx_' + (hash >>> 0).toString(16);
    } catch (e) {
      return 'error';
    }
  }

  // Layer 2: Compute trajectory analysis metrics
  function computeTrajectoryMetrics() {
    var pts = mousePoints;
    if (pts.length < 10) {
      return { straightness: 1, speed_var: 0, curvature_entropy: 0, teleports: 0, event_count: pts.length };
    }

    var totalDist = 0;
    var speeds = [];
    var curvatures = [];
    var teleportCount = 0;
    var maxJump = 0;

    for (var i = 1; i < pts.length; i++) {
      var dx = pts[i].x - pts[i - 1].x;
      var dy = pts[i].y - pts[i - 1].y;
      var dist = Math.sqrt(dx * dx + dy * dy);
      var dt = pts[i].t - pts[i - 1].t;

      totalDist += dist;
      if (dt > 0) speeds.push(dist / dt);
      if (dist > maxJump) maxJump = dist;

      // Teleport: jump > 300px in < 10ms
      if (dist > 300 && dt < 10) teleportCount++;

      // Curvature: angle change between consecutive segments
      if (i >= 2) {
        var dx1 = pts[i - 1].x - pts[i - 2].x;
        var dy1 = pts[i - 1].y - pts[i - 2].y;
        var angle1 = Math.atan2(dy1, dx1);
        var angle2 = Math.atan2(dy, dx);
        curvatures.push(Math.abs(angle2 - angle1));
      }
    }

    var first = pts[0];
    var last = pts[pts.length - 1];
    var straightLine = Math.sqrt(
      (last.x - first.x) * (last.x - first.x) + (last.y - first.y) * (last.y - first.y)
    );
    var straightness = straightLine > 0 ? Math.min(totalDist / straightLine, 3) : 1;

    // Speed variance (coefficient of variation)
    var meanSpeed = 0;
    for (var i = 0; i < speeds.length; i++) meanSpeed += speeds[i];
    meanSpeed = speeds.length > 0 ? meanSpeed / speeds.length : 0;
    var speedVar = 0;
    for (var i = 0; i < speeds.length; i++) {
      speedVar += (speeds[i] - meanSpeed) * (speeds[i] - meanSpeed);
    }
    speedVar = speeds.length > 0 ? Math.sqrt(speedVar / speeds.length) : 0;
    var speedCV = meanSpeed > 0 ? speedVar / meanSpeed : 0;

    // Curvature entropy (histogram-based)
    var bins = new Array(10).fill(0);
    for (var i = 0; i < curvatures.length; i++) {
      var bin = Math.min(Math.floor(curvatures[i] / (Math.PI / 10)), 9);
      bins[bin]++;
    }
    var entropy = 0;
    var totalCurv = curvatures.length || 1;
    for (var i = 0; i < bins.length; i++) {
      if (bins[i] > 0) {
        var p = bins[i] / totalCurv;
        entropy -= p * Math.log2(p);
      }
    }

    return {
      straightness: Math.round(straightness * 1000) / 1000,
      speed_var: Math.round(speedCV * 1000) / 1000,
      curvature_entropy: Math.round(entropy * 1000) / 1000,
      teleports: teleportCount,
      event_count: pts.length,
      max_jump: Math.round(maxJump)
    };
  }

  // Layer 2: Compute click timing metrics
  function computeClickMetrics() {
    var times = clickTimestamps;
    if (times.length < 2) return { dwell_avg: 0, timing_var: 0, click_count: times.length };

    var intervals = [];
    for (var i = 1; i < times.length; i++) {
      intervals.push(times[i] - times[i - 1]);
    }

    var mean = 0;
    for (var i = 0; i < intervals.length; i++) mean += intervals[i];
    mean = intervals.length > 0 ? mean / intervals.length : 0;
    var variance = 0;
    for (var i = 0; i < intervals.length; i++) {
      variance += (intervals[i] - mean) * (intervals[i] - mean);
    }
    var stdDev = intervals.length > 0 ? Math.sqrt(variance / intervals.length) : 0;
    var timingVar = mean > 0 ? stdDev / mean : 0;

    return {
      dwell_avg: Math.round(mean),
      timing_var: Math.round(timingVar * 1000) / 1000,
      click_count: times.length
    };
  }

  function buildPayload() {
    var trajectory = computeTrajectoryMetrics();
    var clickMetrics = computeClickMetrics();

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
        viewport: { width: window.innerWidth, height: window.innerHeight },
        // Layer 1
        canvas_hash: canvasHash,
        // Layer 2
        trajectory: trajectory,
        click_metrics: clickMetrics
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
    // Layer 1: Compute canvas fingerprint once on load
    canvasHash = computeCanvasHash();

    document.addEventListener('mousemove', function (e) {
      moves++;
      // Layer 2: Record mouse trajectory (buffered to prevent memory leak)
      if (mousePoints.length < MAX_MOUSE_POINTS) {
        mousePoints.push({ x: e.clientX, y: e.clientY, t: e.timeStamp });
      }
      scheduleSend();
    });
    document.addEventListener('scroll', function () {
      maxScroll = Math.max(maxScroll, scrollDepth());
      scheduleSend();
    }, { passive: true });
    document.addEventListener('click', function (e) {
      clicks++;
      clickTimestamps.push(e.timeStamp);
      scheduleSend();
    });
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
