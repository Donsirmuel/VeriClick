import uuid
import secrets
import string
import socket
import re
from django.db import models
from django.contrib.auth.models import User
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.utils.timezone import now


def _resolve_addresses(host):
    # Best-effort DNS resolution returning a set of IP strings for a host.
    # Uses dnspython when available (same dependency as TXT ownership checks);
    # follows CNAMEs automatically when querying A/AAAA records.
    addrs = set()
    try:
        import dns.resolver
        for record_type in ('A', 'AAAA'):
            try:
                answers = dns.resolver.resolve(host, record_type, lifetime=5)
                addrs |= {r.address for r in answers}
            except Exception:
                continue
    except ImportError:
        try:
            for info in socket.getaddrinfo(host, None):
                addrs.add(info[4][0])
        except Exception:
            return set()
    return addrs


def _target_addresses():
    # The addresses we expect a customer tracking domain to resolve to. Prefers
    # an explicit TRACKING_SERVER_IP; otherwise resolves PUBLIC_TRACKING_BASE_URL
    # (e.g. getvericlick.site) — the same host Caddy serves.
    from django.conf import settings as django_settings
    configured = getattr(django_settings, 'TRACKING_SERVER_IP', '').strip()
    if configured:
        return {configured}
    base = getattr(django_settings, 'PUBLIC_TRACKING_BASE_URL', '').strip().rstrip('/')
    host = re.sub(r'^https?://', '', base).split('/')[0].strip()
    if not host:
        return {'127.0.0.1'}
    return _resolve_addresses(host)


def tracking_host(domain):
    """The hostname tracked links actually live on for a registered domain.
    An apex (2-label) domain can't hold a CNAME record, so its branded links
    run on the standard `t.` subdomain instead (e.g. t.example.com). Subdomains
    keep their own name (e.g. links.example.com stays links.example.com)."""
    domain = (domain or '').strip().rstrip('.')
    labels = [part for part in domain.split('.') if part]
    if len(labels) <= 2:
        return f't.{domain}' if domain else ''
    return domain


def domain_points_to_this_server(domain):
    """True when the domain's branded tracking host points at this server (an
    A/CNAME record that resolves to our IPs). This is stricter than "resolves
    somewhere" and is the state that must hold before tracked links can live on
    the custom domain. Apex domains are checked through their `t.` subdomain,
    since DNS providers forbid CNAME on the root of a domain."""
    if not domain:
        return False
    domain = domain.strip().rstrip('.')
    if not domain:
        return False
    target = _target_addresses()
    if not target:
        return False
    return bool(_resolve_addresses(tracking_host(domain)) & target)


class Workspace(models.Model):
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
        help_text='The paid plan this workspace is on. Null means free/beta (no paid plan).',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    last_domain_scan_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.name

    @property
    def effective_domain_limit(self):
        # The number of domains a workspace may register. During beta
        # (SiteConfig.beta_free_mode) and for workspaces with no paid plan the
        # limit is unlimited (None). Once beta ends, the limit comes from the
        # plan.
        if SiteConfig.is_beta_free_mode() or not self.plan:
            return None
        return self.plan.domain_limit

    def domains_in_use(self):
        return self.domains.count()

    @property
    def can_add_domain(self):
        limit = self.effective_domain_limit
        if limit is None:
            return True
        return self.domains_in_use() < limit


class DomainRegistry(models.Model):
    class HealthStatus(models.TextChoices):
        HEALTHY = 'healthy', 'Healthy'
        DEGRADED = 'degraded', 'Degraded'
        BLACKLISTED = 'blacklisted', 'Blacklisted'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(
        Workspace, on_delete=models.CASCADE, related_name='domains',
    )
    domain = models.CharField(max_length=255, unique=True)
    health_status = models.CharField(
        max_length=20, choices=HealthStatus.choices, default=HealthStatus.HEALTHY
    )
    verified = models.BooleanField(
        default=False,
        help_text=(
            'True only after the owner proves control by adding the TXT '
            'verification record. Distinct from health_status, which only '
            'confirms the domain resolves.'
        ),
    )
    points_to_server = models.BooleanField(
        default=False,
        help_text=(
            'True when the domain does more than resolve — its DNS points at '
            'this server (A/CNAME to the VeriClick IP). A domain must resolve, '
            'be verified, and point at the server before tracking links can '
            'live on it.'
        ),
    )
    verification_token = models.CharField(
        max_length=64, default=uuid.uuid4, editable=False,
        help_text='Random token used to prove DNS ownership via a TXT record.',
    )
    last_checked = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name_plural = 'Domain registries'
        ordering = ['domain']

    def __str__(self):
        return self.domain

    @property
    def verification_record(self):
        # The exact TXT record value an owner publishes to prove they control
        # the domain. Publishing this and running verify marks the domain
        # ownership-verified in the dashboard.
        return f'vericlick-verify={self.verification_token}'

    def run_health_check(self):
        # Two independent signals, both required before links can live on the
        # custom domain:
        #   1. health_status: the domain resolves at all (legacy semantics).
        #   2. points_to_server: it resolves to *this* server — verified via DNS
        #      (A/CNAME chain, or a configured TRACKING_SERVER_IP fallback). A
        #      domain that resolves to some other host (e.g. the customer's old
        #      web host) is NOT in a state to serve our tracked URLs.
        # Ownership verification (TXT) remains a separate step ("verified").
        try:
            socket.getaddrinfo(self.domain, 80, proto=socket.IPPROTO_TCP)
            self.health_status = self.HealthStatus.HEALTHY
        except Exception:
            self.health_status = self.HealthStatus.DEGRADED
        try:
            self.points_to_server = domain_points_to_this_server(self.domain)
        except Exception:
            # Never let a DNS lookup failure break the health-check request.
            self.points_to_server = False
        finally:
            self.last_checked = now()
            self.save(update_fields=['health_status', 'points_to_server', 'last_checked'])


