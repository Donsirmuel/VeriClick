from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from . import views

router = DefaultRouter()
router.register(r'links', views.TrackingLinkViewSet, basename='link')
router.register(r'domains', views.DomainRegistryViewSet, basename='domain')

urlpatterns = [
    # Health
    path('health/', views.health_check, name='health-check'),
    # Auth
    path('auth/register/', views.register, name='register'),
    path('auth/google/', views.google_login, name='google-login'),
    path('auth/me/', views.auth_me, name='auth-me'),
    path('auth/password-reset/', views.password_reset_request, name='password-reset'),
    path('auth/password-reset/confirm/', views.password_reset_confirm, name='password-reset-confirm'),
    path('auth/login/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('auth/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    # Dashboard
    path('dashboard/stats/', views.dashboard_stats, name='dashboard-stats'),
    path('dashboard/traffic/', views.dashboard_traffic, name='dashboard-traffic'),
    path('dashboard/activity/', views.dashboard_activity, name='dashboard-activity'),
    # Workspace
    path('workspace/', views.workspace_detail, name='workspace-detail'),
    # CRUD
    path('', include(router.urls)),
]
