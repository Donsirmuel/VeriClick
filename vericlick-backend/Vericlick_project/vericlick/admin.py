from django.contrib import admin
from django.http import HttpResponseRedirect
from django.shortcuts import render
from django.urls import reverse
from django.utils import timezone

from .models import (
    Workspace, IPRule, CountryRule,
    DevicePolicy, TrackerEvent, Plan, DiscountCode, SiteConfig, CheckoutIntent,
    BillingEvent, PLAN_PERIOD_DAYS,
    BlockedDestination, UserProfile,
    ShieldConfig, DomainRegistry, InstallToken, RedirectRoute, EdgeSyncCredential,
    RedirectEvent,
)



@admin.register(Workspace)
class WorkspaceAdmin(admin.ModelAdmin):
    list_display = ('name', 'owner', 'plan', 'plan_status', 'plan_billing_period', 'plan_expires_at', 'created_at')
    # `plan` is editable inline from the list page so an admin can upgrade a
    # workspace (e.g. hand testers a higher tier) without going through checkout.
    list_editable = ('plan', 'plan_billing_period')
    list_select_related = ('owner', 'plan')
    list_filter = ('plan', 'plan_billing_period', 'created_at')
    search_fields = ('name', 'owner__username', 'owner__email')
    # plan_billing_period stays EDITABLE: a Plan row holds both prices, so the
    # tier says nothing about whether this workspace bought a week or a month.
    # Granting a plan by hand means choosing both, and expiry has to be settable
    # alongside it or the grant has no end date.
    readonly_fields = ('id', 'tracker_secret', 'created_at', 'plan_started_at', 'plan_billing_mode', 'plan_status')
    inlines = []
    autocomplete_fields = ['owner']
    date_hierarchy = 'created_at'
    actions = ['record_manual_payment']

    def save_model(self, request, obj, form, change):
        """Editing the plan period or expiry here must reach existing links.

        Link expiry is stored (the edge reads it), so a link created under a
        weekly plan keeps its short date when the workspace is moved to monthly
        — it would expire while the plan paying for it is still running. Covers
        both the change form and inline edits on the list.
        """
        super().save_model(request, obj, form, change)
        if change:
            from .payments import extend_routes_to_plan
            extend_routes_to_plan(obj)

    @admin.display(description='Status')
    def plan_status(self, obj):
        return obj.plan_status

    @admin.action(description='Record a manual payment…')
    def record_manual_payment(self, request, queryset):
        # Logs a payment that came in outside the normal API checkout (e.g. a
        # Bachs payment link or an offline transfer) as a BillingEvent so it
        # shows up in the customer's payment history and in this admin. The
        # workspace's plan is only touched when the "activate plan" checkbox is
        # ticked; otherwise this is purely a ledger entry.
        from decimal import Decimal, InvalidOperation
        from datetime import timedelta

        changelist = reverse('admin:vericlick_workspace_changelist')
        if 'apply' in request.POST:
            kind = request.POST.get('kind') or BillingEvent.Kind.PLAN_PERIOD_PAID
            if kind not in BillingEvent.Kind.values:
                self.message_user(request, 'Invalid payment kind.', level='error')
                return HttpResponseRedirect(changelist)

            plan = None
            plan_id = request.POST.get('plan') or ''
            if plan_id:
                plan = Plan.objects.filter(pk=plan_id, is_active=True).first()

            amount = None
            raw_amount = request.POST.get('amount') or ''
            if raw_amount:
                try:
                    amount = Decimal(raw_amount)
                except InvalidOperation:
                    self.message_user(request, 'Amount must be a number.', level='error')
                    return HttpResponseRedirect(changelist)

            currency = (request.POST.get('currency') or 'USD').strip().upper() or 'USD'
            charge_id = (request.POST.get('charge_id') or '').strip()
            note = (request.POST.get('note') or '').strip()
            activate = request.POST.get('activate') == 'on'
            now = timezone.now()

            recorded = 0
            for ws in queryset:
                ws_plan = plan or ws.plan
                if ws_plan is None:
                    continue
                BillingEvent.objects.create(
                    workspace=ws,
                    kind=kind,
                    plan=ws_plan,
                    plan_name=ws_plan.name,
                    amount=amount if amount is not None else ws_plan.price_for(ws.plan_billing_period),
                    currency=currency,
                    charge_id=charge_id,
                    checkout_id='',
                    note=note or 'Recorded manually in the admin',
                    occurred_at=now,
                )
                if activate:
                    # Subscriptions were removed, so every activation extends a
                    # one-time period by the workspace's own cadence.
                    ws.plan = ws_plan
                    ws.plan_billing_mode = Workspace.BillingMode.PERIOD
                    # Shared with the webhook path: adds to time remaining,
                    # never onto a date that has already passed. Stacking onto
                    # a stale expiry granted a lapsed workspace nothing at all.
                    from .payments import next_expiry
                    ws.plan_expires_at = next_expiry(ws, ws.period_days, now=now)
                    ws.save()
                    # Same as a real payment: carry existing links forward.
                    from .payments import extend_routes_to_plan
                    extend_routes_to_plan(ws)
                recorded += 1

            self.message_user(
                request,
                f'Recorded {recorded} manual payment(s).'
                + (' Plan activated for the workspace(s).' if activate
                   else ' Workspace plan unchanged — set it via the "plan" column if needed.'),
            )
            return HttpResponseRedirect(changelist)

        context = {
            'queryset': queryset,
            'plans': Plan.objects.filter(is_active=True),
            'kinds': BillingEvent.Kind.choices,
            'default_kind': BillingEvent.Kind.PLAN_PERIOD_PAID,
            'opts': self.model._meta,
            'action_checkbox_name': admin.helpers.ACTION_CHECKBOX_NAME,
        }
        return render(request, 'admin/record_manual_payment.html', context)


