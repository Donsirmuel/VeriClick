from typing import cast
from pathlib import Path
from datetime import timedelta
from django.core.exceptions import ImproperlyConfigured
from decouple import config, Csv
import dj_database_url

BASE_DIR = Path(__file__).resolve().parent.parent


def _env_str(name, default=''):
    # decouple's config() is typed as str | bool in its stubs; plain string
    # settings always cast to str so downstream code (and type checkers) see a
    # str instead of a possibly-bool union.
    return cast(str, config(name, default=default))


def _env_bool(name, default=False):
    raw = config(name, default=str(default))
    if isinstance(raw, bool):
        return raw
    value = str(raw).strip().lower()
    if value in {'1', 'true', 'yes', 'on', 'y', 't'}:
        return True
    if value in {'0', 'false', 'no', 'off', 'n', 'f'}:
        return False
    return default


# Production-first: DEBUG is off unless explicitly enabled. Everything that is
# insecure (dev SECRET_KEY, localhost hosts) is only reachable when DEBUG=True.
DEBUG = _env_bool('DEBUG', False)

if DEBUG:
    SECRET_KEY = _env_str('SECRET_KEY', 'django-insecure-dev-only-not-for-production')
    ALLOWED_HOSTS = config(
        'ALLOWED_HOSTS', default='localhost,127.0.0.1,testserver', cast=Csv(),
    )
else:
    # Fail closed: a deployment without an explicit SECRET_KEY / ALLOWED_HOSTS
    # refuses to start instead of silently running with dev defaults.
    secret_key = _env_str('SECRET_KEY')
    if not secret_key:
        raise ImproperlyConfigured(
            'SECRET_KEY is not set. Generate one (e.g. `python -c "from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())"`) '
            'and add it to the .env file.'
        )
    SECRET_KEY = secret_key

    allowed_hosts = _env_str('ALLOWED_HOSTS')
    if not allowed_hosts:
        raise ImproperlyConfigured(
            'ALLOWED_HOSTS is not set. Add the public hostnames (e.g. vendora.page,www.vendora.page) '
            'to the .env file.'
        )
    ALLOWED_HOSTS = Csv()(allowed_hosts)

INSTALLED_APPS = [
    'jazzmin',
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'rest_framework_simplejwt',
    'rest_framework.authtoken',
    'corsheaders',
    'django_filters',
    'vericlick',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    # Serves collected static files (admin, DRF, tracker) directly from Django
    # in production where DEBUG=False; Nginx proxies /static/ to gunicorn.
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'vericlick.middleware.RegisteredDomainHostMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'Vericlick_project.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'Vericlick_project.wsgi.application'


# Database

DATABASE_URL = _env_str('DATABASE_URL')
if DATABASE_URL:
    DATABASES = {
        'default': dj_database_url.config(default=DATABASE_URL, conn_max_age=600),
    }
elif _env_str('POSTGRES_DB'):
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.postgresql',
            'NAME': _env_str('POSTGRES_DB'),
            'USER': _env_str('POSTGRES_USER', 'postgres'),
            'PASSWORD': _env_str('POSTGRES_PASSWORD'),
            'HOST': _env_str('POSTGRES_HOST', '127.0.0.1'),
            'PORT': _env_str('POSTGRES_PORT', '5432'),
            'CONN_MAX_AGE': 600,
        }
    }
else:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': BASE_DIR / 'db.sqlite3',
        }
    }


# Password validation

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]


# Internationalization

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True


# Static files

STATIC_URL = 'static/'
STATIC_ROOT = BASE_DIR / 'staticfiles'

TRACKER_SCRIPT_PATH = BASE_DIR / 'vericlick' / 'static' / 'tracker.js'


# Logging

LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'verbose': {
            'format': '{levelname} {asctime} {module} {message}',
            'style': '{',
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'verbose',
        },
    },
    'root': {
        'handlers': ['console'],
        'level': 'INFO',
    },
}


# Security headers (production overrides)

if not DEBUG:
    SECURE_SSL_REDIRECT = True
    SECURE_HSTS_SECONDS = 31536000
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True
    SECURE_CONTENT_TYPE_NOSNIFF = True
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_REFERRER_POLICY = 'strict-origin-when-cross-origin'
    # Only trust X-Forwarded-Proto when the app sits behind a proxy (nignx,
    # a PaaS edge, etc.). Leave off when hitting Django directly.
    if _env_bool('TRUST_X_FORWARDED_PROTO', False):
        SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')


# CORS. No origins are allowed by default — production must list them explicitly
# in .env (see .env.example). A leaked dev origin cannot slip in.

CORS_ALLOWED_ORIGINS = config('CORS_ALLOWED_ORIGINS', default='', cast=Csv())
CORS_ALLOW_CREDENTIALS = True

# CSRF origins for the SPA origin(s) when session-based auth is used.

