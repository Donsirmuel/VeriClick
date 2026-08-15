import secrets
import string
from django.db.models import Q
from rest_framework import serializers
from django.contrib.auth.models import User
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from .models import (
    Workspace, DomainRegistry, TrackingLink, ClickLog, IPRule, CountryRule,
    DevicePolicy, TrackerEvent, Plan, DiscountCode, SiteConfig, BillingEvent,
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
    plan = serializers.SerializerMethodField()
    plan_name = serializers.SerializerMethodField()
    plan_billing_mode = serializers.CharField(read_only=True)
    plan_expires_at = serializers.DateTimeField(read_only=True)
    plan_status = serializers.CharField(read_only=True)
    grace_expires_at = serializers.DateTimeField(read_only=True)
    domain_limit = serializers.SerializerMethodField()
    domains_used = serializers.SerializerMethodField()
    can_add_domain = serializers.SerializerMethodField()
    link_limit = serializers.SerializerMethodField()
    links_used = serializers.SerializerMethodField()
    can_add_link = serializers.SerializerMethodField()
    trial_expires_at = serializers.SerializerMethodField()
    trial_active = serializers.SerializerMethodField()

    class Meta:
        model = Workspace
        fields = [
            'id', 'name', 'tracker_secret', 'safe_destination',
            'created_at', 'last_domain_scan_at', 'plan', 'plan_name',
            'plan_billing_mode', 'plan_expires_at', 'plan_status', 'grace_expires_at',
            'domain_limit', 'domains_used', 'can_add_domain',
            'link_limit', 'links_used', 'can_add_link',
            'trial_expires_at', 'trial_active',
        ]
        read_only_fields = [
            'id', 'tracker_secret', 'created_at', 'last_domain_scan_at',
            'plan', 'plan_name', 'plan_billing_mode', 'plan_expires_at',
            'plan_status', 'grace_expires_at',
            'domain_limit', 'domains_used', 'can_add_domain',
            'link_limit', 'links_used', 'can_add_link',
            'trial_expires_at', 'trial_active',
        ]

    def get_plan(self, obj):
        active = obj.active_plan
        return active.code if active else None

    def get_plan_name(self, obj):
        active = obj.active_plan
        return active.name if active else None

    def get_domain_limit(self, obj):
        return obj.effective_domain_limit

    def get_domains_used(self, obj):
        return obj.domains_in_use()

    def get_can_add_domain(self, obj):
        return obj.can_add_domain

    def get_link_limit(self, obj):
        return obj.effective_link_limit

    def get_links_used(self, obj):
        return obj.links_in_use()

    def get_can_add_link(self, obj):
        return obj.can_add_link

    def get_trial_expires_at(self, obj):
        return obj.trial_expires_at

    def get_trial_active(self, obj):
        return obj.trial_active


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


class DomainRegistrySerializer(serializers.ModelSerializer):
    links_count = serializers.SerializerMethodField()
    verification_record = serializers.CharField(read_only=True)
    # Readiness = verified ownership AND resolving to our server. Cheap and
    # always current because points_to_server is refreshed by run_health_check.
    # The apex itself is NOT required to resolve (e.g. a root domain with no A
    # record still serves its links on t.<domain>); only the tracking host has
    # to reach us.
    ready = serializers.SerializerMethodField()
    # Plain-language guidance for the DNS step that makes a domain really
    # serve tracking: what to add (A vs CNAME) and to what value. This is the
    # exact record a user must create at their DNS provider after verifying
    # ownership, and is derived from TRACKING_SERVER_IP / PUBLIC_TRACKING_BASE_URL.
    dns_setup = serializers.SerializerMethodField()

    class Meta:
        model = DomainRegistry
        fields = [
            'id', 'domain', 'health_status', 'verified', 'points_to_server',
            'verification_token', 'verification_record', 'last_checked',
            'health_detail', 'links_count', 'ready', 'dns_setup', 'created_at',
        ]
        read_only_fields = [
            'id', 'health_status', 'verified', 'points_to_server',
            'verification_token', 'verification_record', 'last_checked',
            'health_detail', 'links_count', 'ready', 'dns_setup', 'created_at',
        ]
        extra_kwargs = {
            # Drop the auto UniqueValidator: the domain column is globally
            # unique at the DB level, but the view must decide whether a match
            # is an error (active domain) or a resurrection (previously-removed
            # domain of the same workspace). Doing that inside perform_create
            # requires the request to get here in the first place.
            'domain': {'validators': []},
        }

    def get_dns_setup(self, obj):
        from django.conf import settings as django_settings

        # DNS guidance is intentionally simple and uniform: a single CNAME
        # record pointing the subdomain's label at our public tracker host
        # (e.g. Name "t" -> Value "getvericlick.site"). No A/ALIAS/IP variants to
        # explain — one record, one copy.
        base = getattr(django_settings, 'PUBLIC_TRACKING_BASE_URL', '').strip().rstrip('/')
        target = '/'.join(base.split('://')[-1].split('/')[:1]) if base else ''

        domain = (obj.domain or '').strip().lower().rstrip('.')
        labels = [part for part in domain.split('.') if part]

        # Apex domains (2 labels, e.g. example.com) can't use a CNAME, so their
        # tracked links live on the standard `t.` subdomain instead (e.g.
        # t.example.com). The user still registers the apex: no second domain
        # entry, no ALIAS/A chase — just one CNAME whose Name is `t`.
        if len(labels) <= 2:
            tracking = f't.{domain}'
            return {
                'label': 'CNAME',
                'host': 't',
                'target': target,
                'trackingHost': tracking,
                'sentence': 'Add a CNAME record with Name "t" and the value on the right.',
                'note': (f'Your links run on a subdomain of this domain: {tracking}. '
                         f'The root (apex) {domain} can\'t use a CNAME, so "t" quietly '
                         f'points {tracking} to VeriClick. No other records change.'),
            }

        # Subdomain: host is the first label (e.g. "t" for t.example.com).
        host = labels[0]
        return {
            'label': 'CNAME',
            'host': host,
            'target': target,
            'trackingHost': domain,
            'sentence': f'Add a CNAME record with Name "{host}" and the value on the right.',
            'note': f'If the box asks for a full hostname, use {domain} instead of just "{host}".',
        }

    def get_links_count(self, obj):
        # Prefer the annotated count added by the viewset queryset to avoid an
        # N+1 query when listing many domains; fall back to a live count for
        # single-object serialization paths.
        annotated = getattr(obj, 'links_count', None)
        if annotated is not None:
            return annotated
        return obj.links.filter(removed_at__isnull=True).count()

    def get_ready(self, obj):
        # Instant authorization: registering a domain from the account proves
        # ownership, so a domain is "ready for branded links" the moment its
        # tracking host points at VeriClick. No separate verified flag gates
        # serving anymore.
        return bool(
            obj.points_to_server
            and obj.removed_at is None
        )

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
    # Explains why a tracked link is (or isn't) running on its custom domain.
    # tracking_domain_ready = True when the link's domain points at this server
    # so the branded URL is live. Ownership is implied by registration (instant
    # authorization), so only the tracking host reaching us matters.
    tracking_domain_ready = serializers.SerializerMethodField()
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
            'tracking_domain_ready', 'tracking_url', 'total_clicks', 'bot_clicks',
            'human_clicks', 'status', 'allowed_devices', 'allowed_countries',
            'bot_action', 'safe_url', 'created_at', 'updated_at',
        ]
        read_only_fields = [
            'id', 'tracking_url', 'total_clicks', 'bot_clicks', 'human_clicks',
            'created_at', 'updated_at',
        ]

    def get_tracking_domain_ready(self, obj):
        domain = obj.domain
        if not domain:
            return None
        return bool(
            domain.removed_at is None
            and domain.points_to_server
        )

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
            'id', 'ip', 'country', 'country_code', 'region', 'city', 'device',
            'device_class', 'os_family', 'browser', 'reason',
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
            'created_at',
        ]
        read_only_fields = ['id', 'created_at']


class BlockedIPSerializer(serializers.ModelSerializer):
    slug = serializers.CharField(source='link.slug', read_only=True)
    reason_label = serializers.SerializerMethodField()

    class Meta:
        model = ClickLog
        fields = [
            'id', 'ip', 'reason', 'reason_label', 'decision', 'is_bot',
            'matched_rule', 'slug', 'country', 'country_code', 'region', 'city',
            'device_class', 'os_family', 'browser', 'created_at',
        ]

    def get_reason_label(self, obj):
        from .services import reason_label
        return reason_label(obj.decision, obj.reason, obj.matched_rule)


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
