import logging

from django.conf import settings

logger = logging.getLogger(__name__)


def _resend():
    if not settings.RESEND_API_KEY:
        return None
    try:
        import resend
    except ImportError:
        logger.error('resend package is not installed')
        return None
    resend.api_key = settings.RESEND_API_KEY
    return resend


def send_email(to, subject, html, text=None):
    # Sends a transactional email via Resend. Without RESEND_API_KEY the call
    # is a logged no-op, so the app still works before email is configured.
    client = _resend()
    if client is None:
        logger.info('Email skipped (RESEND_API_KEY not set): to=%s subject=%r', to, subject)
        return None
    payload = {
        'from': settings.RESEND_FROM_EMAIL,
        'to': [to],
        'subject': subject,
        'html': html,
    }
    if text:
        payload['text'] = text
    try:
        return client.Emails.send(payload)
    except Exception:
        # Email delivery must never break a signup, login, or upgrade request.
        logger.exception('Resend email failed: to=%s subject=%r', to, subject)
        return None


def _layout(body_html):
    return f"""
<div style="background-color:#0a0a0a;padding:40px 0;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background-color:#111111;border:1px solid #262626;border-radius:16px;padding:40px;">
    <div style="text-align:center;margin-bottom:28px;">
      <span style="color:#ffffff;font-size:22px;font-weight:bold;">VeriClick</span>
    </div>
    {body_html}
    <p style="color:#525252;font-size:12px;text-align:center;margin-top:32px;border-top:1px solid #262626;padding-top:16px;">
      You received this email because you have an account with VeriClick.<br/>
      VeriClick links must comply with our Terms of Service. Abuse may result in account suspension.<br/>
      If this wasn't you, you can safely ignore it.
    </p>
  </div>
</div>
"""


def send_welcome_email(user):
    subject = 'Welcome to VeriClick'
    body = f"""
<p style="color:#a3a3a3;font-size:15px;">Hi {user.first_name or user.username},</p>
<p style="color:#d4d4d4;font-size:15px;line-height:1.6;">
  Your VeriClick account is ready. Sign in to start protecting your website from bots,
  scrapers, and ad fraud.
</p>
<div style="text-align:center;margin:32px 0;">
  <a href="{settings.SITE_URL}/auth/login"
     style="background-color:#ffffff;color:#0a0a0a;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:bold;font-size:14px;">
    Sign in to VeriClick
  </a>
</div>
<p style="color:#525252;font-size:13px;margin-bottom:0;">
  If the button doesn't work, paste this link in your browser:<br/>
  <span style="color:#a3a3a3;">{settings.SITE_URL}/auth/login</span>
</p>
"""
    return send_email(user.email, subject, _layout(body))


def send_verification_email(user, uid, token):
    # Path-based link: email clients (Gmail in particular) wrap links and can
    # mangle query strings, which breaks SPA routes that read ?uid&token. A
    # path like /auth/verify-email/<uid>/<token> survives the wrapper intact.
    verify_url = f'{settings.SITE_URL}/auth/verify-email/{uid}/{token}'
    subject = 'Confirm your VeriClick email'
    body = f"""
<p style="color:#a3a3a3;font-size:15px;">Hi {user.first_name or user.username},</p>
<p style="color:#d4d4d4;font-size:15px;line-height:1.6;">
  You just created a VeriClick account. Confirm your email address to finish signing
  up — it only takes a second. You'll be able to sign in right after.
</p>
<div style="text-align:center;margin:32px 0;">
  <a href="{verify_url}"
     style="background-color:#ffffff;color:#0a0a0a;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:bold;font-size:14px;">
    Confirm my email
  </a>
</div>
<p style="color:#525252;font-size:13px;margin-bottom:0;">
  If the button doesn't work, paste this link in your browser:<br/>
  <span style="color:#a3a3a3;">{verify_url}</span>
</p>
<p style="color:#525252;font-size:13px;margin-bottom:0;">
  This link expires soon. If you didn't create a VeriClick account, you can safely
  ignore this email.
</p>
"""
    return send_email(user.email, subject, _layout(body))


