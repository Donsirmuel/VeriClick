import uuid
import secrets
from datetime import timedelta
from django.db import models
from django.contrib.auth.models import User
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.utils.timezone import now


class Workspace(models.Model):
    class BillingMode(models.TextChoices):
        # How a workspace pays for its plan.
        SUBSCRIPTION = 'subscription', 'Subscription (card, auto-renews)'
        PERIOD = 'period', 'One-time period (manual renew)'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name='workspaces')
    tracker_secret = models.UUIDField(default=uuid.uuid4, editable=False)
    safe_destination = models.URLField(
        max_length=2048, blank=True, default='',
        help_text='Where suspicious traffic is sent instead of the real destination.',
    )
    plan = models.ForeignKey(
        'Plan', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='workspaces',
        help_text='The paid plan this workspace is on. Null means the free tier (no paid plan).',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    trial_started_at = models.DateTimeField(
        null=True, blank=True,
        help_text=(
            'When the free-trial clock started for this workspace. Only set once '
            'a workspace has no paid plan; the workspace then gets 7 days to use '
            'its free allowance (1 domain, 1 link) before creation is locked '
            'until it upgrades.'
        ),
    )
    plan_started_at = models.DateTimeField(
        null=True, blank=True,
        help_text=(
            'When the current paid-plan period began. Used to decide when '
            'soft-deleted domains/links stop counting toward the plan limits: '
            'a removed verified domain (or a link on one) keeps its slot until '
            'the current period ends. Set automatically the first time a plan '
            'is assigned.'
        ),
    )
    auto_reputation_enabled = models.BooleanField(
        default=True,
        help_text=(
            'When on, IPs that keep tripping the traffic checks (bot/rate/datacenter) '
            'are automatically denied for 24h so repeated offenders stay blocked, and '
            'traffic from hosting/datacenter/VPN networks is diverted to the safe '
            'destination. Allow rules still always win.'
        ),
    )
    plan_billing_mode = models.CharField(
        max_length=16, choices=BillingMode.choices, default=BillingMode.SUBSCRIPTION,
        help_text=(
            'How this plan is paid: subscription = card monthly auto-renew; '
            'period = a one-time payment covering a billing period (bank '
            'transfer / crypto / mobile money), renewed manually.'
        ),
    )
    plan_expires_at = models.DateTimeField(
        null=True, blank=True,
        help_text=(
            'When the current billing period ends. Null on card subscriptions. '
            'Set on one-time "period" payments; once passed, the workspace is '
            'treated as having no active plan until it pays again.'
        ),
    )

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.name

    def save(self, *args, **kwargs):
        # Start the paid-plan period clock the first time a plan is assigned
        # (covers the webhook, the Django admin's inline plan edits, and any
        # test/script path uniformly).
        if self.plan_id is not None and not self.plan_started_at:
            self.plan_started_at = now()
        super().save(*args, **kwargs)

    def is_plan_active(self):
        # A plan counts as active while assigned and, for one-time "period"
        # payments, until the billing period ends. Card subscriptions have no
        # expiry so they stay active until cancelled.
        if not self.plan:
            return False
        if self.plan_expires_at is not None and self.plan_expires_at <= now():
            return False
        return True

    @property
    def grace_expires_at(self):
        # One-time "period" workspaces get PLAN_GRACE_DAYS of full access after
        # the paid period lapses. Card subscriptions (no expiry) never enter grace.
        if self.plan_expires_at is None:
            return None
        return self.plan_expires_at + timedelta(days=PLAN_GRACE_DAYS)

    @property
    def plan_status(self):
        # Lifecycle for one-time "period" payments:
        #   active     — paid period in force (full access)
        #   grace      — period lapsed, PLAN_GRACE_DAYS of full access remain
        #   suspended  — grace passed; links return 410 Gone (no abuse from
        #                lapsed accounts) until the plan is renewed
        # Workspaces with no paid plan report 'none'; card subscriptions stay
        # 'active' indefinitely.
        if not self.plan:
            return 'none'
        if self.is_plan_active():
            return 'active'
        grace = self.grace_expires_at
        if grace is not None and now() < grace:
            return 'grace'
        return 'suspended'

    @property
    def in_grace(self):
        return self.plan_status == 'grace'

    @property
    def suspended(self):
        return self.plan_status == 'suspended'

    def has_plan_access(self):
        # Whether the workspace may use its paid plan today: paid in force, or
        # within the grace window. Suspended workspaces have no plan access.
        return self.is_plan_active() or self.in_grace

    @property
    def active_plan(self):
        # The plan that is currently in force (None once a grace period lapses).
        return self.plan if self.has_plan_access() else None

    @property
    def current_period_start(self):
        # The date the current counting period began. Paid workspaces advance a
        # 30-day period (lazily, from when the plan was assigned). Workspaces
        # with no plan return None (no active period). Soft-deleted domains/links
        # stop counting once their removal predates this boundary.
        if self.has_plan_access():
            base = self.plan_started_at or now()
            period = base
            while period + timedelta(days=PLAN_PERIOD_DAYS) <= now():
                period += timedelta(days=PLAN_PERIOD_DAYS)
            return period
        return None

    def ensure_trial_started(self):
        # No-op — free trials have been removed. Kept for migration safety.
        return self.trial_started_at

    @property
    def trial_expires_at(self):
        return None

    @property
    def trial_active(self):
        return False



class IPRule(models.Model):
    class Action(models.TextChoices):
        ALLOW = 'allow', 'Allow'
        DENY = 'deny', 'Deny'

    class Source(models.TextChoices):
        MANUAL = 'manual', 'Manual'
        AUTO = 'auto', 'Auto'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(
        Workspace, on_delete=models.CASCADE, related_name='ip_rules',
    )
    ip_or_cidr = models.CharField(max_length=45, help_text='Single IP or CIDR notation')
    action = models.CharField(max_length=10, choices=Action.choices)
    reason = models.CharField(max_length=255, blank=True, default='')
    expires_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    source = models.CharField(
        max_length=10, choices=Source.choices, default=Source.MANUAL,
        help_text=(
            'How the rule was created. Auto rules are generated by the '
            'reputation system when an IP trips the traffic checks repeatedly; '
            'they expire on their own and can be deleted like manual rules.'
        ),
    )
    created_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='created_ip_rules',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.ip_or_cidr} ({self.action})'


