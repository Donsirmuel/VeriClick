"""
WSGI config for Vericlick_project project.

It exposes the WSGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/6.0/howto/deployment/wsgi/
"""

import os

from django.core.wsgi import get_wsgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'Vericlick_project.settings')

application = get_wsgi_application()


def _warm_datacenter_cache():
    # Every gunicorn worker pre-loads the datacenter IP ranges into memory so a
    # real visitor is never the first one to pay the one-time load. No-op when
    # the table is empty (e.g. a fresh DB before `manage.py import_asn` runs).
    from .models import IpAsnRange
    from .services import load_datacenter_ranges
    if IpAsnRange.objects.exists():
        load_datacenter_ranges()


_warm_datacenter_cache()