def send_password_reset_email(user, uid, token):
    # Path-based link for the same reason as verification: Gmail's link wrapper
    # can corrupt ?uid&token query strings, so the token rides in the path.
    reset_url = f'{settings.SITE_URL}/auth/reset-password/{uid}/{token}'
    subject = 'Reset your VeriClick password'
    body = f"""
<p style="color:#a3a3a3;font-size:15px;">Hi {user.first_name or user.username},</p>
<p style="color:#d4d4d4;font-size:15px;line-height:1.6;">
  We received a request to reset your VeriClick password. This link expires soon —
  if you didn't ask to reset it, you can ignore this email.
</p>
<div style="text-align:center;margin:32px 0;">
  <a href="{reset_url}"
     style="background-color:#ffffff;color:#0a0a0a;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:bold;font-size:14px;">
    Reset password
  </a>
</div>
<p style="color:#525252;font-size:13px;margin-bottom:0;">
  If the button doesn't work, paste this link in your browser:<br/>
  <span style="color:#a3a3a3;">{reset_url}</span>
</p>
"""
    return send_email(user.email, subject, _layout(body))


def send_plan_upgraded_email(user, workspace, plan):
    subject = f'Your VeriClick plan is now {plan.name}'
    body = f"""
<p style="color:#a3a3a3;font-size:15px;">Hi {user.first_name or user.username},</p>
<p style="color:#d4d4d4;font-size:15px;line-height:1.6;">
  Your workspace <strong style="color:#ffffff;">{workspace.name}</strong> is now on the
  <strong style="color:#ffffff;">{plan.name}</strong> plan. Your upgraded limits are active.
</p>
<div style="text-align:center;margin:32px 0;">
  <a href="{settings.SITE_URL}/app"
     style="background-color:#ffffff;color:#0a0a0a;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:bold;font-size:14px;">
    Open dashboard
  </a>
</div>
<p style="color:#525252;font-size:13px;margin-bottom:0;">
  Questions? Reply to this email and we'll help.
</p>
"""
    return send_email(user.email, subject, _layout(body))


def send_payment_admin_notification(workspace, plan, user, charge_id=''):
    subject = f'New VeriClick payment: {plan.name}'
    body = f"""
<p style="color:#a3a3a3;font-size:15px;">A workspace just went paid.</p>
<table style="width:100%;color:#d4d4d4;font-size:14px;line-height:1.8;margin:16px 0;">
  <tr><td style="color:#525252;width:120px;">Workspace</td><td style="color:#ffffff;font-weight:bold;">{workspace.name}</td></tr>
  <tr><td style="color:#525252;">Account</td><td style="color:#ffffff;">{user.email} ({user.username})</td></tr>
  <tr><td style="color:#525252;">Plan</td><td style="color:#ffffff;">{plan.name} — ${plan.monthly_price}/month</td></tr>
  <tr><td style="color:#525252;">Charge</td><td style="color:#ffffff;">{charge_id or 'n/a'}</td></tr>
</table>
<p style="color:#525252;font-size:13px;margin-bottom:0;">
  Review it in the admin: {settings.SITE_URL}/admin/vericlick/workspace/
</p>
"""
    for to in getattr(settings, 'PAYMENT_NOTIFY_EMAILS', []):
        send_email(to, subject, _layout(body))


def _amount_line(amount):
    if amount is None:
        return ''
    return f'<tr><td style="color:#525252;">Amount</td><td style="color:#ffffff;font-weight:bold;">${amount}</td></tr>'