class CountryRule(models.Model):
    # Workspace-level country allow/deny rules. Mirrors IPRule so the Traffic
    # Rules UI can treat both the same way (allow always wins, deny intercepts).
    class Action(models.TextChoices):
        ALLOW = 'allow', 'Allow'
        DENY = 'deny', 'Deny'

    class Source(models.TextChoices):
        MANUAL = 'manual', 'Manual'
        AUTO = 'auto', 'Auto'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(
        Workspace, on_delete=models.CASCADE, related_name='country_rules',
    )
    country_code = models.CharField(
        max_length=2, help_text='ISO 3166-1 alpha-2 country code (e.g. US, NG, CN).',
    )
    action = models.CharField(max_length=10, choices=Action.choices)
    reason = models.CharField(max_length=255, blank=True, default='')
    is_active = models.BooleanField(default=True)
    source = models.CharField(
        max_length=10, choices=Source.choices, default=Source.MANUAL,
        help_text=(
            'How the rule was created. Auto rules are generated from the '
            'dashboard one-click block buttons; they can be deleted like '
            'manual rules.'
        ),
    )
    created_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='created_country_rules',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.country_code} ({self.action})'


class DevicePolicy(models.Model):
    # Workspace-level device/OS policy: which device classes are allowed to open
    # links, and which OS families are blocked. Empty lists mean "everything
    # allowed" so a fresh workspace behaves exactly like today. Created lazily
    # next to the workspace when a user first opens the Traffic Rules page.
    workspace = models.OneToOneField(
        Workspace, on_delete=models.CASCADE, related_name='device_policy',
    )
    allowed_device_classes = models.JSONField(
        default=list, blank=True,
        help_text='Device classes allowed to open links (mobile, tablet, desktop). Empty = all.',
    )
    blocked_os_families = models.JSONField(
        default=list, blank=True,
        help_text='OS families blocked from opening links (Windows, Android, ...). Empty = none.',
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = 'Device policies'

    def __str__(self):
        return f'Device policy for {self.workspace_id}'


class IpAsnRange(models.Model):
    """IP ranges belonging to hosting/datacenter/VPN networks, loaded from a
    free IP->ASN dataset (iptoasn.com). Only networks that look like
    datacenter/cloud/proxy/hosting providers are stored, so the table stays
    small and the redirect hot path does one indexed range lookup to decide
    whether an IP should be treated as datacenter traffic."""
    start_ip = models.CharField(max_length=45, help_text='First IP of the range (text form)')
    end_ip = models.CharField(max_length=45, help_text='Last IP of the range (text form)')
    asn = models.CharField(max_length=20, blank=True, default='')
    country = models.CharField(max_length=4, blank=True, default='')
    org = models.CharField(max_length=512, blank=True, default='')

    class Meta:
        ordering = ['start_ip']

    def __str__(self):
        return f'{self.asn} ({self.org})'


class TrackerEvent(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(
        Workspace, on_delete=models.CASCADE, related_name='tracker_events',
    )
    page_url = models.URLField(max_length=2048)
    domain = models.CharField(
        max_length=253, blank=True, default='', db_index=True,
        help_text='Domain extracted from page_url (e.g. example.com). Used for per-domain dashboard filtering.',
    )
    referrer = models.URLField(max_length=2048, blank=True, default='')
    signals = models.JSONField(default=dict, blank=True)
    engagement = models.JSONField(default=dict, blank=True)
    ip = models.GenericIPAddressField()
    user_agent = models.TextField(blank=True, default='')
    verdict = models.CharField(
        max_length=20, blank=True, default='',
        help_text='Shield verdict for this pageview: "allowed" or "blocked". Empty = not evaluated.',
    )
    is_bot = models.BooleanField(
        default=False,
        help_text='Whether the shield judged this pageview as bot/automated traffic.',
    )
    reason = models.CharField(
        max_length=100, blank=True, default='',
        help_text='Short reason code behind the verdict (e.g. suspicious UA, country deny).',
    )
    # Layer 1: Canvas fingerprint
    canvas_hash = models.CharField(
        max_length=64, blank=True, default='',
        help_text='Stable device canvas fingerprint hash.',
    )
    # Layer 2: Mouse trajectory metrics (computed client-side)
    trajectory = models.JSONField(
        default=dict, blank=True,
        help_text='Mouse trajectory metrics: straightness, speed_var, curvature_entropy, teleports.',
    )
    # Layer 3: TLS fingerprint (JA4 from Caddy proxy)
    ja4_hash = models.CharField(
        max_length=128, blank=True, default='',
        help_text='JA4 TLS fingerprint hash from Caddy proxy.',
    )
    country_code = models.CharField(max_length=2, blank=True, default='')
    country = models.CharField(max_length=64, blank=True, default='')
    region = models.CharField(max_length=128, blank=True, default='')
    city = models.CharField(max_length=128, blank=True, default='')
    device_class = models.CharField(max_length=20, blank=True, default='')
    os_family = models.CharField(max_length=64, blank=True, default='')
    browser = models.CharField(max_length=64, blank=True, default='')
    # Layer 5: Behavioral scoring
    bot_score = models.FloatField(
        default=0.5,
        help_text='Composite bot score: 0.0 (definitely bot) to 1.0 (definitely human).',
    )
    bot_verdict = models.CharField(
        max_length=20, blank=True, default='',
        help_text='Behavioral verdict: "human", "suspicious", or "bot".',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.ip} -> {self.page_url}'


FREE_TRIAL_DAYS = 7
PLAN_PERIOD_DAYS = 30
PLAN_GRACE_DAYS = 7


class ShieldConfig(models.Model):
    """Per-workspace shield configuration. Controls how the script protects pages."""
    class ProtectionMode(models.TextChoices):
        STRICT = 'strict', 'Strict — block all detected bots'
        BALANCED = 'balanced', 'Balanced — block obvious bots, challenge suspicious'
        MONITOR = 'monitor', 'Monitor only — log but don\'t block'

    class BotAction(models.TextChoices):
        BLOCK = 'block', 'Show block page'
        HONEYPOT = 'honeypot', 'Redirect to honeypot page'
        LOG = 'log', 'Log only, let through'

    workspace = models.OneToOneField(
        Workspace, on_delete=models.CASCADE, related_name='shield_config',
    )
    protection_mode = models.CharField(
        max_length=16, choices=ProtectionMode.choices, default=ProtectionMode.BALANCED,
    )
    bot_action = models.CharField(
        max_length=10, choices=BotAction.choices, default=BotAction.BLOCK,
    )
    protected_paths = models.JSONField(
        default=list, blank=True,
        help_text='Paths to protect (empty = all pages). E.g. ["/checkout", "/pricing"].',
    )
    blocked_paths = models.JSONField(
        default=list, blank=True,
        help_text='Paths to never protect (e.g. ["/admin", "/api"]).',
    )
    rate_limit_per_hour = models.PositiveIntegerField(
        default=100,
        help_text='Max visits per IP per hour before triggering rate limit.',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Shield configuration'
        verbose_name_plural = 'Shield configurations'

    def __str__(self):
        return f'Shield config for {self.workspace_id}: {self.protection_mode}'


class DomainRegistry(models.Model):
    """Domain ownership tracking with verification. The domain count is the
    pricing differentiator across plans (Basic=5, Plus=10, Pro=20).

    Two purposes:
    - protection: domain is protected by the shield.js script
    - redirect: domain is used for smart redirects via the edge proxy

    Verification methods:
    - html_meta: user adds a <meta> tag to their site
    - dns_txt: user adds a DNS TXT record (fallback)
    """

    class VerificationMethod(models.TextChoices):
        HTML_META = 'html_meta', 'HTML Meta Tag'
        DNS_TXT = 'dns_txt', 'DNS TXT Record'

    class HealthStatus(models.TextChoices):
        UNKNOWN = 'unknown', 'Unknown'
        HEALTHY = 'healthy', 'Healthy'
        UNHEALTHY = 'unhealthy', 'Unreachable'

    class Purpose(models.TextChoices):
        PROTECTION = 'protection', 'Bot Protection'
        REDIRECT = 'redirect', 'Smart Redirect'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(
        Workspace, on_delete=models.CASCADE, related_name='domains',
    )
    domain = models.CharField(
        max_length=253,
        help_text='Registered domain (e.g. example.com).',
    )
    purpose = models.CharField(
        max_length=10, choices=Purpose.choices, default=Purpose.PROTECTION,
    )

    # Verification
    verification_method = models.CharField(
        max_length=10, choices=VerificationMethod.choices, blank=True, default='',
    )
    verification_token = models.CharField(
        max_length=64, blank=True, default='',
        help_text='Auto-generated challenge token for domain verification.',
    )
    verified = models.BooleanField(default=False)
    verified_at = models.DateTimeField(null=True, blank=True)

    # Health
    last_health_check = models.DateTimeField(null=True, blank=True)
    health_status = models.CharField(
        max_length=10, choices=HealthStatus.choices, default=HealthStatus.UNKNOWN,
    )

    # Soft delete
    is_active = models.BooleanField(
        default=True,
        help_text='Soft-delete flag — removed domains keep their slot until period ends.',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']
        unique_together = [('workspace', 'domain')]

    def __str__(self):
        return f'{self.domain} ({self.workspace_id})'

    def generate_verification_token(self):
        """Generate a new verification token for domain ownership challenge."""
        import secrets
        self.verification_token = secrets.token_hex(16)  # 32-char hex
        self.save(update_fields=['verification_token'])
        return self.verification_token


class InstallToken(models.Model):
    """Scoped token for script installation. The raw token is shown once on
    creation and never stored — only the SHA-256 hash is persisted. Used by
    shield.js to authenticate without exposing workspace secrets."""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(
        Workspace, on_delete=models.CASCADE, related_name='install_tokens',
    )
    token_hash = models.CharField(max_length=64, unique=True)
    token_prefix = models.CharField(max_length=12, help_text='First chars for display.')
    label = models.CharField(max_length=100, default='Primary')
    expires_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    last_used_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.token_prefix}… ({self.workspace_id})'

    @staticmethod
    def create_for_workspace(workspace, label='Primary'):
        """Generate a new install token. Returns (raw_token, token_instance).
        The raw token MUST be shown to the user once — it cannot be recovered."""
        import secrets
        import hashlib
        raw_token = 'vc_' + secrets.token_urlsafe(48)
        token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
        token_prefix = raw_token[:12]
        instance = InstallToken.objects.create(
            workspace=workspace,
            token_hash=token_hash,
            token_prefix=token_prefix,
            label=label,
        )
        return raw_token, instance

    @staticmethod
    def verify_token(raw_token):
        """Look up a workspace by raw install token. Returns (workspace, token) or (None, None)."""
        import hashlib
        token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
        try:
            token = InstallToken.objects.select_related('workspace').get(
                token_hash=token_hash, is_active=True,
            )
            if token.expires_at and token.expires_at < timezone.now():
                return None, None
            token.last_used_at = timezone.now()
            token.save(update_fields=['last_used_at'])
            return token.workspace, token
        except InstallToken.DoesNotExist:
            return None, None


class RedirectRoute(models.Model):
    """One redirect rule scoped to a single domain. The edge proxy fetches
    routes from the backend API for each domain it receives traffic on."""

    class BotAction(models.TextChoices):
        HONEYPOT = 'honeypot', 'Honeypot (trap bots)'
        BLOCK = 'block', 'Block (404)'
        NEUTRAL = 'neutral', 'Neutral (empty page)'
        REDIRECT = 'redirect', 'Redirect to fallback'

    class AbuseStatus(models.TextChoices):
        NONE = 'none', 'No abuse'
        FLAGGED = 'flagged', 'Flagged for review'
        BLOCKED = 'blocked', 'Blocked'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(
        Workspace, on_delete=models.CASCADE, related_name='redirect_routes',
    )
    domain = models.OneToOneField(
        DomainRegistry, on_delete=models.CASCADE, related_name='redirect_route',
    )
    slug = models.SlugField(
        max_length=100, blank=True, default='',
        help_text='Short path on the redirect domain. Empty = root.',
    )
    destination_url = models.URLField(max_length=2048)
    bot_action = models.CharField(
        max_length=10, choices=BotAction.choices, default=BotAction.HONEYPOT,
    )
    fallback_url = models.URLField(
        max_length=2048, blank=True, default='',
        help_text='Where to send suspected bots (empty = neutral fallback).',
    )
    is_active = models.BooleanField(default=True)
    expires_at = models.DateTimeField(
        null=True, blank=True,
        help_text='After this time the redirect stops working. Auto-set to 7 days from creation.',
    )
    destination_safe = models.BooleanField(
        null=True, default=None,
        help_text='Last safety-check result for the destination URL.',
    )
    clicks_count = models.PositiveIntegerField(default=0)
    abuse_status = models.CharField(
        max_length=10, choices=AbuseStatus.choices, default=AbuseStatus.NONE,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'redirect_routes'
        ordering = ['-created_at']
        constraints = [
            models.UniqueConstraint(
                fields=['domain', 'slug'],
                condition=models.Q(is_active=True),
                name='unique_active_route_per_domain_slug',
            ),
        ]

    def __str__(self):
        return f'{self.domain.domain}/{self.slug} -> {self.destination_url}'


class EdgeSyncCredential(models.Model):
    """Shared secret between backend and each edge proxy node. Used to
    authenticate the edge → backend routes-sync polling endpoint."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(
        Workspace, on_delete=models.CASCADE, related_name='edge_credentials',
    )
    label = models.CharField(
        max_length=100, default='default',
        help_text='Human label for this edge node (e.g. "FlokiNET DE").',
    )
    key_hash = models.CharField(
        max_length=64, unique=True, default='',
        help_text='SHA-256 of the raw key. Never stored in plaintext.',
    )
    key_prefix = models.CharField(
        max_length=12, default='',
        help_text='First 12 chars for display (ek_a1b2c3d4...).',
    )
    is_active = models.BooleanField(default=True)
    last_sync_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'edge_sync_credentials'
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.label} ({self.workspace_id})'

    @staticmethod
    def create_for_workspace(workspace, label='default'):
        """Generate a new edge credential. Returns (raw_key, instance).
        Raw key is shown once and never stored."""
        import hashlib
        raw_key = 'ek_' + secrets.token_urlsafe(36)
        key_hash = hashlib.sha256(raw_key.encode()).hexdigest()
        key_prefix = raw_key[:12]
        instance = EdgeSyncCredential.objects.create(
            workspace=workspace,
            label=label,
            key_hash=key_hash,
            key_prefix=key_prefix,
        )
        return raw_key, instance

    @staticmethod
    def verify_key(raw_key):
        """Look up an active credential by raw key. Returns (workspace, instance) or (None, None)."""
        import hashlib
        try:
            key_hash = hashlib.sha256(raw_key.encode()).hexdigest()
            cred = EdgeSyncCredential.objects.select_related('workspace').get(
                key_hash=key_hash, is_active=True,
            )
            cred.last_sync_at = now()
            cred.save(update_fields=['last_sync_at'])
            return cred.workspace, cred
        except EdgeSyncCredential.DoesNotExist:
            return None, None


class RedirectEvent(models.Model):
    """Click/visit event logged by the edge proxy and batch-pushed to the
    control plane. Stores redirect analytics data."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(
        Workspace, on_delete=models.CASCADE, related_name='redirect_events',
    )
    redirect_route = models.ForeignKey(
        RedirectRoute, on_delete=models.CASCADE, related_name='events',
    )
    domain = models.CharField(max_length=253, db_index=True)
    slug = models.CharField(max_length=100, blank=True, default='')
    ip = models.GenericIPAddressField()
    user_agent = models.TextField(blank=True, default='')
    destination = models.URLField(max_length=2048)
    verdict = models.CharField(max_length=20)
    is_bot = models.BooleanField(default=False)
    country_code = models.CharField(max_length=2, blank=True, default='')
    country = models.CharField(max_length=64, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'redirect_events'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['workspace', 'created_at']),
            models.Index(fields=['domain', 'created_at']),
        ]


class SiteConfig(models.Model):
    # Admin-managed business toggles (a singleton: only the 'default' row is
    # ever used). These live in the database so an operator can flip them from
    # the Jazzmin admin without editing .env or redeploying.
    key = models.CharField(max_length=50, primary_key=True, default='default')
    signups_open = models.BooleanField(
        default=True,
        help_text='While True, new accounts (register and Google sign-in) are allowed.',
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Site configuration'
        verbose_name_plural = 'Site configuration'

    def __str__(self):
        return 'VeriClick site configuration'

    def save(self, *args, **kwargs):
        # Enforce the singleton pattern from the admin and the API alike.
        self.key = 'default'
        return super().save(*args, **kwargs)

    @classmethod
    def load(cls):
        obj, _ = cls.objects.get_or_create(key='default')
        return obj

    @classmethod
    def signups_allowed(cls):
        try:
            return cls.load().signups_open
        except Exception:
            return True


class Plan(models.Model):
    # Paid tiers shown on the pricing page. The only difference between tiers
    # today is the number of domains a workspace can register: Basic 5, Plus 10,
    # Pro 20. Prices are monthly and USD.
    code = models.SlugField(max_length=50, unique=True, help_text='e.g. basic, plus, pro')
    name = models.CharField(max_length=100, help_text='Display name, e.g. Basic')
    monthly_price = models.DecimalField(
        max_digits=8, decimal_places=2, help_text='Monthly price in USD.',
    )
    domain_limit = models.PositiveIntegerField(
        help_text='How many domains a workspace on this plan may register.',
    )
    features = models.JSONField(default=list, blank=True, help_text='Extra bullet points shown on the pricing page.')
    bachs_product_id = models.CharField(
        max_length=64, blank=True, default='',
        help_text=(
            'The Bachs recurring product ID (prod_...) this plan is sold as. '
            'Create a matching recurring product in Bachs, then paste its ID '
            'here — upgrading to this plan routes through that product\'s '
            'checkout.'
        ),
    )
    bachs_payment_link = models.URLField(
        max_length=512, blank=True, default='',
        help_text=(
            'Optional Bachs payment link (https://checkout.bachs.io/pay/pl_...) '
            'for this product, for reference / manual invoicing. Not used by '
            'the API — checkouts are created per customer so attributions and '
            'auto-granting work.'
        ),
    )
    bachs_ot_product_id = models.CharField(
        max_length=64, blank=True, default='',
        help_text=(
            'The Bachs ONE-TIME product ID (prod_...) used when a customer buys '
            'a 30-day "period" of this plan. One-time checkouts are the only '
            'ones that can show card / crypto / bank transfer / mobile money. '
            'Leave blank to fall back to bachs_product_id.'
        ),
    )
    is_active = models.BooleanField(default=True, help_text='Inactive plans are hidden from the pricing endpoint.')
    sort_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['sort_order', 'code']

    def __str__(self):
        return f'{self.name} (${self.monthly_price}/mo)'


class CheckoutIntent(models.Model):
    # One row per checkout session a workspace starts for a plan. Bachs is the
    # source of truth for whether payment actually happened: the row stays OPEN
    # until a verified collection.succeeded webhook arrives, at which point the
    # workspace's plan is set. A redirect back to the app is never enough.
    class Status(models.TextChoices):
        OPEN = 'open', 'Open'
        PAID = 'paid', 'Paid'
        FAILED = 'failed', 'Failed'

    class BillingMode(models.TextChoices):
        SUBSCRIPTION = 'subscription', 'Recurring card subscription'
        PERIOD = 'period', 'One-time period (any payment channel)'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(
        Workspace, on_delete=models.CASCADE, related_name='checkout_intents',
    )
    plan = models.ForeignKey(
        Plan, on_delete=models.CASCADE, related_name='checkout_intents',
    )
    user = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='checkout_intents',
        help_text='The account that started the checkout (for the upgrade email).',
    )
    billing_mode = models.CharField(
        max_length=16, choices=BillingMode.choices, default=BillingMode.SUBSCRIPTION,
        help_text='subscription = recurring card charge; period = one-time payment covering a billing period.',
    )
    payment_method = models.CharField(
        max_length=24, blank=True, default='',
        help_text='Payment channel actually used (card, mobile_money, crypto, bank_transfer), when the webhook reports it.',
    )
    checkout_id = models.CharField(
        max_length=100, blank=True, default='', db_index=True,
        help_text="Bachs checkout ID (chk_...). Empty until Bachs answers.",
    )
    charge_id = models.CharField(
        max_length=100, blank=True, default='',
        help_text="Bachs charge ID (chr_...), if provided on the webhook.",
    )
    status = models.CharField(
        max_length=10, choices=Status.choices, default=Status.OPEN,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.checkout_id or "pending"} -> {self.plan} ({self.status})'


class DiscountCode(models.Model):
    # Admin-managed promo codes. Currently the single product decision is a
    # flat percentage off, e.g. 20%. Codes are created in the Django admin.
    code = models.CharField(max_length=50, unique=True, db_index=True)
    discount_percent = models.PositiveIntegerField(
        help_text='Percentage off the monthly price, 1-100 (e.g. 20).',
    )
    is_active = models.BooleanField(default=True)
    max_uses = models.PositiveIntegerField(
        null=True, blank=True, help_text='Total number of times this code can be used. Blank = unlimited.',
    )
    uses_count = models.PositiveIntegerField(default=0)
    expires_at = models.DateTimeField(null=True, blank=True, help_text='Optional expiry. Blank = never expires.')
    created_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='created_discount_codes',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.code} (-{self.discount_percent}%)'

    def is_usable(self):
        from django.utils import timezone
        if not self.is_active:
            return False
        if self.expires_at and self.expires_at <= timezone.now():
            return False
        if self.max_uses is not None and self.uses_count >= self.max_uses:
            return False
        return True

    def apply_use(self):
        self.uses_count += 1
        self.save(update_fields=['uses_count'])


class BillingEvent(models.Model):
    # Append-only money/journal ledger for the workspace's payment history.
    # Bachs stays the source of truth for the money itself; this table mirrors
    # what happened for customer-facing history and receipts. Each row is a
    # snapshot (plan name + amount) so history stays correct even if a plan's
    # price changes later.
    class Kind(models.TextChoices):
        TRIAL_STARTED = 'trial_started', 'Trial started'
        PLAN_PURCHASED = 'plan_purchased', 'Plan purchased'
        PLAN_RENEWED = 'plan_renewed', 'Plan renewed'
        PLAN_PERIOD_PAID = 'plan_period_paid', 'One-time period paid'
        PLAN_EXPIRING = 'plan_expiring', 'Period expiring soon'
        PLAN_EXPIRED = 'plan_expired', 'Billing period ended'
        PLAN_SUSPENDED = 'plan_suspended', 'Access suspended'
        PAYMENT_FAILED = 'payment_failed', 'Payment failed'
        REFUNDED = 'refunded', 'Refunded'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(
        Workspace, on_delete=models.CASCADE, related_name='billing_events',
    )
    kind = models.CharField(max_length=24, choices=Kind.choices)
    plan = models.ForeignKey(
        Plan, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='billing_events',
    )
    plan_name = models.CharField(max_length=100, blank=True, default='')
    amount = models.DecimalField(
        max_digits=8, decimal_places=2, null=True, blank=True,
        help_text='Amount charged (USD unless currency says otherwise).',
    )
    currency = models.CharField(max_length=8, default='USD')
    charge_id = models.CharField(
        max_length=100, blank=True, default='', db_index=True,
        help_text='Bachs charge ID (chr_...), when known.',
    )
    checkout_id = models.CharField(max_length=100, blank=True, default='', db_index=True)
    note = models.CharField(max_length=255, blank=True, default='')
    data = models.JSONField(default=dict, blank=True, help_text='Extra snapshot info (mode, channel, expiry, etc.).')
    occurred_at = models.DateTimeField(db_index=True)

    class Meta:
        ordering = ['-occurred_at']

    def __str__(self):
        return f'{self.workspace_id} {self.kind} {self.amount} {self.occurred_at}'


# --- Abuse prevention models ------------------------------------------------


class UserProfile(models.Model):
    """Per-user profile for terms-of-service acceptance and abuse tracking.
    Created alongside the user on first login / registration."""
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='vericlick_profile')
    tos_accepted_at = models.DateTimeField(
        null=True, blank=True,
        help_text='When the user last accepted the Terms of Service.',
    )
    tos_version = models.CharField(
        max_length=20, blank=True, default='',
        help_text='Version string of the ToS the user accepted (e.g. "2026-08-v1").',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'Profile({self.user.username})'


class BlockedDestination(models.Model):
    """URLs known to be malicious (phishing, malware, scam). Checked at link
    creation and during daily re-scans. Entries are global — they block any
    workspace from using the URL as a destination."""
    url = models.URLField(max_length=2048, unique=True, db_index=True)
    reason = models.CharField(max_length=255, blank=True, default='')
    source = models.CharField(
        max_length=20, blank=True, default='',
        help_text='How this block was added (manual, safe_browsing, abuse_report, etc.).',
    )
    added_by = models.ForeignKey(
        User, on_delete=models.SET_NULL, null=True, blank=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'BLOCKED: {self.url}'


@receiver(post_save, sender=User)
def create_user_workspace(sender, instance, created, **kwargs):
    Workspace.objects.get_or_create(
        owner=instance,
        defaults={'name': f"{instance.username}'s Workspace"},
    )
