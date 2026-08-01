import secrets
import string
from rest_framework import serializers
from django.contrib.auth.models import User
from .models import Workspace, DomainRegistry, TrackingLink, ClickLog, IPRule, TrackerEvent


def _generate_slug(length=7):
    alphabet = string.ascii_lowercase + string.digits
    while True:
        slug = ''.join(secrets.choice(alphabet) for _ in range(length))
        if not TrackingLink.objects.filter(slug=slug).exists():
            return slug


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'email']


class WorkspaceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Workspace
        fields = ['id', 'name', 'tracker_secret', 'created_at', 'last_domain_scan_at']
        read_only_fields = ['id', 'tracker_secret', 'created_at', 'last_domain_scan_at']


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'password']

    def create(self, validated_data):
        user = User.objects.create_user(
            username=validated_data['username'],
            email=validated_data.get('email', ''),
            password=validated_data['password'],
        )
        return user


class DomainRegistrySerializer(serializers.ModelSerializer):
    links_count = serializers.SerializerMethodField()

    class Meta:
        model = DomainRegistry
        fields = ['id', 'domain', 'health_status', 'last_checked', 'links_count', 'created_at']
        read_only_fields = ['id', 'health_status', 'last_checked', 'links_count', 'created_at']

    def get_links_count(self, obj):
        return obj.links.count()


class TrackingLinkSerializer(serializers.ModelSerializer):
    domain_health = serializers.CharField(
        source='domain.health_status', read_only=True, default=None
    )
    domain = serializers.SlugRelatedField(
        slug_field='domain', queryset=DomainRegistry.objects.all(), allow_null=True, required=False,
    )
    slug = serializers.CharField(required=False, allow_blank=True, max_length=100)
    tracking_url = serializers.SerializerMethodField()

    class Meta:
        model = TrackingLink
        fields = [
            'id', 'slug', 'destination_url', 'domain', 'domain_health',
            'tracking_url', 'total_clicks', 'bot_clicks', 'status',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'tracking_url', 'total_clicks', 'bot_clicks', 'created_at', 'updated_at']

    def get_tracking_url(self, obj):
        from .services import get_public_tracking_url
        return get_public_tracking_url(obj, self.context.get('request'))

    def create(self, validated_data):
        if not validated_data.get('slug'):
            validated_data['slug'] = _generate_slug()
        return super().create(validated_data)


class ClickLogSerializer(serializers.ModelSerializer):
    slug = serializers.CharField(source='link.slug', read_only=True)
    time = serializers.DateTimeField(source='created_at', read_only=True)

    class Meta:
        model = ClickLog
        fields = ['id', 'ip', 'country', 'device', 'reason', 'is_bot', 'decision', 'matched_rule', 'slug', 'time', 'created_at']


class IPRuleSerializer(serializers.ModelSerializer):
    created_by_username = serializers.CharField(source='created_by.username', read_only=True, default=None)

    class Meta:
        model = IPRule
        fields = [
            'id', 'ip_or_cidr', 'action', 'reason', 'expires_at',
            'is_active', 'created_by', 'created_by_username',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_by', 'created_by_username', 'created_at', 'updated_at']


class TrackerEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = TrackerEvent
        fields = [
            'id', 'workspace', 'page_url', 'referrer', 'signals',
            'engagement', 'ip', 'user_agent', 'created_at',
        ]
        read_only_fields = ['id', 'created_at']


class BlockedIPSerializer(serializers.ModelSerializer):
    slug = serializers.CharField(source='link.slug', read_only=True)

    class Meta:
        model = ClickLog
        fields = [
            'id', 'ip', 'reason', 'decision', 'is_bot',
            'matched_rule', 'slug', 'country', 'created_at',
        ]