def send_payment_receipt_email(user, workspace, plan, charge_id='', occurred_at=None, note=''):
    # Receipt for a renewal or a one-time period payment. Not sent for the very
    # first purchase (that gets its own "welcome to the plan" email instead).
    from django.utils import timezone
    subject = f'VeriClick receipt: {plan.name}'
    charged_line = _amount_line(plan.monthly_price)
    when = (occurred_at or timezone.now()).strftime('%d %b %Y')
    body = f"""
<p style="color:#a3a3a3;font-size:15px;">Hi {user.first_name or user.username},</p>
<p style="color:#d4d4d4;font-size:15px;line-height:1.6;">
  Thanks for staying with VeriClick. Here's your receipt for
  <strong style="color:#ffffff;">{plan.name}</strong> ({when}).
</p>
<table style="width:100%;color:#d4d4d4;font-size:14px;line-height:1.8;margin:16px 0;">
  <tr><td style="color:#525252;width:120px;">Plan</td><td style="color:#ffffff;font-weight:bold;">{plan.name}</td></tr>
  {charged_line}
  <tr><td style="color:#525252;">Date</td><td style="color:#ffffff;">{when}</td></tr>
  <tr><td style="color:#525252;">Reference</td><td style="color:#ffffff;">{charge_id or 'n/a'}</td></tr>
</table>
<div style="text-align:center;margin:32px 0;">
  <a href="{settings.SITE_URL}/app/billing"
     style="background-color:#ffffff;color:#0a0a0a;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:bold;font-size:14px;">
    View payment history
  </a>
</div>
<p style="color:#525252;font-size:13px;margin-bottom:0;">
  {note} Questions? Reply to this email and we'll help.
</p>
"""
    return send_email(user.email, subject, _layout(body))


def send_period_expiring_email(user, workspace, plan, expires_at):
    # Heads-up a few days before a one-time (bank/crypto/mobile) period ends so
    # the customer can renew before the grace window starts.
    from django.utils import timezone
    when = expires_at.strftime('%d %b %Y')
    subject = f'Your {plan.name} plan renews soon'
    body = f"""
<p style="color:#a3a3a3;font-size:15px;">Hi {user.first_name or user.username},</p>
<p style="color:#d4d4d4;font-size:15px;line-height:1.6;">
  Your billing period for the <strong style="color:#ffffff;">{plan.name}</strong>
  plan ends on <strong style="color:#ffffff;">{when}</strong>. Renew before then to keep
  your protection and analytics running without interruption.
</p>
<p style="color:#a3a3a3;font-size:15px;line-height:1.6;">
  If it lapses, you get a <strong style="color:#ffffff;">7-day grace period</strong> where
  everything keeps working while you renew. After that your protection will become
  inactive — renew to restore it immediately.
</p>
<div style="text-align:center;margin:32px 0;">
  <a href="{settings.SITE_URL}/app/billing"
     style="background-color:#ffffff;color:#0a0a0a;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:bold;font-size:14px;">
    Renew now
  </a>
</div>
<p style="color:#525252;font-size:13px;margin-bottom:0;">Questions? Reply to this email and we'll help.</p>
"""
    return send_email(user.email, subject, _layout(body))


def send_period_expired_email(user, workspace, plan, expires_at):
    # Sent once when a one-time period lapses without renewal — the grace
    # window is now running.
    grace = workspace.grace_expires_at
    grace_when = grace.strftime('%d %b %Y') if grace else 'within the next 7 days'
    subject = f'Your {plan.name} plan period has ended'
    body = f"""
<p style="color:#a3a3a3;font-size:15px;">Hi {user.first_name or user.username},</p>
<p style="color:#d4d4d4;font-size:15px;line-height:1.6;">
  Your billing period for the <strong style="color:#ffffff;">{plan.name}</strong>
  plan ended on <strong style="color:#ffffff;">{expires_at.strftime('%d %b %Y')}</strong>
  and wasn't renewed. You're now in a <strong style="color:#ffffff;">7-day grace
  period</strong> — everything keeps working and you can renew anytime to keep full
  protection.
</p>
<p style="color:#a3a3a3;font-size:15px;line-height:1.6;">
  If you don't renew by <strong style="color:#ffffff;">{grace_when}</strong>, your
  protection will become inactive. Renew to restore it immediately.
</p>
<div style="text-align:center;margin:32px 0;">
  <a href="{settings.SITE_URL}/app/billing"
     style="background-color:#ffffff;color:#0a0a0a;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:bold;font-size:14px;">
    Renew your plan
  </a>
</div>
<p style="color:#525252;font-size:13px;margin-bottom:0;">Questions? Reply to this email and we'll help.</p>
"""
    return send_email(user.email, subject, _layout(body))


