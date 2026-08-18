from django.db.models import Q
from rest_framework import serializers
from django.contrib.auth.models import User
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from .models import (
    Workspace, IPRule, CountryRule,
    DevicePolicy, TrackerEvent, Plan, DiscountCode, SiteConfig, BillingEvent,
    ShieldConfig,
)


class EmailOrUsernameTokenObtainPairSerializer(TokenObtainPairSerializer):
    # SimpleJWT authenticates by username only, but the SPA sends whichever
    # identifier the user typed (they commonly enter their email). Resolve an
    # email — case-insensitive — to the matching username before the parent
    # runs the standard username/password check.
    #
    # SimpleJWT's default failure message ("No active account found with the
    # given credentials") is wrong in two ways: it claims the account doesn't
    # exist even when only the password is wrong (very confusing right after a
    # password reset), and it hides WHY the sign-in failed. We re-raise with a
    # precise, actionable reason instead.
    def validate(self, attrs):
        identifier = (attrs.get(self.username_field) or '').strip()
        matched = User.objects.filter(
            Q(username__iexact=identifier) | Q(email__iexact=identifier)
        ).first()
        if matched is not None:
            attrs[self.username_field] = matched.get_username()

        try:
            return super().validate(attrs)
        except Exception as exc:
            from rest_framework.exceptions import AuthenticationFailed
            if isinstance(exc, AuthenticationFailed):
                if matched is not None and not matched.is_active:
                    raise AuthenticationFailed(
                        'Please verify your email first. Check your inbox for the '
                        'verification link we sent when you signed up, or request a new one.'
                    )
                if matched is None:
                    raise AuthenticationFailed(
                        'We couldn\'t find an account with that username or email. '
                        'Check the spelling or create a new account.'
                    )
                raise AuthenticationFailed(
                    'Incorrect password. If you just reset your password, '
                    'make sure you\'re using your new one.'
                )
            raise



class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'email']


class WorkspaceSerializer(serializers.ModelSerializer):
    plan = serializers.SerializerMethodField()
    plan_name = serializers.SerializerMethodField()
    plan_billing_mode = serializers.CharField(read_only=True)
    plan_expires_at = serializers.DateTimeField(read_only=True)
    plan_status = serializers.CharField(read_only=True)
    grace_expires_at = serializers.DateTimeField(read_only=True)
    trial_expires_at = serializers.SerializerMethodField()
    trial_active = serializers.SerializerMethodField()

    class Meta:
        model = Workspace
        fields = [
            'id', 'name', 'tracker_secret', 'safe_destination',
            'created_at', 'plan', 'plan_name',
            'plan_billing_mode', 'plan_expires_at', 'plan_status', 'grace_expires_at',
            'trial_expires_at', 'trial_active',
        ]
        read_only_fields = [
            'id', 'tracker_secret', 'created_at',
            'plan', 'plan_name', 'plan_billing_mode', 'plan_expires_at',
            'plan_status', 'grace_expires_at',
            'trial_expires_at', 'trial_active',
        ]

    def get_plan(self, obj):
        active = obj.active_plan
        return active.code if active else None

    def get_plan_name(self, obj):
        active = obj.active_plan
        return active.name if active else None

    def get_trial_expires_at(self, obj):
        return obj.trial_expires_at

    def get_trial_active(self, obj):
        return obj.trial_active


class PlanSerializer(serializers.ModelSerializer):
    monthly_price = serializers.DecimalField(max_digits=8, decimal_places=2, coerce_to_string=False)

    class Meta:
        model = Plan
        fields = ['code', 'name', 'monthly_price', 'features', 'sort_order']


class DiscountCodeSerializer(serializers.ModelSerializer):
    class Meta:
        model = DiscountCode
        fields = ['code', 'discount_percent', 'is_active', 'max_uses', 'uses_count', 'expires_at']
        read_only_fields = ['discount_percent', 'is_active', 'max_uses', 'uses_count', 'expires_at']


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=8)
    email_verified = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'username', 'email', 'email_verified', 'password']

    def get_email_verified(self, obj):
        return obj.is_active

    def validate_email(self, value):
        email = (value or '').strip()
        if email and User.objects.filter(email__iexact=email).exists():
            raise serializers.ValidationError(
                'An account with this email already exists. Try logging in instead.'
            )
        return value

    def create(self, validated_data):
        # Accounts start inactive until the address is confirmed via email —
        # login is blocked until the verification link is used.
        user = User.objects.create_user(
            username=validated_data['username'],
            email=validated_data.get('email', ''),
            password=validated_data['password'],
            is_active=False,
        )
        return user