class TrackingLink(models.Model):
    class Status(models.TextChoices):
        ACTIVE = 'active', 'Active'
        PAUSED = 'paused', 'Paused'
        DISABLED = 'disabled', 'Disabled'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(
        Workspace, on_delete=models.CASCADE, related_name='links',
    )
    domain = models.ForeignKey(
        DomainRegistry, on_delete=models.SET_NULL, null=True, blank=True, related_name='links'
    )
    slug = models.CharField(max_length=100, unique=True)
    destination_url = models.URLField(max_length=2048)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.ACTIVE)
    total_clicks = models.PositiveIntegerField(default=0)
    bot_clicks = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.slug} -> {self.destination_url}'


class ClickLog(models.Model):
    class Decision(models.TextChoices):
        ALLOWED = 'allowed', 'Allowed'
        CHALLENGED = 'challenged', 'Challenged'
        BLOCKED = 'blocked', 'Blocked'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    link = models.ForeignKey(TrackingLink, on_delete=models.CASCADE, related_name='clicks')
    ip = models.GenericIPAddressField()
    country = models.CharField(max_length=100, blank=True, default='')
    region = models.CharField(max_length=100, blank=True, default='')
    city = models.CharField(max_length=100, blank=True, default='')
    device = models.CharField(max_length=200, blank=True, default='')
    user_agent = models.TextField(blank=True, default='')
    is_bot = models.BooleanField(default=False)
    reason = models.CharField(max_length=100, blank=True, default='')
    decision = models.CharField(
        max_length=20, choices=Decision.choices, default=Decision.ALLOWED,
    )
    matched_rule = models.CharField(max_length=255, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.ip} -> {self.link.slug} ({"bot" if self.is_bot else "human"})'


class IPRule(models.Model):
    class Action(models.TextChoices):
        ALLOW = 'allow', 'Allow'
        DENY = 'deny', 'Deny'

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(
        Workspace, on_delete=models.CASCADE, related_name='ip_rules',
    )
    ip_or_cidr = models.CharField(max_length=45, help_text='Single IP or CIDR notation')
    action = models.CharField(max_length=10, choices=Action.choices)
    reason = models.CharField(max_length=255, blank=True, default='')
    expires_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
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


class TrackerEvent(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    workspace = models.ForeignKey(
        Workspace, on_delete=models.CASCADE, related_name='tracker_events',
    )
    page_url = models.URLField(max_length=2048)
    referrer = models.URLField(max_length=2048, blank=True, default='')
    signals = models.JSONField(default=dict, blank=True)
    engagement = models.JSONField(default=dict, blank=True)
    ip = models.GenericIPAddressField()
    user_agent = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.ip} -> {self.page_url}'


class SiteConfig(models.Model):
    # Admin-managed business toggles (a singleton: only the 'default' row is
    # ever used). These live in the database so an operator can flip them from
    # the Jazzmin admin without editing .env or redeploying.
    key = models.CharField(max_length=50, primary_key=True, default='default')
    beta_free_mode = models.BooleanField(
        default=True,
        help_text=(
            'While True (beta), every feature is free: plan limits are not '
            'enforced and workspaces get unlimited domains. Set False to start '
            'enforcing the paid plan domain limits.'
        ),
    )
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
    def is_beta_free_mode(cls):
        # Fail-open: if the DB row cannot be read (e.g. migrations not run),
        # assume beta/free so the app never locks users out unexpectedly.
        try:
            return cls.load().beta_free_mode
        except Exception:
            return True

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


@receiver(post_save, sender=User)
def create_user_workspace(sender, instance, created, **kwargs):
    Workspace.objects.get_or_create(
        owner=instance,
        defaults={'name': f"{instance.username}'s Workspace"},
    )