@admin.register(IPRule)
class IPRuleAdmin(admin.ModelAdmin):
    list_display = ('ip_or_cidr', 'workspace', 'action', 'is_active', 'expires_at', 'created_at')
    list_filter = ('action', 'is_active', 'created_at')
    search_fields = ('ip_or_cidr', 'workspace__name', 'reason')
    autocomplete_fields = ['workspace', 'created_by']
    date_hierarchy = 'created_at'


@admin.register(CountryRule)
class CountryRuleAdmin(admin.ModelAdmin):
    list_display = ('country_code', 'workspace', 'action', 'is_active', 'source', 'created_at')
    list_filter = ('action', 'is_active', 'source', 'created_at')
    search_fields = ('country_code', 'workspace__name', 'reason')
    autocomplete_fields = ['workspace', 'created_by']
    date_hierarchy = 'created_at'


@admin.register(DevicePolicy)
class DevicePolicyAdmin(admin.ModelAdmin):
    list_display = ('workspace', 'allowed_preview', 'blocked_os_preview', 'updated_at')
    search_fields = ('workspace__name',)
    autocomplete_fields = ['workspace']
    readonly_fields = ('updated_at',)

    @admin.display(description='Allowed devices')
    def allowed_preview(self, obj):
        return ', '.join(obj.allowed_device_classes or []) or 'All'

    @admin.display(description='Blocked OS')
    def blocked_os_preview(self, obj):
        return ', '.join(obj.blocked_os_families or []) or 'None'


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
    # A tier is only sellable for a period once that period's Bachs product ID
    # is filled in, so the list surfaces both at a glance.
    list_display = (
        'code', 'name', 'weekly_price', 'monthly_price',
        'weekly_status', 'monthly_status', 'is_active', 'sort_order',
    )
    list_display_links = ('code', 'name')
    list_editable = ('weekly_price', 'monthly_price', 'is_active', 'sort_order')
    list_filter = ('is_active',)
    search_fields = ('code', 'name', 'bachs_ot_product_id', 'bachs_monthly_product_id')
    ordering = ('sort_order', 'code')

    fieldsets = (
        (None, {
            'fields': ('code', 'name', 'domain_limit', 'features', 'is_active', 'sort_order'),
        }),
        ('Pricing', {
            'fields': ('weekly_price', 'monthly_price'),
            'description': (
                'Prices shown on the pricing page. Bachs charges what its own '
                'product says, so keep these in step with the products below.'
            ),
        }),
        ('Bachs products', {
            'fields': ('bachs_ot_product_id', 'bachs_monthly_product_id'),
            'description': (
                'Each billing period is sold as its own Bachs ONE-TIME product, '
                'because Bachs stores the price on the product. A period with no '
                'product ID is hidden from checkout instead of charging the wrong '
                'amount.'
            ),
        }),
        ('Legacy / reference', {
            'classes': ('collapse',),
            'fields': ('bachs_product_id', 'bachs_payment_link'),
            'description': 'Not used by checkout. Kept for reference only.',
        }),
    )

    @admin.display(description='Features')
    def features_preview(self, obj):
        return '; '.join(obj.features or [])[:80]

    @admin.display(description='Weekly', boolean=True)
    def weekly_status(self, obj):
        return bool(obj.bachs_ot_product_id)

    @admin.display(description='Monthly', boolean=True)
    def monthly_status(self, obj):
        return bool(obj.bachs_monthly_product_id)


@admin.register(CheckoutIntent)
class CheckoutIntentAdmin(admin.ModelAdmin):
    list_display = ('id', 'workspace', 'plan', 'status', 'billing_period', 'checkout_id', 'created_at')
    list_filter = ('status', 'billing_period', 'created_at')
    list_select_related = ('workspace', 'plan')
    search_fields = ('workspace__name', 'checkout_id', 'charge_id')
    readonly_fields = ('id', 'created_at', 'updated_at')
    autocomplete_fields = ['workspace', 'plan', 'user']
    date_hierarchy = 'created_at'


