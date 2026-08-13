import uuid
import secrets
import string
import socket
import re
from datetime import timedelta
from django.db import models
from django.db.models import Q
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
    last_domain_scan_at = models.DateTimeField(null=True, blank=True)
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
    def active_plan(self):
        # The plan that is currently in force (None once a period has lapsed).
        return self.plan if self.is_plan_active() else None

    @property
    def effective_domain_limit(self):
        # The number of domains a workspace may register. Paid workspaces get
        # their plan's limit; free workspaces get exactly 1 domain for the
        # trial week (unlimited is never returned now that beta is gone).
        if not self.is_plan_active():
            return 1
        return self.plan.domain_limit

    @property
    def effective_link_limit(self):
        # Free workspaces get 1 link during their trial week. Paid workspaces
        # have no link limit.
        if not self.is_plan_active():
            return 1
        return None

    @property
    def current_period_start(self):
        # The date the current counting period began. Paid workspaces advance a
        # 30-day period (lazily, from when the plan was assigned); free
        # workspaces use the 7-day trial window. Soft-deleted domains/links stop
        # counting once their removal predates this boundary.
        if self.is_plan_active():
            base = self.plan_started_at or now()
            period = base
            while period + timedelta(days=PLAN_PERIOD_DAYS) <= now():
                period += timedelta(days=PLAN_PERIOD_DAYS)
            return period
        return self.trial_started_at

    def domains_in_use(self):
        # Only VERIFIED domains occupy a plan slot — a typo you can never
        # verify doesn't count, so you can remove and re-add it freely. Deleting
        # a verified domain keeps it counted until the current plan/trial period
        # ends, so users can't churn domains to dodge their limit.
        period = self.current_period_start
        if period is None:
            return 0
        return self.domains.filter(verified=True).filter(
            Q(removed_at__isnull=True) | Q(removed_at__gte=period)
        ).count()

    def links_in_use(self):
        # Only links on a VERIFIED domain count toward the link limit. Links on
        # the shared VeriClick host (no custom domain, or an unverified one) are
        # not plan-gated. Deleted links keep their slot until the period ends.
        period = self.current_period_start
        if period is None:
            return 0
        return self.links.filter(domain__verified=True).filter(
            Q(removed_at__isnull=True) | Q(removed_at__gte=period)
        ).count()

    def ensure_trial_started(self):
        # The 7-day free trial begins the first time a free workspace is
        # touched. Upgrading makes the trial permanently irrelevant.
        if self.trial_started_at is None and not self.is_plan_active():
            self.trial_started_at = now()
            self.save(update_fields=['trial_started_at'])
            # Money-event ledger entry so the billing history shows the trial.
            from .models import BillingEvent
            BillingEvent.objects.create(
                workspace=self,
                kind=BillingEvent.Kind.TRIAL_STARTED,
                plan_name='',
                amount=None,
                currency='USD',
                occurred_at=self.trial_started_at,
                note=f'{FREE_TRIAL_DAYS}-day free trial started',
            )
        return self.trial_started_at

    @property
    def trial_expires_at(self):
        if self.is_plan_active() or not self.trial_started_at:
            return None
        return self.trial_started_at + timedelta(days=FREE_TRIAL_DAYS)

    @property
    def trial_active(self):
        expires = self.trial_expires_at
        return expires is not None and now() < expires

    @property
    def can_add_domain(self):
        if self.is_plan_active():
            return self.domains_in_use() < self.effective_domain_limit
        if not self.trial_active:
            return False
        return self.domains_in_use() < 1

    @property
    def can_add_link(self):
        if self.is_plan_active():
            return True
        if not self.trial_active:
            return False
        return self.links_in_use() < 1


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
    health_detail = models.JSONField(
        default=dict, blank=True,
        help_text=(
            'Last DNS diagnosis report from the health scan: one plain-language '
            'finding per layer (nameservers, apex, TXT, tracking host) with '
            'fix steps. Rendered in the app and in the admin so a "degraded" '
            'domain explains itself.'
        ),
    )
    created_at = models.DateTimeField(auto_now_add=True)
    removed_at = models.DateTimeField(
        null=True, blank=True,
        help_text=(
            'Soft-delete marker. A verified domain keeps occupying its plan '
            'slot until the current period ends even after removal; unverified '
            'domains never count and can be removed and re-added freely.'
        ),
    )

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
        # Full DNS diagnosis, persisted so the status explains itself:
        #   1. health_status: the registered domain resolves at all (legacy
        #      semantics — the apex, for root domains).
        #   2. points_to_server: the tracking host (e.g. t.example.com) resolves
        #      to *this* server — the signal that actually gates branded links.
        #   3. health_detail: the plain-language report shown in the app/admin.
        # Ownership verification (TXT) remains a separate step ("verified").
        from .services import diagnose_domain
        report = diagnose_domain(self)
        self.health_status = (
            self.HealthStatus.HEALTHY if report.get('apex_resolves')
            else self.HealthStatus.DEGRADED
        )
        self.points_to_server = bool(report.get('points_to_us'))
        self.health_detail = report
        self.last_checked = now()
        self.save(update_fields=['health_status', 'points_to_server', 'health_detail', 'last_checked'])


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
    removed_at = models.DateTimeField(
        null=True, blank=True,
        help_text=(
            'Soft-delete marker. A link on a verified domain keeps occupying '
            'its plan slot until the current period ends even after removal.'
        ),
    )

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
        indexes = [
            models.Index(fields=['-created_at'], name='clicklog_created_idx'),
            models.Index(fields=['link', '-created_at'], name='clicklog_link_created_idx'),
            models.Index(fields=['link', 'decision', '-created_at'], name='clicklog_link_dec_created_idx'),
        ]

    def __str__(self):
        return f'{self.ip} -> {self.link.slug} ({"bot" if self.is_bot else "human"})'


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


FREE_TRIAL_DAYS = 7
PLAN_PERIOD_DAYS = 30


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


@receiver(post_save, sender=User)
def create_user_workspace(sender, instance, created, **kwargs):
    Workspace.objects.get_or_create(
        owner=instance,
        defaults={'name': f"{instance.username}'s Workspace"},
    )
