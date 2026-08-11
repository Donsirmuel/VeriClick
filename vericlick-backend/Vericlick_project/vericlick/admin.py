from django.contrib import admin
from django.utils import timezone

from .models import (
    Workspace, DomainRegistry, TrackingLink, ClickLog, IPRule,
    TrackerEvent, Plan, DiscountCode, SiteConfig, CheckoutIntent,
)


class DomainRegistryInline(admin.TabularInline):
    model = DomainRegistry
    extra = 0
    fields = ('domain', 'health_status', 'verified', 'last_checked')
    readonly_fields = ('health_status', 'verified', 'last_checked')


class TrackingLinkInline(admin.TabularInline):
    model = TrackingLink
    extra = 0
    fields = ('slug', 'domain', 'destination_url', 'status', 'total_clicks', 'bot_clicks')
    readonly_fields = ('total_clicks', 'bot_clicks')


@admin.register(Workspace)
class WorkspaceAdmin(admin.ModelAdmin):
    list_display = ('name', 'owner', 'plan', 'domain_count', 'tracker_secret', 'created_at')
    # `plan` is editable inline from the list page so an admin can upgrade a
    # workspace (e.g. hand testers a higher tier) without going through checkout.
    list_editable = ('plan',)
    list_select_related = ('owner', 'plan')
    list_filter = ('plan', 'created_at')
    search_fields = ('name', 'owner__username', 'owner__email')
    readonly_fields = ('id', 'tracker_secret', 'created_at', 'last_domain_scan_at', 'plan_started_at')
    inlines = [DomainRegistryInline, TrackingLinkInline]
    autocomplete_fields = ['owner']
    date_hierarchy = 'created_at'

    @admin.display(description='Domains (verified)')
    def domain_count(self, obj):
        return obj.domains_in_use()


@admin.register(DomainRegistry)
class DomainRegistryAdmin(admin.ModelAdmin):
    list_display = ('domain', 'workspace', 'health_status', 'verified', 'removed_at', 'last_checked', 'created_at')
    list_filter = ('health_status', 'verified', 'removed_at', 'last_checked')
    search_fields = ('domain', 'workspace__name', 'workspace__owner__username')
    readonly_fields = ('id', 'verification_token', 'verification_record', 'created_at', 'last_checked', 'removed_at')
    actions = ['recheck_domains']
    date_hierarchy = 'created_at'

    @admin.action(description='Re-check health for selected domains')
    def recheck_domains(self, request, queryset):
        checked = 0
        for domain in queryset:
            try:
                domain.run_health_check()
                checked += 1
            except Exception:
                continue
        self.message_user(request, f'Re-checked {checked} domain(s).')


@admin.register(TrackingLink)
class TrackingLinkAdmin(admin.ModelAdmin):
    list_display = ('slug', 'workspace', 'domain', 'destination_url', 'status', 'removed_at', 'total_clicks', 'bot_clicks', 'created_at')
    list_filter = ('status', 'removed_at', 'created_at')
    search_fields = ('slug', 'destination_url', 'workspace__name')
    readonly_fields = ('id', 'total_clicks', 'bot_clicks', 'created_at', 'updated_at', 'removed_at')
    autocomplete_fields = ['workspace', 'domain']
    date_hierarchy = 'created_at'


@admin.register(ClickLog)
class ClickLogAdmin(admin.ModelAdmin):
    list_display = ('ip', 'link', 'decision', 'is_bot', 'reason', 'matched_rule', 'country', 'city', 'created_at')
    list_filter = ('decision', 'is_bot', 'reason', 'created_at')
    search_fields = ('ip', 'link__slug', 'reason', 'matched_rule')
    readonly_fields = ('id', 'created_at')
    date_hierarchy = 'created_at'


@admin.register(IPRule)
class IPRuleAdmin(admin.ModelAdmin):
    list_display = ('ip_or_cidr', 'workspace', 'action', 'is_active', 'expires_at', 'created_at')
    list_filter = ('action', 'is_active', 'created_at')
    search_fields = ('ip_or_cidr', 'workspace__name', 'reason')
    autocomplete_fields = ['workspace', 'created_by']
    date_hierarchy = 'created_at'


@admin.register(TrackerEvent)
class TrackerEventAdmin(admin.ModelAdmin):
    list_display = ('ip', 'workspace', 'page_url', 'referrer', 'created_at')
    list_filter = ('created_at',)
    search_fields = ('ip', 'page_url', 'referrer', 'workspace__name')
    readonly_fields = ('id', 'signals', 'engagement', 'created_at')
    autocomplete_fields = ['workspace']
    date_hierarchy = 'created_at'


@admin.register(Plan)
class PlanAdmin(admin.ModelAdmin):
    list_display = ('code', 'name', 'monthly_price', 'domain_limit', 'bachs_product_id', 'features_preview', 'is_active', 'sort_order')
    list_filter = ('is_active',)
    search_fields = ('code', 'name')
    list_editable = ('monthly_price', 'domain_limit', 'bachs_product_id', 'is_active', 'sort_order')

    @admin.display(description='Features')
    def features_preview(self, obj):
        return '; '.join(obj.features or [])[:80]


@admin.register(CheckoutIntent)
class CheckoutIntentAdmin(admin.ModelAdmin):
    list_display = ('id', 'workspace', 'plan', 'status', 'checkout_id', 'created_at')
    list_filter = ('status', 'created_at')
    search_fields = ('workspace__name', 'checkout_id', 'charge_id')
    readonly_fields = ('id', 'created_at', 'updated_at')
    autocomplete_fields = ['workspace', 'plan', 'user']
    date_hierarchy = 'created_at'


@admin.register(SiteConfig)
class SiteConfigAdmin(admin.ModelAdmin):
    # The singleton business-toggle row. Because SiteConfig.save() forces
    # key='default', there is only ever one of these.
    list_display = ('key', 'signups_open', 'updated_at')
    fieldsets = (
        (None, {'fields': ('signups_open',)}),
        ('Meta', {'fields': ('key',)}),
    )
    readonly_fields = ('key',)
    has_add_permission = lambda self, request: not SiteConfig.objects.exists()
    has_delete_permission = lambda self, request, obj=None: False


@admin.register(DiscountCode)
class DiscountCodeAdmin(admin.ModelAdmin):
    list_display = ('code', 'discount_percent', 'is_active', 'uses_count', 'max_uses', 'expires_at', 'created_at')
    list_filter = ('is_active', 'expires_at', 'created_at')
    search_fields = ('code',)
    readonly_fields = ('uses_count', 'created_at')
    autocomplete_fields = ['created_by']
    date_hierarchy = 'created_at'