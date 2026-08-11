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