def send_plan_suspended_email(user, workspace, plan, grace_ended_at):
    # Sent once when the grace window passes without renewal. Links now
    # return 410 Gone instead of pass-through to prevent abuse from lapsed
    # accounts.
    subject = f'Your {plan.name} plan was suspended'
    body = f"""
<p style="color:#a3a3a3;font-size:15px;">Hi {user.first_name or user.username},</p>
<p style="color:#d4d4d4;font-size:15px;line-height:1.6;">
  Your <strong style="color:#ffffff;">{plan.name}</strong> plan was suspended on
  <strong style="color:#ffffff;">{grace_ended_at.strftime('%d %b %Y')}</strong> because it
  wasn't renewed during the 7-day grace period.
</p>
<p style="color:#a3a3a3;font-size:15px;line-height:1.6;">
  Your protection is now inactive. Renew to restore full analytics and protection immediately;
  your domains and data are all intact.
</p>
<div style="text-align:center;margin:32px 0;">
  <a href="{settings.SITE_URL}/app/billing"
     style="background-color:#ffffff;color:#0a0a0a;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:bold;font-size:14px;">
    Renew your plan
  </a>
</div>
<p style="color:#525252;font-size:13px;margin-bottom:0;">Questions? Reply to this email and we'll help.</p>
"""
    return send_email(user.email, subject, _layout(body))


def send_redirect_expiry_warning_email(user, route, days_left=1):
    """Sent 1 day before a redirect expires."""
    domain_name = route.domain.domain
    when = route.expires_at.strftime('%d %b %Y at %H:%M UTC') if route.expires_at else 'soon'
    subject = f'Your redirect for {domain_name} expires {"tomorrow" if days_left <= 1 else f"in {days_left} days"}'
    body = f"""
<p style="color:#a3a3a3;font-size:15px;">Hi {user.first_name or user.username},</p>
<p style="color:#d4d4d4;font-size:15px;line-height:1.6;">
  Your redirect for <strong style="color:#ffffff;">{domain_name}</strong> expires
  <strong style="color:#ffffff;">{when}</strong>.
</p>
<p style="color:#a3a3a3;font-size:15px;line-height:1.6;">
  After it expires, visitors to <strong style="color:#ffffff;">{domain_name}</strong> will
  see a 404 page instead of being redirected to your destination.
</p>
<div style="text-align:center;margin:32px 0;">
  <a href="{settings.SITE_URL}/app/redirects"
     style="background-color:#ffffff;color:#0a0a0a;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:bold;font-size:14px;">
    Renew Redirect
  </a>
</div>
<p style="color:#525252;font-size:13px;margin-bottom:0;">
  This is an automated reminder from VeriClick.
</p>
"""
    return send_email(user.email, subject, _layout(body))


def send_redirect_expired_email(user, route):
    """Sent on the day a redirect expires."""
    domain_name = route.domain.domain
    subject = f'Your redirect for {domain_name} has expired'
    body = f"""
<p style="color:#a3a3a3;font-size:15px;">Hi {user.first_name or user.username},</p>
<p style="color:#d4d4d4;font-size:15px;line-height:1.6;">
  Your redirect for <strong style="color:#ffffff;">{domain_name}</strong> has expired.
</p>
<p style="color:#a3a3a3;font-size:15px;line-height:1.6;">
  Visitors to <strong style="color:#ffffff;">{domain_name}</strong> now see a 404 page.
  Your redirect data is preserved for 30 days.
</p>
<div style="text-align:center;margin:32px 0;">
  <a href="{settings.SITE_URL}/app/redirects"
     style="background-color:#ffffff;color:#0a0a0a;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:bold;font-size:14px;">
    Renew Redirect
  </a>
</div>
<p style="color:#525252;font-size:13px;margin-bottom:0;">
  This is an automated reminder from VeriClick.
</p>
"""
    return send_email(user.email, subject, _layout(body))



