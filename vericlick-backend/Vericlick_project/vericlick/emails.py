import logging
from urllib.parse import urlencode

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
    <p style="color:#525252;font-size:12px;text-align:center;margin-top:32px;">
      You received this email because you have an account with VeriClick.<br/>
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
  Your VeriClick account is ready. Sign in to start protecting your links from bots,
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


def send_password_reset_email(user, uid, token):
    params = urlencode({'uid': uid, 'token': token})
    reset_url = f'{settings.SITE_URL}/auth/reset-password?{params}'
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
    # Internal notification to the owner + senior engineer whenever a paid plan
    # is granted, so payments can be confirmed without logging into the admin.
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