CSRF_TRUSTED_ORIGINS = config('CSRF_TRUSTED_ORIGINS', default='', cast=Csv())

PUBLIC_TRACKING_BASE_URL = _env_str('PUBLIC_TRACKING_BASE_URL').rstrip('/')

# Where /suspicious/ sends suspicious/automated traffic that has no per-workspace
# safe_destination. (Just a Google bounce by default, not an in-house page.)

NEUTRAL_DEFAULT_DESTINATION = 'https://google.com'

# Business toggles (beta free mode, signups open) are ADMIN-managed via the
# vericlick.SiteConfig singleton at /admin/vericlick/siteconfig/ — flip them in
# the Jazzmin admin without touching .env or redeploying. This settings module
# intentionally no longer reads a BETA_FREE_MODE env key.


# REST Framework

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 20,
    'DEFAULT_FILTER_BACKENDS': [
        'django_filters.rest_framework.DjangoFilterBackend',
    ],
    'DEFAULT_THROTTLE_CLASSES': [
        'rest_framework.throttling.AnonRateThrottle',
        'rest_framework.throttling.UserRateThrottle',
    ],
    'DEFAULT_THROTTLE_RATES': {
        'anon': '100/hour',
        'user': '1000/hour',
        'tracker': '600/min',
    },
    'DEFAULT_RENDERER_CLASSES': [
        'vericlick.utils.CamelCaseJSONRenderer',
        'rest_framework.renderers.BrowsableAPIRenderer',
    ],
    'DEFAULT_PARSER_CLASSES': [
        'vericlick.utils.CamelCaseJSONParser',
        'rest_framework.parsers.FormParser',
    ],
    'EXCEPTION_HANDLER': 'vericlick.utils.custom_exception_handler',
}


# SimpleJWT

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(days=1),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
    'AUTH_HEADER_TYPES': ('Bearer',),
}


# Jazzmin admin theming — matches the VeriClick black/white product aesthetic.

JAZZMIN_SETTINGS = {
    'site_title': 'VeriClick Admin',
    'site_header': 'VeriClick',
    'site_brand': 'VeriClick Admin',
    'site_logo': None,
    'site_logo_classes': 'img-circle',
    'site_icon': 'fas fa-shield-halved',
    'welcome_sign': 'Welcome back, Operator.',
    'copyright': 'VeriClick',
    'search_model': ['vericlick.DomainRegistry', 'vericlick.TrackingLink', 'auth.User'],
    'user_avatar': None,
    'topmenu_links': [
        {'name': 'VeriClick', 'url': '/', 'new_window': True},
        {'model': 'auth.User'},
        {'model': 'vericlick.Plan'},
        {'model': 'vericlick.DiscountCode'},
    ],
    'show_sidebar': True,
    'navigation_expanded': True,
    'hide_apps': [],
    'hide_models': ['auth.Group'],
    'icons': {
        'auth': 'fas fa-users-cog',
        'auth.User': 'fas fa-user',
        'auth.Group': 'fas fa-users',
        'vericlick.Workspace': 'fas fa-briefcase',
        'vericlick.DomainRegistry': 'fas fa-globe',
        'vericlick.TrackingLink': 'fas fa-link',
        'vericlick.ClickLog': 'fas fa-mouse-pointer',
        'vericlick.IPRule': 'fas fa-shield-halved',
        'vericlick.TrackerEvent': 'fas fa-chart-line',
        'vericlick.Plan': 'fas fa-credit-card',
        'vericlick.DiscountCode': 'fas fa-tag',
    },
    'order_with_respect_to': ['auth', 'vericlick'],
    'related_modal_active': True,
    'show_ui_builder': False,
    'changeform_format': 'horizontal_tabs',
}

JAZZMIN_UI_TWEAKS = {
    'navbar_small_text': False,
    'footer_small_text': True,
    'body_small_text': False,
    'brand_small_text': False,
    'brand_colour': 'navbar-dark',
    'accent': 'accent-dark',
    'navbar': 'navbar-dark',
    'no_navbar_border': False,
    'navbar_fixed': True,
    'layout_boxed': False,
    'footer_fixed': False,
    'sidebar_fixed': True,
    'sidebar': 'sidebar-dark-black',
    'sidebar_nav_small_text': False,
    'sidebar_disable_expand': False,
    'sidebar_nav_child_indent': True,
    'sidebar_nav_compact_style': False,
    'sidebar_nav_legacy_style': False,
    'sidebar_nav_flat_style': False,
    'theme': 'darkly',
    'dark_mode_theme': 'darkly',
    'input_focus_ring_color': '#ffffff',
    'input_focus_ring_width': '1px',
    'button_classes': {
        'primary': 'btn-outline-light',
        'secondary': 'btn-outline-secondary',
        'info': 'btn-outline-info',
        'warning': 'btn-outline-warning',
        'danger': 'btn-outline-danger',
        'success': 'btn-outline-success',
    },
    'actions_sticky_top': True,
}