@admin.register(BillingEvent)
class BillingEventAdmin(admin.ModelAdmin):
    # The money ledger mirroring Bachs. Read-mostly, but events can be added
    # for payments that arrive outside the API checkout (payment links, offline
    # transfers) so every payment the business takes is visible here and in the
    # customer's history.
    list_display = ('workspace', 'kind', 'plan_name', 'amount', 'currency', 'charge_id', 'note', 'occurred_at')
    list_filter = ('kind', 'currency', 'occurred_at')
    search_fields = ('workspace__name', 'charge_id', 'checkout_id', 'plan_name')
    readonly_fields = ('id',)
    autocomplete_fields = ['workspace', 'plan']
    date_hierarchy = 'occurred_at'
    fields = ('workspace', 'kind', 'plan', 'plan_name', 'amount', 'currency', 'charge_id', 'checkout_id', 'note', 'occurred_at')

    def get_form(self, request, obj=None, **kwargs):
        form = super().get_form(request, obj, **kwargs)
        if obj is None:
            form.base_fields['occurred_at'].initial = timezone.now()
        return form

    def save_model(self, request, obj, form, change):
        if obj.plan and not obj.plan_name:
            obj.plan_name = obj.plan.name
        if not obj.occurred_at:
            obj.occurred_at = timezone.now()
        super().save_model(request, obj, form, change)


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


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = ('user', 'tos_accepted_at', 'tos_version', 'created_at')
    search_fields = ('user__username', 'user__email')
    autocomplete_fields = ['user']
    readonly_fields = ('created_at',)


@admin.register(BlockedDestination)
class BlockedDestinationAdmin(admin.ModelAdmin):
    list_display = ('url', 'reason', 'source', 'added_by', 'created_at')
    list_filter = ('source', 'created_at')
    search_fields = ('url', 'reason')
    readonly_fields = ('created_at',)
    autocomplete_fields = ['added_by']


@admin.register(ShieldConfig)
class ShieldConfigAdmin(admin.ModelAdmin):
    list_display = ('workspace', 'protection_mode', 'bot_action', 'rate_limit_per_hour', 'updated_at')
    list_filter = ('protection_mode', 'bot_action')
    search_fields = ('workspace__name', 'workspace__owner__username')
    autocomplete_fields = ['workspace']
    readonly_fields = ('created_at', 'updated_at')


@admin.register(DomainRegistry)
class DomainRegistryAdmin(admin.ModelAdmin):
    list_display = ('domain', 'workspace', 'purpose', 'verified', 'health_status', 'is_active', 'created_at')
    list_filter = ('purpose', 'verified', 'health_status', 'is_active', 'created_at')
    search_fields = ('domain', 'workspace__name', 'workspace__owner__username')
    autocomplete_fields = ['workspace']
    readonly_fields = ('created_at', 'verified_at', 'last_health_check')


@admin.register(InstallToken)
class InstallTokenAdmin(admin.ModelAdmin):
    list_display = ('token_prefix', 'label', 'workspace', 'is_active', 'last_used_at', 'created_at')
    list_filter = ('is_active', 'created_at')
    search_fields = ('token_prefix', 'label', 'workspace__name')
    autocomplete_fields = ['workspace']
    readonly_fields = ('created_at', 'last_used_at')


@admin.register(RedirectRoute)
class RedirectRouteAdmin(admin.ModelAdmin):
    list_display = ('slug', 'domain', 'workspace', 'bot_action', 'is_active', 'expires_at', 'clicks_count', 'created_at')
    list_filter = ('is_active', 'bot_action', 'abuse_status', 'created_at')
    search_fields = ('slug', 'domain__domain', 'destination_url', 'workspace__name')
    autocomplete_fields = ['workspace', 'domain']
    readonly_fields = ('created_at', 'updated_at', 'clicks_count')


@admin.register(EdgeSyncCredential)
class EdgeSyncCredentialAdmin(admin.ModelAdmin):
    list_display = ('label', 'workspace', 'is_active', 'last_sync_at', 'created_at')
    list_filter = ('is_active', 'created_at')
    search_fields = ('label', 'workspace__name')
    autocomplete_fields = ['workspace']
    readonly_fields = ('created_at', 'last_sync_at')


@admin.register(RedirectEvent)
class RedirectEventAdmin(admin.ModelAdmin):
    list_display = ('domain', 'slug', 'ip', 'verdict', 'is_bot', 'country_code', 'created_at')
    list_filter = ('verdict', 'is_bot', 'created_at')
    search_fields = ('domain', 'ip', 'user_agent')
    readonly_fields = ('id', 'created_at')
    autocomplete_fields = ['workspace', 'redirect_route']
    date_hierarchy = 'created_at'