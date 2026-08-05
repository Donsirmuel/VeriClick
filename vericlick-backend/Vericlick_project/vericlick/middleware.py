from django.conf import settings

from .models import DomainRegistry


class RegisteredDomainHostMiddleware:
    # Allows requests whose Host header matches a registered custom tracking
    # domain, so visiting https://your-domain/r/<slug>/ reaches Django instead
    # of being rejected with a 400 Bad Request by the ALLOWED_HOSTS check.
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        host = (request.META.get('HTTP_HOST') or '').split(':')[0].strip().lower()
        if host and host not in settings.ALLOWED_HOSTS:
            try:
                if DomainRegistry.objects.filter(domain=host).exists():
                    allowed = list(settings.ALLOWED_HOSTS)
                    allowed.append(host)
                    settings.ALLOWED_HOSTS = allowed
            except Exception:
                pass
        return self.get_response(request)
