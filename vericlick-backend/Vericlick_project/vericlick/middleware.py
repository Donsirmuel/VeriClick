from django.conf import settings


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
