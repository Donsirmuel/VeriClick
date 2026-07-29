from datetime import timedelta
from django.db.models import Count, Q
from django.db.models.functions import TruncDate
from django.utils import timezone
from django.contrib.auth.models import User
from django.contrib.auth.tokens import default_token_generator

from rest_framework import viewsets, status
from rest_framework.decorators import api_view, permission_classes, action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.pagination import PageNumberPagination
from rest_framework_simplejwt.tokens import RefreshToken
from decouple import config

from .models import Workspace, DomainRegistry, TrackingLink, ClickLog
from .serializers import (
    UserSerializer,
    WorkspaceSerializer,
    RegisterSerializer,
    DomainRegistrySerializer,
    TrackingLinkSerializer,
    ClickLogSerializer,
)


#Helpers 

def get_user_workspace(user):
    return Workspace.objects.filter(owner=user).first()


#Workspace 

@api_view(['GET', 'PATCH'])
@permission_classes([IsAuthenticated])
def workspace_detail(request):
    workspace = get_user_workspace(request.user)
    if not workspace:
        return Response({'error': 'No workspace found'}, status=status.HTTP_404_NOT_FOUND)

    if request.method == 'GET':
        serializer = WorkspaceSerializer(workspace)
        return Response(serializer.data)

    serializer = WorkspaceSerializer(workspace, data=request.data, partial=True)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response(serializer.data)


#Health 

@api_view(['GET'])
@permission_classes([AllowAny])
def health_check(request):
    return Response({'status': 'ok'})


#Auth

@api_view(['POST'])
@permission_classes([AllowAny])
def register(request):
    serializer = RegisterSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    user = serializer.save()
    return Response(RegisterSerializer(user).data, status=status.HTTP_201_CREATED)


