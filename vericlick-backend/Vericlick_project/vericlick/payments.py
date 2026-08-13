import hashlib
import hmac
import json
import logging
import time
import urllib.error
import urllib.request

from django.conf import settings

logger = logging.getLogger(__name__)


class BachsError(Exception):
    """Raised when the Bachs API can't be reached or returns an error."""
    def __init__(self, message, status_code=None):
        super().__init__(message)
        self.status_code = status_code


def get_bachs_config():
    """Bachs credentials and base URL, or None when billing is unconfigured."""
    api_key = getattr(settings, 'BACHS_API_KEY', '')
    if not api_key:
        return None
    base_url = getattr(settings, 'BACHS_BASE_URL', 'https://sandbox-api.bachs.io').rstrip('/')
    return {'api_key': api_key, 'base_url': base_url}


def _request(method, path, payload=None, api_key=None, base_url=None, idempotency_key=None):
    url = f'{base_url}{path}'
    headers = {
        'Authorization': f'Bearer {api_key}',
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    }
    if idempotency_key:
        headers['Idempotency-Key'] = idempotency_key

    data = None
    if payload is not None:
        data = json.dumps(payload).encode('utf-8')

    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            raw = resp.read()
            return json.loads(raw.decode('utf-8')) if raw else {}
    except urllib.error.HTTPError as exc:
        body = exc.read().decode('utf-8', 'replace') if exc.fp else ''
        raise BachsError(f'Bachs returned {exc.code}: {body}', status_code=exc.code)
    except urllib.error.URLError as exc:
        raise BachsError(f'Could not reach Bachs: {exc.reason}')


ALL_PAYMENT_METHODS = ['card', 'crypto', 'bank_transfer', 'mobile_money']


def create_checkout_session(intent, plan, user_email, user_name, payment_methods=None):
    """Starts a Bachs checkout session for the intent's plan.

    ``payment_methods`` is the allowlist of channels to show at checkout
    (card / crypto / bank_transfer / mobile_money). Recurring subscriptions
    are card-only in Bachs ("Subscriptions are USD card only today"), so
    subscription checkouts default to ``['card']``; one-time "period"
    payments can use any channel.

    Which product is sold depends on the billing mode, because Bachs decides
    recurring-vs-one-time from the product itself: subscriptions use
    ``plan.bachs_product_id`` (a recurring product); periods use
    ``plan.bachs_ot_product_id`` (a one-time product — the only type that can
    show multiple payment methods), falling back to ``bachs_product_id``.

    Returns the checkout dict from Bachs (`checkout_id`, `checkout_url`, ...).
    Raises BachsError when the request fails."""
    config = get_bachs_config()
    if not config:
        raise BachsError('Payments are not configured yet')

    success_url = f'{settings.SITE_URL}/app/billing?billing=success'
    cancel_url = f'{settings.SITE_URL}/app/billing?billing=cancelled'

    if intent.billing_mode == intent.BillingMode.PERIOD:
        product_id = plan.bachs_ot_product_id or plan.bachs_product_id
        methods = payment_methods or ALL_PAYMENT_METHODS
        invalid = [m for m in methods if m not in ALL_PAYMENT_METHODS]
        if invalid:
            raise BachsError(f'Unsupported payment method: {invalid[0]}')
    else:
        product_id = plan.bachs_product_id
        methods = ['card']

    payload = {
        'product_cart': [
            {'product_id': product_id, 'quantity': 1},
        ],
        'customer': {'email': user_email or '', 'name': user_name or ''},
        'success_url': success_url,
        'cancel_url': cancel_url,
        'allowed_payment_method_types': methods,
        # Our own idempotent reference: retrying the same intent never creates a
        # second checkout.
        'reference': f'vericlick-{intent.pk}',
        'metadata': {
            'workspace_id': str(intent.workspace_id),
            'plan_code': plan.code,
            'billing_mode': intent.billing_mode,
        },
        'expires_in_minutes': 60,
    }

    try:
        result = _request(
            'POST', '/v1/checkout-sessions',
            payload=payload,
            api_key=config['api_key'],
            base_url=config['base_url'],
            idempotency_key=str(intent.pk),
        )
    except BachsError:
        raise
    except Exception as exc:
        raise BachsError(f'Unhandled error creating checkout: {exc}')

    checkout_id = result.get('checkout_id')
    checkout_url = result.get('checkout_url')
    if not checkout_id or not checkout_url:
        raise BachsError('Bachs answered without a checkout_id/checkout_url')
    return result


def verify_webhook_signature(raw_body, timestamp_header, signature_header):
    """Verify a Bachs webhook delivery.

    Signature is an HMAC-SHA256 hex digest of ``"{timestamp}.{raw_body}"``
    using the endpoint's signing secret. A delivery older than the tolerance
    window (or with a bad signature) is rejected."""
    secret = getattr(settings, 'BACHS_WEBHOOK_SECRET', '')
    if not secret:
        return False
    try:
        timestamp = int(timestamp_header)
    except (TypeError, ValueError):
        return False

    tolerance = getattr(settings, 'BACHS_WEBHOOK_TOLERANCE_SECONDS', 300)
    if abs(time.time() - timestamp) > tolerance:
        return False

    message = f'{timestamp}.{raw_body.decode("utf-8")}'
    expected = hmac.new(secret.encode(), message.encode('utf-8'), hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature_header)


