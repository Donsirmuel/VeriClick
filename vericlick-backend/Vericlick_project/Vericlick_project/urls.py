from django.contrib import admin
from django.urls import path, include
from django.http import HttpResponse
from django.conf import settings
from vericlick.views import redirect_click, neutral_page

# Public pages worth crawling. Auth/app pages are excluded (the SPA noindexes
# /auth/* and /app/* at runtime anyway, and login/register add no value).
SITEMAP_PAGES = [
    ('/', '1.0'),
    ('/pricing', '0.8'),
    ('/contact', '0.6'),
    ('/privacy', '0.4'),
    ('/terms', '0.4'),
]


def _canonical_base():
    # Always the canonical product domain (SITE_URL), never the request host, so
    # robots.txt / sitemap.xml reference one host even while vendora.page still
    # serves the app — avoids duplicate-content signals during the transition.
    return settings.SITE_URL.rstrip('/')


def robots_txt(request):
    lines = [
        'User-agent: *',
        'Allow: /',
        'Disallow: /auth/',
        'Disallow: /app/',
        'Disallow: /api/',
        'Disallow: /r/',
        'Disallow: /suspicious/',
        'Disallow: /admin/',
        '',
        f'Sitemap: {_canonical_base()}/sitemap.xml',
    ]
    return HttpResponse('\n'.join(lines), content_type='text/plain')

def sitemap_xml(request):
    base = _canonical_base()
    url_xml = '\n'.join(
        f'  <url>\n    <loc>{base}{path}</loc>\n    <priority>{priority}</priority>\n  </url>'
        for path, priority in SITEMAP_PAGES
    )
    xml = '<?xml version="1.0" encoding="UTF-8"?>\n'
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    xml += url_xml + '\n'
    xml += '</urlset>'
    return HttpResponse(xml, content_type='application/xml')

urlpatterns = [
    path('robots.txt', robots_txt),
    path('sitemap.xml', sitemap_xml),
    path('admin/', admin.site.urls),
    path('api/', include('vericlick.urls')),
    path('r/<slug:slug>/', redirect_click, name='redirect-click'),
    path('suspicious/', neutral_page, name='neutral-page'),
]
