from django.conf import settings
from django.http import HttpResponse


class PublicShieldCorsMiddleware:
    """Allow any origin to reach the customer-facing shield endpoints.

    The anti-bot script runs on customer sites and POSTs JSON to these paths,
    which makes every call cross-origin with a preflight. CORS_ALLOWED_ORIGINS
    lists only VeriClick's own domains, so the browser silently dropped every
    request — no telemetry ever arrived from a protected site and dashboards
    stayed empty.

    Origin is not the security boundary here: these endpoints authenticate on
    api_key / install_token and are declared AllowAny by design. The dashboard
    API keeps the strict allowlist, which is why this is scoped by path rather
    than loosening the global setting.
    """

    PUBLIC_PREFIXES = ('/api/shield/', '/api/shield.js', '/api/tracker/event/')
    ALLOW_HEADERS = 'content-type, accept'
    ALLOW_METHODS = 'GET, POST, OPTIONS'

    def __init__(self, get_response):
        self.get_response = get_response

    def _is_public(self, path):
        return path.startswith(self.PUBLIC_PREFIXES)

    def __call__(self, request):
        if not self._is_public(request.path):
            return self.get_response(request)

        # Answer the preflight here; it never needs to reach a view.
        if request.method == 'OPTIONS':
            response = HttpResponse(status=200)
        else:
            response = self.get_response(request)

        # No credentials are sent, so a wildcard origin is both valid and the
        # only workable answer for an unbounded set of customer domains.
        response['Access-Control-Allow-Origin'] = '*'
        response['Access-Control-Allow-Methods'] = self.ALLOW_METHODS
        response['Access-Control-Allow-Headers'] = self.ALLOW_HEADERS
        response['Access-Control-Max-Age'] = '86400'
        return response


class TLSFingerprintMiddleware:
    """Extract JA4 TLS fingerprint from Caddy proxy header and validate consistency."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        ja4 = request.META.get('HTTP_X_JA4', '')
        ja3 = request.META.get('HTTP_X_JA3', '')
        ua = request.META.get('HTTP_USER_AGENT', '')

        request.ja4_hash = ja4
        request.tls_risk_score = 0.0

        if ja4:
            risk = 0.0

            if 'Chrome' in ua and not any(ja4.startswith(p) for p in ['t13d151', 't12d151']):
                risk += 0.4
            elif 'Firefox' in ua and not ja4.startswith('t13d19'):
                risk += 0.3
            elif 'Safari' in ua and not any(ja4.startswith(p) for p in ['t13d16', 't12d16']):
                risk += 0.3

            if any(ja4.startswith(p) for p in ['t10_', 't11_']):
                risk += 0.5

            if not ja4.endswith('h2') and not ja4.endswith('h3'):
                risk += 0.2

            request.tls_risk_score = min(risk, 1.0)

        response = self.get_response(request)
        return response