def fulfil_paid_checkout(checkout_id, charge_id=''):
    """Grant a workspace its paid plan once a verified webhook confirms payment.

    Idempotent: an intent is only matched while OPEN, so re-deliveries of the
    same event can't double-grant or double-email. Returns the intent when
    payment was just granted to the workspace, else None.

    One-time "period" payments set ``plan_expires_at`` so the workspace's
    plan lapses after the period; card subscriptions leave it open-ended."""
    from .emails import send_payment_admin_notification, send_payment_receipt_email, send_plan_upgraded_email
    from .models import BillingEvent, CheckoutIntent, Workspace, PLAN_PERIOD_DAYS

    if not checkout_id:
        return None
    intent = CheckoutIntent.objects.filter(
        checkout_id=checkout_id,
        status=CheckoutIntent.Status.OPEN,
    ).first()
    if intent is None:
        return None

    from datetime import timedelta
    from django.db import transaction
    from django.utils import timezone

    with transaction.atomic():
        intent = CheckoutIntent.objects.select_for_update().get(pk=intent.pk)
        if intent.status != CheckoutIntent.Status.OPEN:
            return None
        intent.status = CheckoutIntent.Status.PAID
        intent.charge_id = charge_id or intent.charge_id
        intent.save(update_fields=['status', 'charge_id', 'updated_at'])

        workspace = intent.workspace
        is_period = intent.billing_mode == CheckoutIntent.BillingMode.PERIOD
        if is_period:
            workspace.plan_billing_mode = Workspace.BillingMode.PERIOD
            workspace.plan_expires_at = timezone.now() + timedelta(days=PLAN_PERIOD_DAYS)
        else:
            workspace.plan_billing_mode = Workspace.BillingMode.SUBSCRIPTION
            workspace.plan_expires_at = None
        workspace.plan = intent.plan
        workspace.save(update_fields=['plan', 'plan_billing_mode', 'plan_expires_at'])

        kind = BillingEvent.Kind.PLAN_PERIOD_PAID if is_period else BillingEvent.Kind.PLAN_PURCHASED
        BillingEvent.objects.create(
            workspace=workspace,
            kind=kind,
            plan=intent.plan,
            plan_name=intent.plan.name,
            amount=intent.plan.monthly_price,
            currency='USD',
            charge_id=intent.charge_id,
            checkout_id=checkout_id,
            occurred_at=timezone.now(),
            note='One-time payment for a billing period' if is_period else 'Plan purchased',
            data={
                'billing_mode': intent.billing_mode,
                'payment_method': intent.payment_method,
            },
        )

    if intent.user is not None:
        try:
            if is_period:
                send_payment_receipt_email(
                    intent.user, intent.workspace, intent.plan, intent.charge_id,
                    occurred_at=timezone.now(),
                    note='One-time payment for the next billing period.',
                )
            else:
                send_plan_upgraded_email(intent.user, intent.workspace, intent.plan)
        except Exception:
            logger.exception('Upgrade email failed for checkout %s', checkout_id)
    if intent.user is not None:
        try:
            send_payment_admin_notification(
                intent.workspace, intent.plan, intent.user, charge_id=intent.charge_id,
            )
        except Exception:
            logger.exception('Payment admin notification failed for checkout %s', checkout_id)
    return intent


def record_recurring_collection(data):
    """Record a subscription renewal (a `collection.succeeded` webhook without
    a checkout_id). Recurring charges arrive without our checkout reference, so
    this resolves the workspace via the metadata embedded on the subscription.

    Returns True when a renewal was recorded, else False (nothing usable)."""
    from .models import BillingEvent, Workspace

    metadata = (data or {}).get('metadata') or {}
    workspace_id = metadata.get('workspace_id')
    plan_code = metadata.get('plan_code')
    if not workspace_id:
        reference = (data or {}).get('reference', '')
        if reference.startswith('vericlick-'):
            from .models import CheckoutIntent
            intent = CheckoutIntent.objects.filter(pk=reference[len('vericlick-'):]).first()
            if intent:
                workspace_id = str(intent.workspace_id)
                plan_code = intent.plan.code
    if not workspace_id:
        return False

    from django.utils import timezone
    from .models import Plan
    from vericlick.emails import send_payment_receipt_email

    workspace = Workspace.objects.filter(pk=workspace_id).first()
    if workspace is None:
        return False
    if not workspace.is_plan_active():
        return False

    charge_id = (data or {}).get('charge_id', '')
    if charge_id and BillingEvent.objects.filter(charge_id=charge_id).exists():
        return True  # already recorded (idempotency)

    plan = (Plan.objects.filter(code=plan_code).first() if plan_code else None) or workspace.plan
    if plan is None:
        return False

    BillingEvent.objects.create(
        workspace=workspace,
        kind=BillingEvent.Kind.PLAN_RENEWED,
        plan=plan,
        plan_name=plan.name,
        amount=plan.monthly_price,
        currency='USD',
        charge_id=charge_id,
        checkout_id='',
        occurred_at=timezone.now(),
        note='Monthly subscription renewal',
    )

    try:
        send_payment_receipt_email(
            workspace.owner, workspace, plan, charge_id,
            occurred_at=timezone.now(),
            note='Monthly subscription renewal.',
        )
    except Exception:
        logger.exception('Renewal receipt email failed for %s', workspace_id)
    return True


