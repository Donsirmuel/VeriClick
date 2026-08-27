(function () {
  var installToken = null;
  var apiKey = null;

  // 1. Find our own <script> tag and read data-token / data-api-key.
  var scripts = document.getElementsByTagName('script');
  for (var i = 0; i < scripts.length; i++) {
    var src = (scripts[i].src || '').split('?')[0];
    if (/shield\.js$/i.test(src)) {
      installToken = scripts[i].getAttribute('data-token');
      apiKey = scripts[i].getAttribute('data-api-key');
      break;
    }
  }

  // 2. Fallback: global config object set by auto_prepend or an inline script.
  if (!installToken && !apiKey && window._vericlickConfig) {
    installToken = window._vericlickConfig.token || null;
    apiKey = window._vericlickConfig.apiKey || null;
  }

  // 3. Fallback: <meta name="vericlick-api-key" content="..."> tag.
  if (!installToken && !apiKey) {
    var meta = document.querySelector('meta[name="vericlick-api-key"]');
    if (meta) apiKey = meta.getAttribute('content');
  }

  if (!installToken && !apiKey) return;

  var API = '__API_BASE_URL__';
  var started = Date.now();
  var moves = 0;
  var clicks = 0;
  var maxScroll = 0;
  var idleTimer = null;
  var sent = false;
  var verifyResult = null;

  var canvasHash = '';
  var mousePoints = [];
  var MAX_MOUSE_POINTS = 500;
  var clickTimestamps = [];

  function scrollDepth() {
    var doc = document.documentElement;
    var h = doc.scrollHeight - doc.clientHeight;
    return h > 0 ? Math.round(((window.pageYOffset || doc.scrollTop) / h) * 100) : 0;
  }

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

      var textLen = textData.length;
      var geoLen = geoData.length;
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

  function collectHeadlessSignals() {
    var signals = {};
    try { signals.webdriver = !!navigator.webdriver; } catch (e) { signals.webdriver = false; }
    try { signals.chrome = !!window.chrome; } catch (e) { signals.chrome = false; }
    try { signals.plugin_count = navigator.plugins ? navigator.plugins.length : 0; } catch (e) { signals.plugin_count = 0; }
    try {
      signals.notification_permission = typeof Notification !== 'undefined' ? Notification.permission : 'unavailable';
    } catch (e) { signals.notification_permission = 'unavailable'; }
    try {
      signals.languages_consistent = navigator.languages && navigator.languages.length > 0;
    } catch (e) { signals.languages_consistent = false; }
    return signals;
  }

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

      if (dist > 300 && dt < 10) teleportCount++;

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

    var meanSpeed = 0;
    for (var i = 0; i < speeds.length; i++) meanSpeed += speeds[i];
    meanSpeed = speeds.length > 0 ? meanSpeed / speeds.length : 0;
    var speedVar = 0;
    for (var i = 0; i < speeds.length; i++) {
      speedVar += (speeds[i] - meanSpeed) * (speeds[i] - meanSpeed);
    }
    speedVar = speeds.length > 0 ? Math.sqrt(speedVar / speeds.length) : 0;
    var speedCV = meanSpeed > 0 ? speedVar / meanSpeed : 0;

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
    var headless = collectHeadlessSignals();

    var payload = {
      api_key: apiKey,
      install_token: installToken,
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
        canvas_hash: canvasHash,
        trajectory: trajectory,
        click_metrics: clickMetrics,
        headless: headless
      },
      engagement: {
        moves: moves,
        clicks: clicks,
        scroll_depth: maxScroll,
        time_on_page: Math.round((Date.now() - started) / 1000)
      }
    };
    if (verifyResult) {
      payload.verdict = verifyResult.verdict || '';
      payload.is_bot = !!verifyResult.is_bot;
      payload.reason = verifyResult.reason || '';
    }
    return payload;
  }

  function send() {
    if (sent) return;
    sent = true;
    var endpoint = API + 'shield/telemetry/';
    var body = JSON.stringify(buildPayload());
    if (navigator.sendBeacon) {
      if (navigator.sendBeacon(endpoint, new Blob([body], { type: 'application/json' }))) return;
    }
    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: body,
      keepalive: true
    });
  }

  function scheduleSend() {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(send, 3000);
  }

  function run() {
    canvasHash = computeCanvasHash();

    document.addEventListener('mousemove', function (e) {
      moves++;
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
    // Record quiet page views too; waiting for interaction meant visitors who
    // only read a page never appeared in analytics.
    scheduleSend();
  }

  function showBlockPage(reasonLabel, botAction) {
    if (botAction === 'honeypot') {
      window.location.href = 'https://google.com';
      return;
    }
    if (botAction === 'log') {
      return;
    }
    var overlay = document.createElement('div');
    overlay.style.cssText =
      'position:fixed;top:0;left:0;width:100%;height:100%;z-index:2147483647;' +
      'background:#ffffff;display:flex;align-items:center;justify-content:center;' +
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;';
    var box = document.createElement('div');
    box.style.cssText = 'text-align:center;max-width:420px;padding:24px;';
    box.innerHTML =
      '<div style="font-size:28px;margin-bottom:12px;">&#128274;</div>' +
      '<h1 style="font-size:20px;font-weight:700;color:#0f172a;margin:0 0 8px;">Access restricted</h1>' +
      '<p style="font-size:14px;color:#64748b;margin:0;">' +
      (reasonLabel || 'This visit was restricted by the site\'s protection.') +
      '</p>';
    overlay.appendChild(box);
    document.documentElement.appendChild(overlay);
  }

  // --- Proof-of-Work challenge ---
  function solvePow(challenge, callback) {
    var challengeBytes = new Uint8Array(challenge.challengeHex.match(/.{1,2}/g).map(function(b) { return parseInt(b, 16); }));
    var difficulty = challenge.difficulty;
    var serverNonce = challenge.nonce;

    // Try up to 10M nonces, then give up
    for (var nonce = 0; nonce < 10000000; nonce++) {
      var nonceBytes = new Uint8Array(4);
      nonceBytes[0] = nonce & 0xff;
      nonceBytes[1] = (nonce >> 8) & 0xff;
      nonceBytes[2] = (nonce >> 16) & 0xff;
      nonceBytes[3] = (nonce >> 24) & 0xff;

      var combined = new Uint8Array(challengeBytes.length + 4);
      combined.set(challengeBytes);
      combined.set(nonceBytes, challengeBytes.length);

      // Use SubtleCrypto for SHA-256
      // But SubtleCrypto is async — we batch and check periodically
      // For simplicity, use synchronous approach with pre-computed table
      // Actually, SubtleCrypto is the only available SHA-256 in browsers.
      // We use a chunked async approach.
      callback(null); // Signal to use async path
      return;
    }
  }

  function solvePowAsync(challenge, onSuccess, onFail) {
    var challengeBytes = new Uint8Array(challenge.challengeHex.match(/.{1,2}/g).map(function(b) { return parseInt(b, 16); }));
    var difficulty = challenge.difficulty;
    var serverNonce = challenge.nonce;
    var minAgeMs = challenge.minAgeMs || 1500;
    var startTime = Date.now();
    var batchSize = 5000;

    function tryBatch(startNonce) {
      // We can't do true sync SHA-256 in browsers, so we use SubtleCrypto
      // with batched promises. Each iteration is a full async SHA-256.
      var promises = [];
      for (var n = startNonce; n < startNonce + batchSize; n++) {
        var nonceBytes = new Uint8Array(4);
        nonceBytes[0] = n & 0xff;
        nonceBytes[1] = (n >> 8) & 0xff;
        nonceBytes[2] = (n >> 16) & 0xff;
        nonceBytes[3] = (n >> 24) & 0xff;

        var combined = new Uint8Array(challengeBytes.length + 4);
        combined.set(challengeBytes);
        combined.set(nonceBytes, challengeBytes.length);

        promises.push((function(nonce, bytes) {
          return crypto.subtle.digest('SHA-256', bytes).then(function(buf) {
            return { nonce: nonce, hash: Array.from(new Uint8Array(buf)).map(function(b) { return b.toString(16).padStart(2, '0'); }).join('') };
          });
        })(n, combined));
      }

      Promise.all(promises).then(function(results) {
        for (var i = 0; i < results.length; i++) {
          var r = results[i];
          // Check leading zero bits
          var leadingZeros = 0;
          for (var j = 0; j < r.hash.length; j++) {
            var c = r.hash[j];
            if (c === '0') { leadingZeros += 4; continue; }
            // Check individual bits
            var val = parseInt(c, 16);
            for (var bit = 3; bit >= 0; bit--) {
              if (val & (1 << bit)) break;
              leadingZeros++;
            }
            break;
          }

          if (leadingZeros >= difficulty) {
            var elapsed = Date.now() - startTime;
            var waitTime = Math.max(0, minAgeMs - elapsed);
            setTimeout(function() {
              onSuccess(r.nonce, r.hash, Date.now() - startTime);
            }, waitTime);
            return;
          }
        }

        // Continue with next batch
        if (startNonce + batchSize < 10000000) {
          setTimeout(function() { tryBatch(startNonce + batchSize); }, 0);
        } else {
          onFail();
        }
      });
    }

    tryBatch(0);
  }

  function doPowChallenge(verifyResult) {
    // The clearance cookie is HttpOnly, so only the server can confirm it.
    fetch(API + 'pow/challenge/', { credentials: 'include' })
      .then(function(resp) { return resp.json(); })
      .then(function(challenge) {
        if (!challenge || !challenge.challengeId) {
          run();
          return;
        }
        solvePowAsync(challenge,
          function(nonce, hash, solveTime) {
            // Submit solution
            fetch(API + 'pow/verify/', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({
                challengeId: challenge.challengeId,
                nonce: nonce,
                hash: hash,
                challengeNonce: challenge.nonce
              })
            })
              .then(function(resp) {
                if (!resp.ok) throw new Error('PoW verification failed');
                return resp.json();
              })
              .then(function() {
                // PoW solved; ask the server for the final decision.
                return fetch(API + 'shield/verify/', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  credentials: 'include',
                  body: JSON.stringify({
                    api_key: apiKey,
                    install_token: installToken,
                    page_url: window.location.href,
                    referrer: document.referrer
                  }),
                  keepalive: true
                });
              })
              .then(function(resp) {
                return resp.json().catch(function() { return null; });
              })
              .then(function(result) {
                if (result && result.verdict === 'block') {
                  showBlockPage(result.reason_label, result.bot_action);
                  return;
                }
                if (result && result.verdict === 'allow') {
                  verifyResult = result;
                }
                run();
              })
              .catch(function() { run(); });
          },
          function() {
            // Failed to solve — let through anyway (fail-open for usability)
            run();
          }
        );
      })
      .catch(function() {
        // Challenge fetch failed — proceed without PoW
        run();
      });
  }

  // Main flow: verify first, then handle verdict
  fetch(API + 'shield/verify/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      api_key: apiKey,
      install_token: installToken,
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
      if (result && result.verdict === 'block') {
        showBlockPage(result.reason_label, result.bot_action);
        return;
      }
      if (result && result.verdict === 'challenge') {
        // PoW challenge needed — solve it then re-verify
        doPowChallenge(result);
        return;
      }
      if (result && result.verdict === 'allow') {
        verifyResult = result;
      }
      run();
    });
})();
