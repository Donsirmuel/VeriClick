import uuid
from django.db import models
from django.contrib.auth.models import User
from django.db.models.signals import post_save
from django.dispatch import receiver


class Workspace(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    owner = models.ForeignKey(User, on_delete=models.CASCADE, related_name='workspaces')
    created_at = models.DateTimeField(auto_now_add=True)

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
    last_checked = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name_plural = 'Domain registries'
        ordering = ['domain']

    def __str__(self):
        return self.domain


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
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    link = models.ForeignKey(TrackingLink, on_delete=models.CASCADE, related_name='clicks')
    ip = models.GenericIPAddressField()
    country = models.CharField(max_length=100, blank=True, default='')
    device = models.CharField(max_length=200, blank=True, default='')
    user_agent = models.TextField(blank=True, default='')
    is_bot = models.BooleanField(default=False)
    reason = models.CharField(max_length=100, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.ip} -> {self.link.slug} ({"bot" if self.is_bot else "human"})'


@receiver(post_save, sender=User)
def create_user_workspace(sender, instance, created, **kwargs):
    Workspace.objects.get_or_create(
        owner=instance,
        defaults={'name': f"{instance.username}'s Workspace"},
    )