def record_failed_collection(data, event_type):
    """Record a failed / abandoned / underpaid collection as a BillingEvent so
    history and support can see it. Never affects the workspace's plan or
    limits — only the ledger. Best-effort and silent on failures."""
    from .models import BillingEvent, Workspace
    from django.utils import timezone

    metadata = (data or {}).get('metadata') or {}
    workspace_id = metadata.get('workspace_id')
    reference = (data or {}).get('reference', '')
    if not workspace_id and reference.startswith('vericlick-'):
        from .models import CheckoutIntent
        intent = CheckoutIntent.objects.filter(pk=reference[len('vericlick-'):]).first()
        if intent:
            workspace_id = str(intent.workspace_id)
    if not workspace_id:
        return False
    workspace = Workspace.objects.filter(pk=workspace_id).first()
    if workspace is None:
        return False

    charge_id = (data or {}).get('charge_id', '')
    if charge_id and BillingEvent.objects.filter(charge_id=charge_id, kind=BillingEvent.Kind.PAYMENT_FAILED).exists():
        return True

    BillingEvent.objects.create(
        workspace=workspace,
        kind=BillingEvent.Kind.PAYMENT_FAILED,
        plan=workspace.plan,
        plan_name=workspace.plan.name if workspace.plan else '',
        amount=None,
        currency='USD',
        charge_id=charge_id,
        checkout_id='',
        occurred_at=timezone.now(),
        note=f'{event_type.replace("collection.", "").replace("_", " ")} payment',
    )
    return True


_BILLING_CHECKS = {}
_BILLING_CHECK_INTERVAL_SECONDS = 30 * 60


def maybe_run_billing_checks(workspace, force=False):
    """Keep one-time "period" workspaces' billing lifecycle current.

    Emits the expiring-warning, expired, and suspended ledger events plus their
    owner emails at the right moments. The lifecycle itself is derived from
    ``plan_expires_at`` (so visitor-facing links behave correctly without any
    scheduler); this pass only publishes the notifications and ledger rows, and
    each is DB-guarded so it fires exactly once.

    Runs at most once every 30 minutes per workspace per process. A
    ``check_billing`` management command drives it on a timer so emails go out
    even when an owner never logs in; ``force=True`` bypasses the throttle.

    ``workspace`` must be a saved instance."""
    from datetime import timedelta
    from django.utils import timezone
    from .emails import (
        send_period_expiring_email,
        send_period_expired_email,
        send_plan_suspended_email,
    )
    from .models import BillingEvent, PLAN_GRACE_DAYS

    now = timezone.now()
    key = workspace.pk
    last = _BILLING_CHECKS.get(key)
    if not force and last is not None and (now - last).total_seconds() < _BILLING_CHECK_INTERVAL_SECONDS:
        return
    _BILLING_CHECKS[key] = now

    # Card subscriptions renew by card with no expiry and are handled by the
    # webhook path, not this lifecycle. Nothing to do for plan-less workspaces.
    if workspace.plan is None or workspace.plan_expires_at is None:
        return

    expires = workspace.plan_expires_at
    grace = expires + timedelta(days=PLAN_GRACE_DAYS)
    plan = workspace.plan
    owner = workspace.owner

    def _publish(kind, occurred_at, note, email):
        if BillingEvent.objects.filter(workspace=workspace, kind=kind).exists():
            return
        BillingEvent.objects.create(
            workspace=workspace, kind=kind,
            plan=plan, plan_name=plan.name, amount=None, currency='USD',
            occurred_at=occurred_at, note=note,
        )
        try:
            email()
        except Exception:
            logger.exception('Billing lifecycle email failed for workspace %s', workspace.pk)

    if now < expires:
        if expires - timedelta(days=3) <= now:
            _publish(
                BillingEvent.Kind.PLAN_EXPIRING, now,
                f'Billing period expires {expires:%d %b %Y}',
                lambda: send_period_expiring_email(owner, workspace, plan, expires),
            )
        return

    _publish(
        BillingEvent.Kind.PLAN_EXPIRED, expires,
        'Billing period ended',
        lambda: send_period_expired_email(owner, workspace, plan, expires),
    )
    if now >= grace:
        _publish(
            BillingEvent.Kind.PLAN_SUSPENDED, grace,
            'Access suspended after the grace period',
            lambda: send_plan_suspended_email(owner, workspace, plan, grace),
        )