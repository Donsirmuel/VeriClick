from django.contrib import admin
from django.urls import path, include
from django.http import HttpResponse
from django.template.loader import render_to_string
from vericlick.views import redirect_click, neutral_page

def robots_txt(request):
    lines = [
        'User-agent: *',
        'Allow: /',
        'Disallow: /auth/',
        'Disallow: /app/',
        '',
        f'Sitemap: {request.scheme}://{request.get_host()}/sitemap.xml',
    ]
    return HttpResponse('\n'.join(lines), content_type='text/plain')

def sitemap_xml(request):
    urls = [
        {'loc': f'{request.scheme}://{request.get_host()}/', 'priority': '1.0'},
        {'loc': f'{request.scheme}://{request.get_host()}/auth/login', 'priority': '0.3'},
        {'loc': f'{request.scheme}://{request.get_host()}/auth/register', 'priority': '0.3'},
    ]
    xml = '<?xml version="1.0" encoding="UTF-8"?>\n'
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    for entry in urls:
        xml += f'  <url>\n    <loc>{entry["loc"]}</loc>\n    <priority>{entry["priority"]}</priority>\n  </url>\n'
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
