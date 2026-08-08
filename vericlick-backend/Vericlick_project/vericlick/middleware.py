from django.conf import settings

from .models import DomainRegistry, tracking_host


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
                matches = host in self.INTERNAL_HOSTS or any(
                    d.domain == host or tracking_host(d.domain) == host
                    for d in DomainRegistry.objects.only('domain').iterator()
                )
                if matches:
                    allowed = list(settings.ALLOWED_HOSTS)
                    allowed.append(host)
                    settings.ALLOWED_HOSTS = allowed
            except Exception:
                pass
        return self.get_response(request)
