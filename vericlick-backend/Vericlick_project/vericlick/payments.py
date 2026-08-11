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


def create_checkout_session(intent, plan, user_email, user_name):
    """Starts a Bachs checkout session for the intent's plan.

    Returns the checkout dict from Bachs (`checkout_id`, `checkout_url`, ...).
    Raises BachsError when the request fails."""
    config = get_bachs_config()
    if not config:
        raise BachsError('Payments are not configured yet')

    success_url = f'{settings.SITE_URL}/app/billing?billing=success'
    cancel_url = f'{settings.SITE_URL}/app/billing?billing=cancelled'

    payload = {
        'product_cart': [
            {'product_id': plan.bachs_product_id, 'quantity': 1},
        ],
        'customer': {'email': user_email or '', 'name': user_name or ''},
        'success_url': success_url,
        'cancel_url': cancel_url,
        # Our own idempotent reference: retrying the same intent never creates a
        # second checkout.
        'reference': f'vericlick-{intent.pk}',
        'metadata': {
            'workspace_id': str(intent.workspace_id),
            'plan_code': plan.code,
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
    payment was just granted to the workspace, else None."""
    from .emails import send_payment_admin_notification, send_plan_upgraded_email
    from .models import CheckoutIntent

    if not checkout_id:
        return None
    intent = CheckoutIntent.objects.filter(
        checkout_id=checkout_id,
        status=CheckoutIntent.Status.OPEN,
    ).first()
    if intent is None:
        return None

    from django.db import transaction
    from django.utils import timezone

    with transaction.atomic():
        intent = CheckoutIntent.objects.select_for_update().get(pk=intent.pk)
        if intent.status != CheckoutIntent.Status.OPEN:
            return None
        intent.status = CheckoutIntent.Status.PAID
        intent.charge_id = charge_id or intent.charge_id
        intent.save(update_fields=['status', 'charge_id', 'updated_at'])
        intent.workspace.plan = intent.plan
        intent.workspace.save(update_fields=['plan'])

    if intent.user is not None:
        try:
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