class IPRuleSerializer(serializers.ModelSerializer):
    created_by_username = serializers.CharField(source='created_by.username', read_only=True, default=None)

    class Meta:
        model = IPRule
        fields = [
            'id', 'ip_or_cidr', 'action', 'reason', 'expires_at',
            'is_active', 'source', 'created_by', 'created_by_username',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_by', 'created_by_username', 'created_at', 'updated_at']


class CountryRuleSerializer(serializers.ModelSerializer):
    created_by_username = serializers.CharField(source='created_by.username', read_only=True, default=None)

    class Meta:
        model = CountryRule
        fields = [
            'id', 'country_code', 'action', 'reason', 'is_active',
            'source', 'created_by', 'created_by_username',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_by', 'created_by_username', 'created_at', 'updated_at']

    def validate_country_code(self, value):
        value = (value or '').strip().upper()
        if not value:
            raise serializers.ValidationError('Enter a two-letter country code.')
        if len(value) != 2 or not value.isalpha():
            raise serializers.ValidationError('Country code must be exactly two letters (e.g. US, NG, CN).')
        return value


class DevicePolicySerializer(serializers.ModelSerializer):
    class Meta:
        model = DevicePolicy
        fields = [
            'allowed_device_classes', 'blocked_os_families', 'updated_at',
        ]
        read_only_fields = ['updated_at']

    def validate_allowed_device_classes(self, value):
        known = {'mobile', 'tablet', 'desktop'}
        value = list(value or [])
        for item in value:
            if item not in known:
                raise serializers.ValidationError(f'Unknown device class "{item}".')
        return value

    def validate_blocked_os_families(self, value):
        value = list(value or [])
        return [str(item) for item in value]


class TrackerEventSerializer(serializers.ModelSerializer):
    class Meta:
        model = TrackerEvent
        fields = [
            'id', 'workspace', 'page_url', 'referrer', 'signals',
            'engagement', 'ip', 'user_agent', 'verdict', 'is_bot', 'reason',
            'canvas_hash', 'trajectory', 'ja4_hash', 'bot_score', 'bot_verdict',
            'created_at',
        ]
        read_only_fields = ['id', 'created_at']


class BlockedIPSerializer(serializers.ModelSerializer):
    reason_label = serializers.SerializerMethodField()

    class Meta:
        model = TrackerEvent
        fields = [
            'id', 'ip', 'reason', 'reason_label', 'is_bot',
            'page_url', 'country', 'verdict', 'created_at',
        ]

    def get_reason_label(self, obj):
        from .services import reason_label
        verdict = 'blocked' if obj.verdict == 'blocked' else 'allowed'
        return reason_label(verdict, obj.reason, '')


class ShieldConfigSerializer(serializers.ModelSerializer):
    class Meta:
        model = ShieldConfig
        fields = [
            'id', 'protection_mode', 'bot_action', 'protected_paths',
            'blocked_paths', 'rate_limit_per_hour', 'updated_at',
        ]
        read_only_fields = ['id', 'updated_at']

    def validate_protected_paths(self, value):
        value = list(value or [])
        return [str(p) for p in value]

    def validate_blocked_paths(self, value):
        value = list(value or [])
        return [str(p) for p in value]

    def validate_rate_limit_per_hour(self, value):
        if value < 10:
            raise serializers.ValidationError('Rate limit must be at least 10 per hour.')
        if value > 10000:
            raise serializers.ValidationError('Rate limit cannot exceed 10,000 per hour.')
        return value


def mask_reference_id(value):
    # Show just enough of a Bachs ID to be recognisable in the UI without
    # exposing the full reference: keep the prefix and the last 4 chars.
    if not value:
        return ''
    if len(value) <= 12:
        return f'{value[:3]}****{value[-4:]}' if len(value) > 7 else value
    return f'{value[:5]}****{value[-4:]}'


class BillingEventSerializer(serializers.ModelSerializer):
    label = serializers.SerializerMethodField()
    charge_id = serializers.SerializerMethodField()

    class Meta:
        model = BillingEvent
        fields = [
            'id', 'kind', 'label', 'plan_name', 'amount', 'currency',
            'occurred_at', 'charge_id', 'checkout_id', 'note', 'data',
        ]

    def get_label(self, obj):
        from .models import BillingEvent as BE
        try:
            return BE.Kind(obj.kind).label
        except ValueError:
            return obj.kind.replace('_', ' ').title()

    def get_charge_id(self, obj):
        return mask_reference_id(obj.charge_id)
