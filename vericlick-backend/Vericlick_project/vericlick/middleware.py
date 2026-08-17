from django.conf import settings

from .models import DomainRegistry


class RegisteredDomainHostMiddleware:
    # Allows requests whose Host header matches a registered custom tracking
    # domain, so visiting https://your-domain/r/<slug>/ reaches Django instead
    # of being rejected with a 400 Bad Request by the ALLOWED_HOSTS check.
    # Also allows the internal 'backend' hostname used by the on-demand TLS
    # ask endpoint (Caddy asks backend:8000 directly inside the Docker net).
    #
    # An apex domain (e.g. example.com) cannot hold a CNAME record, so its
    # branded links are served on the `t.` tracking subdomain
    # (t.example.com). A request Host of t.example.com must therefore be
    # accepted when example.com is registered — the same rule the on-demand
    # TLS gate uses.
    #
    # (Django 6 removed support for callable ALLOWED_HOSTS entries, so the
    # registered-domains lookup happens here, per request, instead.)
    INTERNAL_HOSTS = ('backend', 'db', 'localhost')

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        host = (request.META.get('HTTP_HOST') or '').split(':')[0].strip().lower()
        if host and host not in settings.ALLOWED_HOSTS:
            try:
                if host in self.INTERNAL_HOSTS:
                    matches = True
                else:
                    # Candidate registered domains for this request Host. A
                    # subdomain registration keeps its own name, so the Host
                    # itself is always a candidate. A `t.` host can also be the
                    # tracking subdomain of a 2-label apex registration
                    # (t.example.com -> example.com), so that apex is checked too.
                    candidates = [host]
                    if host.startswith('t.'):
                        apex = host[2:]
                        if apex.count('.') == 1:
                            candidates.append(apex)
                    matches = DomainRegistry.objects.filter(
                        removed_at__isnull=True, domain__in=candidates
                    ).exists()
                if matches:
                    allowed = list(settings.ALLOWED_HOSTS)
                    allowed.append(host)
                    settings.ALLOWED_HOSTS = allowed
            except Exception:
                pass
        return self.get_response(request)


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

            # Check if JA4 matches claimed browser
            if 'Chrome' in ua and not any(ja4.startswith(p) for p in ['t13d151', 't12d151']):
                risk += 0.4
            elif 'Firefox' in ua and not ja4.startswith('t13d19'):
                risk += 0.3
            elif 'Safari' in ua and not any(ja4.startswith(p) for p in ['t13d16', 't12d16']):
                risk += 0.3

            # Non-browser TLS stack
            if any(ja4.startswith(p) for p in ['t10_', 't11_']):
                risk += 0.5

            # No HTTP/2 ALPN (real browsers always negotiate h2)
            if not ja4.endswith('h2') and not ja4.endswith('h3'):
                risk += 0.2

            request.tls_risk_score = min(risk, 1.0)

        response = self.get_response(request)
        return response
