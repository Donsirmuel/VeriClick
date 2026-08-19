from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from . import views

router = DefaultRouter()
router.register(r'ip-rules', views.IPRuleViewSet, basename='ip-rule')
router.register(r'country-rules', views.CountryRuleViewSet, basename='country-rule')

urlpatterns = [
    # Health
    path('health/', views.health_check, name='health-check'),
    # Pricing & discounts
    path('pricing/', views.pricing, name='pricing'),
    path('site-config/', views.site_config, name='site-config'),
    path('upgrade/', views.upgrade_workspace, name='upgrade'),
    path('webhooks/bachs/', views.bachs_webhook, name='bachs-webhook'),
    path('discount-codes/validate/', views.discount_code_validate, name='discount-code-validate'),
    # Auth
    path('auth/register/', views.register, name='register'),
    path('auth/verify-email/', views.verify_email, name='verify-email'),
    path('auth/resend-verification/', views.resend_verification_email, name='resend-verification'),
    path('auth/google/', views.google_login, name='google-login'),
    path('auth/me/', views.auth_me, name='auth-me'),
    path('auth/delete-account/', views.delete_account, name='delete-account'),
    path('auth/password-reset/', views.password_reset_request, name='password-reset'),
    path('auth/password-reset/confirm/', views.password_reset_confirm, name='password-reset-confirm'),
    path('auth/login/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('auth/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    # Dashboard
    path('dashboard/stats/', views.dashboard_stats, name='dashboard-stats'),
    path('dashboard/traffic/', views.dashboard_traffic, name='dashboard-traffic'),
    path('dashboard/activity/', views.dashboard_activity, name='dashboard-activity'),
    path('dashboard/breakdown/', views.dashboard_breakdown, name='dashboard-breakdown'),
    path('dashboard/domains/', views.dashboard_domains, name='dashboard-domains'),
    # Workspace
    path('workspace/', views.workspace_detail, name='workspace-detail'),
    path('workspace/billing-history/', views.billing_history, name='billing-history'),
    # Domains
    path('domains/', views.domain_list_create, name='domain-list-create'),
    path('domains/<uuid:domain_id>/', views.domain_delete, name='domain-delete'),
    # Traffic rules
    path('device-policy/', views.device_policy, name='device-policy'),
    # Tracker (script telemetry)
    path('tracker/event/', views.receive_tracker_event, name='tracker-event'),
    # Abuse prevention
    path('abuse/report/', views.abuse_report, name='abuse-report'),
    path('safety/check/', views.google_safe_browsing_check, name='safe-browsing-check'),
    # Proof-of-Work
    path('pow/', include('pow.urls')),
    # Shield (script model)
    path('shield/verify/', views.shield_verify, name='shield-verify'),
    path('shield/config/', views.shield_config_view, name='shield-config'),
    path('shield/telemetry/', views.shield_telemetry, name='shield-telemetry'),
    path('shield.js', views.serve_tracker_script, name='shield-script'),
    # Blocked IPs
    path('ip-rules/blocked/', views.blocked_ips, name='blocked-ips'),
    # CRUD
    path('', include(router.urls)),
]
