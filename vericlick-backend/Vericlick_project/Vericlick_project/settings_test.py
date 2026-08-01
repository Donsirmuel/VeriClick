import os

os.environ.setdefault('SECRET_KEY', 'vericlick-test-only-secret-key')
os.environ.setdefault('DEBUG', 'True')

from .settings import *  # noqa: E402,F401,F403

SECRET_KEY = os.environ.get('SECRET_KEY', 'vericlick-test-only-secret-key')
DEBUG = True

SECURE_SSL_REDIRECT = False
SECURE_HSTS_SECONDS = 0
SECURE_HSTS_INCLUDE_SUBDOMAINS = False
SECURE_HSTS_PRELOAD = False
SECURE_CONTENT_TYPE_NOSNIFF = False
SESSION_COOKIE_SECURE = False
CSRF_COOKIE_SECURE = False

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': ':memory:',
    },
}
