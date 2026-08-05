import secrets
import string
from rest_framework import serializers
from django.contrib.auth.models import User
from .models import (
    Workspace, DomainRegistry, TrackingLink, ClickLog, IPRule, TrackerEvent,
    Plan, DiscountCode, SiteConfig,
)


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
    plan = serializers.CharField(source='plan.code', read_only=True, default=None)
    plan_name = serializers.CharField(source='plan.name', read_only=True, default=None)
    domain_limit = serializers.SerializerMethodField()
    domains_used = serializers.SerializerMethodField()
    can_add_domain = serializers.SerializerMethodField()
    beta_free_mode = serializers.SerializerMethodField()

    class Meta:
        model = Workspace
        fields = [
            'id', 'name', 'tracker_secret', 'safe_destination',
            'created_at', 'last_domain_scan_at', 'plan', 'plan_name',
            'domain_limit', 'domains_used', 'can_add_domain', 'beta_free_mode',
        ]
        read_only_fields = [
            'id', 'tracker_secret', 'created_at', 'last_domain_scan_at',
            'plan', 'plan_name', 'domain_limit', 'domains_used',
            'can_add_domain', 'beta_free_mode',
        ]

    def get_domain_limit(self, obj):
        return obj.effective_domain_limit

    def get_domains_used(self, obj):
        return obj.domains_in_use()

    def get_can_add_domain(self, obj):
        return obj.can_add_domain

    def get_beta_free_mode(self, obj):
        return SiteConfig.is_beta_free_mode()


class PlanSerializer(serializers.ModelSerializer):
    monthly_price = serializers.DecimalField(max_digits=8, decimal_places=2, coerce_to_string=False)

    class Meta:
        model = Plan
        fields = ['code', 'name', 'monthly_price', 'domain_limit', 'features', 'sort_order']


class DiscountCodeSerializer(serializers.ModelSerializer):
    class Meta:
        model = DiscountCode
        fields = ['code', 'discount_percent', 'is_active', 'max_uses', 'uses_count', 'expires_at']
        read_only_fields = ['discount_percent', 'is_active', 'max_uses', 'uses_count', 'expires_at']


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
    verification_record = serializers.CharField(read_only=True)

    class Meta:
        model = DomainRegistry
        fields = [
            'id', 'domain', 'health_status', 'verified', 'verification_token',
            'verification_record', 'last_checked', 'links_count', 'created_at',
        ]
        read_only_fields = [
            'id', 'health_status', 'verified', 'verification_token',
            'verification_record', 'last_checked', 'links_count', 'created_at',
        ]

    def get_links_count(self, obj):
        return obj.links.count()

    def validate_domain(self, value):
        value = (value or '').strip().lower()
        if not value:
            raise serializers.ValidationError('Enter a domain name.')
        if '://' in value:
            raise serializers.ValidationError('Enter just the domain, without http:// or https://.')
        if any(ch.isspace() for ch in value):
            raise serializers.ValidationError('Domain name cannot contain spaces.')
        return value.rstrip('/')


class TrackingLinkSerializer(serializers.ModelSerializer):
    domain_health = serializers.CharField(
        source='domain.health_status', read_only=True, default=None
    )
    domain = serializers.SlugRelatedField(
        slug_field='domain', queryset=DomainRegistry.objects.all(), allow_null=True, required=False,
    )
    slug = serializers.CharField(required=False, allow_blank=True, max_length=100)
    tracking_url = serializers.SerializerMethodField()
    human_clicks = serializers.SerializerMethodField()

    class Meta:
        model = TrackingLink
        fields = [
            'id', 'slug', 'destination_url', 'domain', 'domain_health',
            'tracking_url', 'total_clicks', 'bot_clicks', 'human_clicks', 'status',
            'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'tracking_url', 'total_clicks', 'bot_clicks', 'human_clicks',
            'created_at', 'updated_at',
        ]

    def get_tracking_url(self, obj):
        from .services import get_public_tracking_url
        return get_public_tracking_url(obj, self.context.get('request'))

    def get_human_clicks(self, obj):
        return max(obj.total_clicks - obj.bot_clicks, 0)

    def create(self, validated_data):
        if not validated_data.get('slug'):
            validated_data['slug'] = _generate_slug()
        return super().create(validated_data)


class ClickLogSerializer(serializers.ModelSerializer):
    slug = serializers.CharField(source='link.slug', read_only=True)
    time = serializers.DateTimeField(source='created_at', read_only=True)
    reason_label = serializers.SerializerMethodField()

    class Meta:
        model = ClickLog
        fields = [
            'id', 'ip', 'country', 'region', 'city', 'device', 'reason',
            'reason_label', 'is_bot', 'decision', 'matched_rule', 'slug', 'time', 'created_at',
        ]

    def get_reason_label(self, obj):
        from .services import reason_label
        return reason_label(obj.decision, obj.reason, obj.matched_rule)


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
    reason_label = serializers.SerializerMethodField()

    class Meta:
        model = ClickLog
        fields = [
            'id', 'ip', 'reason', 'reason_label', 'decision', 'is_bot',
            'matched_rule', 'slug', 'country', 'region', 'city', 'created_at',
        ]

    def get_reason_label(self, obj):
        from .services import reason_label
        return reason_label(obj.decision, obj.reason, obj.matched_rule)
