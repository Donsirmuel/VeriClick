import uuid
import secrets
import string
import socket
from django.db import models
from django.contrib.auth.models import User
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.utils.timezone import now


class Workspace(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name='workspaces')
    tracker_secret = models.UUIDField(default=uuid.uuid4, editable=False)
    safe_destination = models.URLField(
        max_length=2048, blank=True, default='',
        help_text='Where suspicious traffic is sent instead of the real destination.',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    last_domain_scan_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return self.name


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
        # Only confirms the domain resolves. Ownership verification is a
        # separate step (DNS TXT record) so "resolves" and "verified" are
        # never conflated in the UX.
        try:
            socket.getaddrinfo(self.domain, 80, proto=socket.IPPROTO_TCP)
            self.health_status = self.HealthStatus.HEALTHY
        except Exception:
            self.health_status = self.HealthStatus.DEGRADED
        finally:
            self.last_checked = now()
            self.save(update_fields=['health_status', 'last_checked'])


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


@receiver(post_save, sender=User)
def create_user_workspace(sender, instance, created, **kwargs):
    Workspace.objects.get_or_create(
        owner=instance,
        defaults={'name': f"{instance.username}'s Workspace"},
    )