@api_view(['POST'])
@permission_classes([AllowAny])
def google_login(request):
    id_token = request.data.get('id_token')
    if not id_token:
        return Response(
            {'errors': [{'field': 'id_token', 'detail': 'ID token is required'}]},
            status=status.HTTP_400_BAD_REQUEST,
        )

    import urllib.request
    import json

    try:
        url = f'https://oauth2.googleapis.com/tokeninfo?id_token={id_token}'
        with urllib.request.urlopen(url, timeout=10) as resp:
            info = json.loads(resp.read().decode())
    except Exception:
        return Response(
            {'errors': [{'field': 'id_token', 'detail': 'Invalid or expired token'}]},
            status=status.HTTP_400_BAD_REQUEST,
        )

    google_client_id = config('GOOGLE_CLIENT_ID', default='')
    if google_client_id and info.get('aud') != google_client_id:
        return Response(
            {'errors': [{'field': 'id_token', 'detail': 'Token audience mismatch'}]},
            status=status.HTTP_400_BAD_REQUEST,
        )

    email = info.get('email')
    if not email:
        return Response(
            {'errors': [{'field': 'email', 'detail': 'Email not provided by Google'}]},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not info.get('email_verified'):
        return Response(
            {'errors': [{'field': 'email', 'detail': 'Google email not verified'}]},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        user = User.objects.get(email=email)
    except User.DoesNotExist:
        base = email.split('@')[0]
        username = base
        suffix = 1
        while User.objects.filter(username=username).exists():
            username = f'{base}{suffix}'
            suffix += 1
        user = User.objects.create_user(
            username=username,
            email=email,
            password=User.objects.make_random_password(),
        )

    refresh = RefreshToken.for_user(user)
    return Response({
        'access': str(refresh.access_token),
        'refresh': str(refresh),
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def auth_me(request):
    serializer = UserSerializer(request.user)
    return Response(serializer.data)


@api_view(['POST'])
@permission_classes([AllowAny])
def password_reset_request(request):
    email = request.data.get('email')
    if not email:
        return Response(
            {'errors': [{'field': 'email', 'detail': 'Email is required'}]},
            status=status.HTTP_400_BAD_REQUEST,
        )
    try:
        user = User.objects.get(email=email)
        token = default_token_generator.make_token(user)
        # In production, send email with reset link
        # For dev, return the token directly
        return Response({'token': token, 'uid': user.pk, 'email': email})
    except User.DoesNotExist:
        return Response({'error': 'No user with this email address'}, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@permission_classes([AllowAny])
def password_reset_confirm(request):
    uid = request.data.get('uid')
    token = request.data.get('token')
    password = request.data.get('password')

    if not uid or not token or not password:
        return Response(
            {'errors': [{'field': field, 'detail': 'This field is required'} for field in ['uid', 'token', 'password'] if not request.data.get(field)]},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if len(password) < 8:
        return Response(
            {'errors': [{'field': 'password', 'detail': 'Password must be at least 8 characters'}]},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        user = User.objects.get(pk=uid)
        if not default_token_generator.check_token(user, token):
            return Response({'error': 'Invalid or expired token'}, status=status.HTTP_400_BAD_REQUEST)
        user.set_password(password)
        user.save()
        return Response({'status': 'ok'})
    except (User.DoesNotExist, ValueError):
        return Response({'error': 'Invalid user'}, status=status.HTTP_400_BAD_REQUEST)


#Dashboard

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def dashboard_stats(request):
    workspace = get_user_workspace(request.user)
    if not workspace:
        return Response({'error': 'No workspace found'}, status=status.HTTP_404_NOT_FOUND)

    now = timezone.now()
    twenty_four_hours_ago = now - timedelta(hours=24)

    clicks_24h = ClickLog.objects.filter(
        link__workspace=workspace, created_at__gte=twenty_four_hours_ago
    )
    total_clicks_24h = clicks_24h.count()
    bot_clicks_24h = clicks_24h.filter(is_bot=True).count()

    active_links = TrackingLink.objects.filter(workspace=workspace, status=TrackingLink.Status.ACTIVE).count()
    domains_healthy = DomainRegistry.objects.filter(
        workspace=workspace, health_status=DomainRegistry.HealthStatus.HEALTHY
    ).count()
    domains_degraded = DomainRegistry.objects.filter(
        workspace=workspace, health_status=DomainRegistry.HealthStatus.DEGRADED
    ).count()
    domains_blacklisted = DomainRegistry.objects.filter(
        workspace=workspace, health_status=DomainRegistry.HealthStatus.BLACKLISTED
    ).count()

    data = {
        'totalClicks24h': total_clicks_24h,
        'botTrafficBlocked': bot_clicks_24h,
        'botTrafficPercentage': round(
            (bot_clicks_24h / total_clicks_24h * 100) if total_clicks_24h else 0, 1
        ),
        'activeLinks': active_links,
        'domainsHealthy': domains_healthy,
        'domainsDegraded': domains_degraded,
        'domainsBlacklisted': domains_blacklisted,
    }
    return Response(data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def dashboard_traffic(request):
    workspace = get_user_workspace(request.user)
    if not workspace:
        return Response({'error': 'No workspace found'}, status=status.HTTP_404_NOT_FOUND)

    range_param = request.query_params.get('range', '7d')
    days_map = {'7d': 7, '30d': 30, '90d': 90}
    days = days_map.get(range_param, 7)

    since = timezone.now() - timedelta(days=days)

    qs = (
        ClickLog.objects
        .filter(link__workspace=workspace, created_at__gte=since)
        .annotate(date=TruncDate('created_at'))
        .values('date')
        .annotate(
            human=Count('id', filter=Q(is_bot=False)),
            bot=Count('id', filter=Q(is_bot=True)),
        )
        .order_by('date')
    )

    data = [
        {
            'date': entry['date'].isoformat() if entry['date'] else None,
            'human': entry['human'],
            'bot': entry['bot'],
        }
        for entry in qs
    ]
    return Response(data)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def dashboard_activity(request):
    workspace = get_user_workspace(request.user)
    if not workspace:
        return Response({'error': 'No workspace found'}, status=status.HTTP_404_NOT_FOUND)

    clicks = ClickLog.objects.select_related('link').filter(link__workspace=workspace).order_by('-created_at')[:50]
    serializer = ClickLogSerializer(clicks, many=True)
    return Response(serializer.data)


#Links (ViewSet)

class TrackingLinkPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = 'size'
    max_page_size = 100


class TrackingLinkViewSet(viewsets.ModelViewSet):
    queryset = TrackingLink.objects.select_related('domain').all()
    serializer_class = TrackingLinkSerializer
    pagination_class = TrackingLinkPagination
    filterset_fields = ['status', 'domain']

    def get_queryset(self):
        qs = super().get_queryset()
        search = self.request.query_params.get('search', '')
        if search:
            qs = qs.filter(
                Q(slug__icontains=search) | Q(destination_url__icontains=search)
            )
        workspace = get_user_workspace(self.request.user)
        if workspace:
            qs = qs.filter(workspace=workspace)
        return qs

    def perform_create(self, serializer):
        workspace = get_user_workspace(self.request.user)
        if not workspace:
            raise PermissionError('No workspace found')
        serializer.save(workspace=workspace)


#Domains (ViewSet)

class DomainRegistryViewSet(viewsets.ModelViewSet):
    queryset = DomainRegistry.objects.all()
    serializer_class = DomainRegistrySerializer

    def get_queryset(self):
        qs = super().get_queryset()
        workspace = get_user_workspace(self.request.user)
        if workspace:
            qs = qs.filter(workspace=workspace)
        return qs

    def perform_create(self, serializer):
        workspace = get_user_workspace(self.request.user)
        if not workspace:
            raise PermissionError('No workspace found')
        serializer.save(workspace=workspace)

    @action(detail=True, methods=['post'])
    def recheck(self, request, pk=None):
        domain = self.get_object()
        domain.last_checked = timezone.now()
        domain.save(update_fields=['last_checked'])
        return Response({'status': 'ok', 'last_checked': domain.last_checked})
