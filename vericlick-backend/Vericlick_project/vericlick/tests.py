import hashlib
import hmac
import json
import time
import uuid
from datetime import timedelta
from unittest.mock import patch
from django.test import TestCase, override_settings
from django.contrib.auth.models import User
from django.contrib.auth.tokens import default_token_generator
from django.contrib import admin
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase, APIClient
from rest_framework import status
from decimal import Decimal
from .models import (
    PLAN_GRACE_DAYS,
    Workspace, IPRule, TrackerEvent,
    Plan, DiscountCode, SiteConfig, CheckoutIntent, BillingEvent,
    DomainRegistry, InstallToken, RedirectRoute, EdgeSyncCredential,
    RedirectEvent, ShieldConfig, CountryRule,
)
from .utils import snake_to_camel, camel_to_snake, transform_keys


# Utils

class SnakeToCamelTests(TestCase):
    def test_simple(self):
        self.assertEqual(snake_to_camel('hello_world'), 'helloWorld')

    def test_single_word(self):
        self.assertEqual(snake_to_camel('hello'), 'hello')

    def test_multiple_underscores(self):
        self.assertEqual(snake_to_camel('one_two_three_four'), 'oneTwoThreeFour')

    def test_empty(self):
        self.assertEqual(snake_to_camel(''), '')


class CamelToSnakeTests(TestCase):
    def test_simple(self):
        self.assertEqual(camel_to_snake('helloWorld'), 'hello_world')

    def test_single_word(self):
        self.assertEqual(camel_to_snake('hello'), 'hello')

    def test_multiple_caps(self):
        self.assertEqual(camel_to_snake('oneTwoThreeFour'), 'one_two_three_four')

    def test_consecutive_uppercase(self):
        self.assertEqual(camel_to_snake('myURLParser'), 'my_url_parser')

    def test_empty(self):
        self.assertEqual(camel_to_snake(''), '')


class TransformKeysTests(TestCase):
    def test_dict(self):
        result = transform_keys({'hello_world': 1}, snake_to_camel)
        self.assertEqual(result, {'helloWorld': 1})

    def test_list_of_dicts(self):
        result = transform_keys([{'foo_bar': 1}, {'baz_qux': 2}], snake_to_camel)
        self.assertEqual(result, [{'fooBar': 1}, {'bazQux': 2}])

    def test_nested(self):
        result = transform_keys(
            {'outer_key': {'inner_key': 1}},
            snake_to_camel,
        )
        self.assertEqual(result, {'outerKey': {'innerKey': 1}})

    def test_non_dict_non_list(self):
        self.assertEqual(transform_keys('hello', snake_to_camel), 'hello')
        self.assertEqual(transform_keys(42, snake_to_camel), 42)
        self.assertIsNone(transform_keys(None, snake_to_camel))


# Models

class WorkspaceModelTests(TestCase):
    def test_create_workspace(self):
        user = User.objects.create_user(username='testuser')
        ws = Workspace.objects.create(name='My Workspace', owner=user)
        self.assertIsInstance(ws.id, uuid.UUID)
        self.assertEqual(str(ws), 'My Workspace')

    def test_ordering_newest_first(self):
        user = User.objects.create_user(username='testuser')
        ws1 = Workspace.objects.create(name='First', owner=user)
        ws2 = Workspace.objects.create(name='Second', owner=user)
        qs = Workspace.objects.all()
        self.assertEqual(qs[0], ws2)
        self.assertEqual(qs[1], ws1)


class UserSignalTests(TestCase):
    def test_workspace_created_on_user_creation(self):
        user = User.objects.create_user(username='signal_test')
        ws = Workspace.objects.filter(owner=user).first()
        self.assertIsNotNone(ws)
        self.assertEqual(ws.name, f"{user.username}'s Workspace")

    def test_workspace_not_duplicated_on_signal(self):
        user = User.objects.create_user(username='signal_test2')
        count = Workspace.objects.filter(owner=user).count()
        self.assertEqual(count, 1)

    def test_get_or_create_idempotency(self):
        user = User.objects.create_user(username='signal_test3')
        user.save()
        count = Workspace.objects.filter(owner=user).count()
        self.assertEqual(count, 1)


#  API Endpoints

class HealthEndpointTests(APITestCase):
    def test_health_returns_ok(self):
        res = self.client.get('/api/health/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        body = res.json()
        self.assertEqual(body['status'], 'ok')
        self.assertEqual(body['version'], '2.0.0')

    def test_health_allows_unauthenticated(self):
        res = self.client.get('/api/health/')
        self.assertNotEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)


class AuthEndpointTests(APITestCase):
    def test_register_creates_user_and_workspace(self):
        data = {
            'username': 'newuser',
            'email': 'new@example.com',
            'password': 'strongpass123',
        }
        res = self.client.post('/api/auth/register/', data, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertTrue(User.objects.filter(username='newuser').exists())
        user = User.objects.get(username='newuser')
        self.assertTrue(Workspace.objects.filter(owner=user).exists())
        self.assertFalse(user.is_active)

    def test_register_rejects_duplicate_email(self):
        User.objects.create_user(
            username='existing', email='dupe@example.com', password='testpass123',
        )
        res = self.client.post('/api/auth/register/', {
            'username': 'newuser2',
            'email': 'dupe@example.com',
            'password': 'strongpass123',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        errors = ' '.join(e['detail'] for e in res.json()['errors'])
        self.assertIn('already exists', errors.lower())
        self.assertFalse(User.objects.filter(username='newuser2').exists())

    def test_register_rejects_duplicate_email_case_insensitive(self):
        User.objects.create_user(
            username='existing', email='dupe@example.com', password='testpass123',
        )
        res = self.client.post('/api/auth/register/', {
            'username': 'newuser3',
            'email': 'DUPE@example.com',
            'password': 'strongpass123',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(User.objects.filter(username='newuser3').exists())

    def test_register_sends_verification_email(self):
        with patch('vericlick.views.send_verification_email') as mock_send:
            res = self.client.post('/api/auth/register/', {
                'username': 'vemail',
                'email': 'vemail@example.com',
                'password': 'strongpass123',
            }, format='json')
            self.assertEqual(res.status_code, status.HTTP_201_CREATED)
            user = User.objects.get(username='vemail')
            self.assertFalse(user.is_active)
            self.assertIn('emailVerified', res.json())
            self.assertFalse(res.json()['emailVerified'])
            mock_send.assert_called_once()
            sent_user, sent_uid, sent_token = mock_send.call_args[0]
            self.assertEqual(sent_user, user)
            self.assertEqual(sent_uid, user.pk)
            self.assertTrue(default_token_generator.check_token(user, sent_token))

    def test_login_unverified_email_blocked_with_message(self):
        User.objects.create_user(
            username='unverified', email='unverified@example.com',
            password='testpass123', is_active=False,
        )
        res = self.client.post('/api/auth/login/', {
            'username': 'unverified', 'password': 'testpass123',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)
        body = res.json()
        self.assertIn('errors', body)
        self.assertIn('verify', body['errors'][0]['detail'].lower())

    def test_verify_email_activates_user_and_returns_tokens(self):
        user = User.objects.create_user(
            username='verifyuser', email='verify@example.com',
            password='testpass123', is_active=False,
        )
        token = default_token_generator.make_token(user)
        res = self.client.post('/api/auth/verify-email/', {
            'uid': user.pk, 'token': token,
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        user.refresh_from_db()
        self.assertTrue(user.is_active)
        body = res.json()
        self.assertIn('access', body)
        self.assertIn('refresh', body)

    def test_verify_email_invalid_token_rejected(self):
        user = User.objects.create_user(
            username='verifybad', email='verifybad@example.com',
            password='testpass123', is_active=False,
        )
        res = self.client.post('/api/auth/verify-email/', {
            'uid': user.pk, 'token': 'not-a-real-token',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        user.refresh_from_db()
        self.assertFalse(user.is_active)

    def test_verify_email_unknown_user_rejected(self):
        res = self.client.post('/api/auth/verify-email/', {
            'uid': 999999, 'token': 'whatever',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_verify_email_already_active_still_returns_tokens(self):
        user = User.objects.create_user(
            username='verifyactive', email='verifyactive@example.com',
            password='testpass123',
        )
        token = default_token_generator.make_token(user)
        res = self.client.post('/api/auth/verify-email/', {
            'uid': user.pk, 'token': token,
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        user.refresh_from_db()
        self.assertTrue(user.is_active)

    def test_resend_verification_sends_email_for_unverified(self):
        with patch('vericlick.views.send_verification_email') as mock_send:
            user = User.objects.create_user(
                username='resenduser', email='resend@example.com',
                password='testpass123', is_active=False,
            )
            res = self.client.post('/api/auth/resend-verification/', {
                'email': 'resend@example.com',
            }, format='json')
            self.assertEqual(res.status_code, status.HTTP_200_OK)
            mock_send.assert_called_once()
            sent_user, _, sent_token = mock_send.call_args[0]
            self.assertEqual(sent_user, user)
            self.assertTrue(default_token_generator.check_token(user, sent_token))

    def test_resend_verification_noop_for_active_or_unknown(self):
        with patch('vericlick.views.send_verification_email') as mock_send:
            User.objects.create_user(
                username='already', email='already@example.com', password='testpass123',
            )
            res = self.client.post('/api/auth/resend-verification/', {
                'email': 'already@example.com',
            }, format='json')
            self.assertEqual(res.status_code, status.HTTP_200_OK)
            res = self.client.post('/api/auth/resend-verification/', {
                'email': 'nobody@example.com',
            }, format='json')
            self.assertEqual(res.status_code, status.HTTP_200_OK)
            mock_send.assert_not_called()

    def test_email_links_are_path_based(self):
        from vericlick.emails import send_password_reset_email, send_verification_email
        user = User.objects.create_user(
            username='pathemail', email='pathemail@example.com',
            password='testpass123', is_active=False,
        )
        captured = {}

        def fake_send_email(to, subject, html, text=None):
            captured['html'] = html

        with patch('vericlick.emails.send_email', side_effect=fake_send_email):
            send_verification_email(user, user.pk, 'tok123')
        self.assertIn(f'/auth/verify-email/{user.pk}/tok123', captured['html'])
        self.assertNotIn('/auth/verify-email?', captured['html'])

        with patch('vericlick.emails.send_email', side_effect=fake_send_email):
            send_password_reset_email(user, user.pk, 'tok456')
        self.assertIn(f'/auth/reset-password/{user.pk}/tok456', captured['html'])
        self.assertNotIn('/auth/reset-password?', captured['html'])

    def test_register_requires_password_min_length(self):
        data = {
            'username': 'shortpass',
            'email': 'short@example.com',
            'password': '1234567',
        }
        res = self.client.post('/api/auth/register/', data, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_register_duplicate_username_fails(self):
        User.objects.create_user(username='existing', password='pass12345')
        data = {
            'username': 'existing',
            'email': 'dup@example.com',
            'password': 'strongpass123',
        }
        res = self.client.post('/api/auth/register/', data, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_login_returns_tokens(self):
        User.objects.create_user(username='loginuser', password='testpass123')
        data = {'username': 'loginuser', 'password': 'testpass123'}
        res = self.client.post('/api/auth/login/', data, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        body = res.json()
        self.assertIn('access', body)
        self.assertIn('refresh', body)

    def test_login_with_email_resolves_to_username(self):
        user = User.objects.create_user(
            username='mailuser', email='Mail.User@Example.com', password='testpass123',
        )
        for identifier in ('mailuser', 'Mail.User@Example.com', 'mail.user@example.com'):
            res = self.client.post(
                '/api/auth/login/',
                {'username': identifier, 'password': 'testpass123'},
                format='json',
            )
            self.assertEqual(res.status_code, status.HTTP_200_OK, msg=f'login via {identifier}')
        self.assertTrue(hasattr(user, 'username'))

    def test_login_wrong_email_denied(self):
        User.objects.create_user(
            username='mailuser2', email='mail2@example.com', password='testpass123',
        )
        res = self.client.post('/api/auth/login/', {
            'username': 'unknown@example.com', 'password': 'testpass123',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_login_invalid_credentials(self):
        res = self.client.post('/api/auth/login/', {
            'username': 'nonexistent',
            'password': 'wrong',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_login_unknown_account_message(self):
        res = self.client.post('/api/auth/login/', {
            'username': 'nobody@example.com',
            'password': 'whatever',
        }, format='json')
        body = res.json()
        self.assertIn('errors', body)
        self.assertIn('account', body['errors'][0]['detail'].lower())

    def test_login_wrong_password_message(self):
        User.objects.create_user(
            username='pwuser', email='pw@example.com', password='correct-horse',
        )
        res = self.client.post('/api/auth/login/', {
            'username': 'pwuser',
            'password': 'wrong-password',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)
        body = res.json()
        self.assertIn('errors', body)
        self.assertIn('password', body['errors'][0]['detail'].lower())

    def test_refresh_token(self):
        User.objects.create_user(username='refreshuser', password='testpass123')
        login_res = self.client.post('/api/auth/login/', {
            'username': 'refreshuser', 'password': 'testpass123',
        }, format='json')
        refresh = login_res.json()['refresh']
        res = self.client.post('/api/auth/refresh/', {'refresh': refresh}, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn('access', res.json())

    def test_register_returns_serialized_user(self):
        data = {'username': 'cameluser', 'email': 'camel@example.com', 'password': 'strongpass123'}
        res = self.client.post('/api/auth/register/', data, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        body = res.json()
        self.assertIn('username', body)
        self.assertEqual(body['username'], 'cameluser')
        self.assertIn('email', body)
        self.assertIn('id', body)
        self.assertNotIn('password', body)


class AccountDeletionTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='deleteuser', email='delete@example.com', password='testpass123'
        )
        self.workspace = Workspace.objects.get(owner=self.user)
        self.client.force_authenticate(user=self.user)

    def test_delete_account_requires_confirmation(self):
        res = self.client.post('/api/auth/delete-account/',
                               {'confirmation': 'nope'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertTrue(User.objects.filter(pk=self.user.pk).exists())

    def test_delete_account_removes_user_and_data(self):
        IPRule.objects.create(workspace=self.workspace)
        res = self.client.post('/api/auth/delete-account/',
                               {'confirmation': '  delete '}, format='json')
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(User.objects.filter(pk=self.user.pk).exists())
        self.assertFalse(Workspace.objects.filter(pk=self.workspace.pk).exists())

    def test_delete_account_requires_auth(self):
        self.client.force_authenticate(user=None)
        res = self.client.post('/api/auth/delete-account/',
                               {'confirmation': 'DELETE'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)


class DashboardEndpointTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='dashuser', password='testpass123')
        self.client.force_authenticate(user=self.user)
        self.workspace = Workspace.objects.get(owner=self.user)

    def test_stats_unauthenticated(self):
        self.client.force_authenticate(user=None)
        res = self.client.get('/api/dashboard/stats/')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_stats_zero_state(self):
        res = self.client.get('/api/dashboard/stats/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        body = res.json()
        self.assertEqual(body['totalVisits24h'], 0)
        self.assertEqual(body['botsBlocked'], 0)
        self.assertEqual(body['botTrafficPercentage'], 0)
        self.assertIsNone(body['clicksTrend'])
        self.assertEqual(body['blocked'], 0)
        self.assertEqual(body['allowed'], 0)
        self.assertIn(body['protectionMode'], ['strict', 'balanced', 'monitor'])
        self.assertIn(body['botAction'], ['block', 'honeypot', 'log'])

    def test_stats_trend_is_computed_from_previous_24h(self):
        now = timezone.now()
        # Event in current 24h window
        TrackerEvent.objects.create(
            workspace=self.workspace, ip='1.1.1.1',
            page_url='https://example.com/', verdict='allowed',
        )
        # Event 2h ago (auto_now_add overrides, so we fix it after)
        ev2 = TrackerEvent.objects.create(
            workspace=self.workspace, ip='3.3.3.3',
            page_url='https://example.com/', verdict='allowed',
        )
        TrackerEvent.objects.filter(pk=ev2.pk).update(created_at=now - timedelta(hours=2))
        # Event 30h ago (falls in previous 24h window)
        ev3 = TrackerEvent.objects.create(
            workspace=self.workspace, ip='2.2.2.2',
            page_url='https://example.com/', verdict='allowed',
        )
        TrackerEvent.objects.filter(pk=ev3.pk).update(created_at=now - timedelta(hours=30))
        res = self.client.get('/api/dashboard/stats/')
        body = res.json()
        self.assertIsNotNone(body['clicksTrend'])
        self.assertAlmostEqual(body['clicksTrend'], 100.0, places=1)

    def test_stats_with_data(self):
        TrackerEvent.objects.create(
            workspace=self.workspace, ip='1.1.1.1',
            page_url='https://example.com/', verdict='blocked', is_bot=True,
        )
        TrackerEvent.objects.create(
            workspace=self.workspace, ip='2.2.2.2',
            page_url='https://example.com/', verdict='allowed', is_bot=False,
        )
        res = self.client.get('/api/dashboard/stats/')
        body = res.json()
        self.assertEqual(body['totalVisits24h'], 2)
        self.assertEqual(body['botsBlocked'], 1)
        self.assertAlmostEqual(body['botTrafficPercentage'], 50.0)

    def test_traffic_defaults_to_7d(self):
        res = self.client.get('/api/dashboard/traffic/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIsInstance(res.json(), list)

    def test_traffic_range_param(self):
        for r in ['7d', '30d', '90d']:
            res = self.client.get(f'/api/dashboard/traffic/?range={r}')
            self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_traffic_returns_aggregated_data(self):
        now = timezone.now()
        TrackerEvent.objects.create(
            workspace=self.workspace, ip='1.1.1.1',
            page_url='https://example.com/', verdict='allowed', is_bot=False,
            created_at=now,
        )
        TrackerEvent.objects.create(
            workspace=self.workspace, ip='2.2.2.2',
            page_url='https://example.com/', verdict='blocked', is_bot=True,
            created_at=now,
        )
        res = self.client.get('/api/dashboard/traffic/?range=7d')
        body = res.json()
        self.assertGreaterEqual(len(body), 1)
        entry = body[0]
        self.assertIn('date', entry)
        self.assertIn('human', entry)
        self.assertIn('bot', entry)

    def test_activity_returns_recent_clicks(self):
        TrackerEvent.objects.create(
            workspace=self.workspace, ip='3.3.3.3',
            page_url='https://example.com/', verdict='allowed', is_bot=False,
        )
        res = self.client.get('/api/dashboard/activity/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        body = res.json()
        self.assertGreaterEqual(len(body), 1)
        self.assertIn('ip', body[0])
        self.assertIn('isBot', body[0])

    def test_activity_unauthenticated(self):
        self.client.force_authenticate(user=None)
        res = self.client.get('/api/dashboard/activity/')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)


# IP Rules

class IPRuleModelTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='iprule_user')
        self.workspace = Workspace.objects.get(owner=self.user)

    def test_create_ip_rule(self):
        rule = IPRule.objects.create(
            workspace=self.workspace,
            ip_or_cidr='192.168.1.1',
            action=IPRule.Action.DENY,
            reason='Known bad IP',
            created_by=self.user,
        )
        self.assertIsInstance(rule.id, uuid.UUID)
        self.assertEqual(str(rule), '192.168.1.1 (deny)')
        self.assertTrue(rule.is_active)
        self.assertIsNone(rule.expires_at)

    def test_cidr_rule(self):
        rule = IPRule.objects.create(
            workspace=self.workspace,
            ip_or_cidr='10.0.0.0/8',
            action=IPRule.Action.ALLOW,
        )
        self.assertEqual(rule.action, 'allow')

    def test_inactive_rule_not_returned_by_default(self):
        IPRule.objects.create(
            workspace=self.workspace,
            ip_or_cidr='1.2.3.4',
            action=IPRule.Action.DENY,
            is_active=False,
        )
        active = IPRule.objects.filter(workspace=self.workspace, is_active=True)
        self.assertEqual(active.count(), 0)


class IPRuleEndpointTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='iprule_api', password='testpass123')
        self.client.force_authenticate(user=self.user)
        self.workspace = Workspace.objects.get(owner=self.user)
        self.plan = Plan.objects.get(code='plus')
        self.workspace.plan = self.plan
        self.workspace.save()

    def test_list_rules_empty(self):
        res = self.client.get('/api/ip-rules/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.json()['results'], [])

    def test_create_deny_rule(self):
        data = {
            'ipOrCidr': '203.0.113.5',
            'action': 'deny',
            'reason': 'Known scanner',
        }
        res = self.client.post('/api/ip-rules/', data, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        body = res.json()
        self.assertEqual(body['ipOrCidr'], '203.0.113.5')
        self.assertEqual(body['action'], 'deny')
        self.assertEqual(body['reason'], 'Known scanner')
        self.assertIsNotNone(body['createdByUsername'])

    def test_create_allow_rule(self):
        data = {
            'ipOrCidr': '10.0.0.0/8',
            'action': 'allow',
            'reason': 'Internal network',
        }
        res = self.client.post('/api/ip-rules/', data, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(res.json()['action'], 'allow')

    def test_workspace_scoping(self):
        other_user = User.objects.create_user(username='other_ip', password='testpass123')
        other_ws = Workspace.objects.get(owner=other_user)
        IPRule.objects.create(workspace=other_ws, ip_or_cidr='1.1.1.1', action='deny')
        IPRule.objects.create(workspace=self.workspace, ip_or_cidr='2.2.2.2', action='allow')
        res = self.client.get('/api/ip-rules/')
        results = res.json()['results']
        ips = [r['ipOrCidr'] for r in results]
        self.assertIn('2.2.2.2', ips)
        self.assertNotIn('1.1.1.1', ips)

    def test_update_rule(self):
        rule = IPRule.objects.create(
            workspace=self.workspace, ip_or_cidr='5.5.5.5', action='deny',
        )
        res = self.client.patch(f'/api/ip-rules/{rule.id}/', {'action': 'allow'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        rule.refresh_from_db()
        self.assertEqual(rule.action, 'allow')

    def test_delete_rule(self):
        rule = IPRule.objects.create(
            workspace=self.workspace, ip_or_cidr='6.6.6.6', action='deny',
        )
        res = self.client.delete(f'/api/ip-rules/{rule.id}/')
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)

    def test_unauthenticated_access(self):
        self.client.force_authenticate(user=None)
        res = self.client.get('/api/ip-rules/')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)


class WorkspaceEndpointTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='ws_api', password='testpass123')
        self.client.force_authenticate(user=self.user)
        self.workspace = Workspace.objects.get(owner=self.user)

    def test_get_workspace(self):
        res = self.client.get('/api/workspace/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        body = res.json()
        self.assertEqual(body['name'], self.workspace.name)
        self.assertIn('trackerSecret', body)
        self.assertIn('safeDestination', body)

    def test_update_safe_destination(self):
        res = self.client.patch(
            '/api/workspace/',
            {'safeDestination': 'https://safety.example.com/honeypot'},
            format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.json()['safeDestination'], 'https://safety.example.com/honeypot')
        self.workspace.refresh_from_db()
        self.assertEqual(self.workspace.safe_destination, 'https://safety.example.com/honeypot')

    def test_tracker_secret_is_read_only(self):
        original = str(self.workspace.tracker_secret)
        res = self.client.patch(
            '/api/workspace/',
            {'trackerSecret': str(uuid.uuid4())},
            format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(str(self.workspace.tracker_secret), original)

    def test_auto_reputation_already_on_and_not_api_toggleable(self):
        self.assertTrue(self.workspace.auto_reputation_enabled)
        res = self.client.patch(
            '/api/workspace/',
            {'autoReputationEnabled': False},
            format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertNotIn('autoReputationEnabled', res.json())
        self.workspace.refresh_from_db()
        self.assertTrue(self.workspace.auto_reputation_enabled)


# Detection Engine / Services

class ServicesTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='services_user')
        self.workspace = Workspace.objects.get(owner=self.user)

    def test_ip_matches_cidr_exact(self):
        from .services import ip_matches_cidr
        self.assertTrue(ip_matches_cidr('192.168.1.1', '192.168.1.1'))

    def test_ip_matches_cidr_subnet(self):
        from .services import ip_matches_cidr
        self.assertTrue(ip_matches_cidr('10.0.0.5', '10.0.0.0/8'))
        self.assertFalse(ip_matches_cidr('11.0.0.5', '10.0.0.0/8'))

    def test_ip_matches_cidr_invalid(self):
        from .services import ip_matches_cidr
        self.assertFalse(ip_matches_cidr('not-an-ip', '10.0.0.0/8'))

    def test_is_likely_bot_ua(self):
        from .services import is_likely_bot_ua
        self.assertTrue(is_likely_bot_ua('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'))
        self.assertTrue(is_likely_bot_ua('python-requests/2.28.0'))
        self.assertFalse(is_likely_bot_ua('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'))

    def test_empty_ua_is_bot(self):
        from .services import is_likely_bot_ua
        self.assertTrue(is_likely_bot_ua(''))
        self.assertTrue(is_likely_bot_ua('   '))

    def test_reason_label_human(self):
        from .services import reason_label
        self.assertIn('Human', reason_label('allowed', ''))

    def test_reason_label_deny_rule(self):
        from .services import reason_label
        self.assertIn('deny rule', reason_label('blocked', 'IPRule: deny (Test block)'))

    def test_reason_label_suspicious_ua(self):
        from .services import reason_label
        self.assertIn('automated', reason_label('blocked', 'Suspicious UA'))

    def test_reason_label_rate_limit(self):
        from .services import reason_label
        self.assertIn('too many requests', reason_label('challenged', 'Rate limit'))

    def test_reason_label_allow_rule(self):
        from .services import reason_label
        self.assertIn('trusted-IP', reason_label('allowed', 'IPRule: allow (Trusted IP)'))

    def test_classify_human(self):
        from .services import classify_request
        result = classify_request(
            None, '8.8.8.8',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            self.workspace,
        )
        self.assertFalse(result['is_bot'])
        self.assertEqual(result['decision'], 'allowed')

    def test_classify_bot_ua(self):
        from .services import classify_request
        result = classify_request(
            None, '8.8.8.8',
            'Googlebot/2.1 (+http://www.google.com/bot.html)',
            self.workspace,
        )
        self.assertTrue(result['is_bot'])
        self.assertEqual(result['decision'], 'blocked')
        self.assertEqual(result['reason'], 'Suspicious UA')

    def test_classify_deny_rule(self):
        from .services import classify_request
        IPRule.objects.create(
            workspace=self.workspace, ip_or_cidr='8.8.8.8',
            action='deny', reason='Test block',
        )
        result = classify_request(
            None, '8.8.8.8',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            self.workspace,
        )
        self.assertTrue(result['is_bot'])
        self.assertEqual(result['decision'], 'blocked')
        self.assertIn('Test block', result['reason'])

    def test_classify_allow_rule_overrides_ua(self):
        from .services import classify_request
        IPRule.objects.create(
            workspace=self.workspace, ip_or_cidr='8.8.8.8',
            action='allow', reason='Trusted IP',
        )
        result = classify_request(
            None, '8.8.8.8',
            'Googlebot/2.1 (+http://www.google.com/bot.html)',
            self.workspace,
        )
        self.assertFalse(result['is_bot'])
        self.assertEqual(result['decision'], 'allowed')
        self.assertIn('allow', result['reason'])

    def test_classify_allow_rule_takes_precedence_over_deny(self):
        from .services import classify_request
        IPRule.objects.create(
            workspace=self.workspace, ip_or_cidr='0.0.0.0/0',
            action='deny', reason='Deny all',
        )
        IPRule.objects.create(
            workspace=self.workspace, ip_or_cidr='8.8.8.8',
            action='allow', reason='Trusted IP',
        )
        result = classify_request(
            None, '8.8.8.8',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            self.workspace,
        )
        self.assertFalse(result['is_bot'])
        self.assertEqual(result['decision'], 'allowed')
        self.assertIn('Trusted IP', result['reason'])

    def test_classify_deny_rule_takes_precedence_over_bot_heuristics(self):
        from .services import classify_request
        IPRule.objects.create(
            workspace=self.workspace, ip_or_cidr='8.8.8.8',
            action='deny', reason='Block specific',
        )
        result = classify_request(
            None, '8.8.8.8',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            self.workspace,
        )
        self.assertTrue(result['is_bot'])
        self.assertEqual(result['decision'], 'blocked')

    def test_lookup_location_private(self):
        from .services import lookup_location
        self.assertEqual(lookup_location('127.0.0.1')['country'], 'Localhost')
        self.assertEqual(lookup_location('192.168.1.1')['country'], 'Private network')

    def test_lookup_location_invalid(self):
        from .services import lookup_location
        loc = lookup_location('not-an-ip')
        self.assertEqual(loc, {'country': '', 'country_code': '', 'region': '', 'city': ''})

    def test_get_safe_destination_prefers_workspace(self):
        from .services import get_safe_destination
        self.workspace.safe_destination = 'https://safe.example.com/'
        self.workspace.save()
        self.assertEqual(get_safe_destination(self.workspace), 'https://safe.example.com/')

    def test_get_safe_destination_fallback(self):
        from .services import get_safe_destination
        self.assertEqual(get_safe_destination(self.workspace), '/suspicious/')

    def test_classify_expired_rule_ignored(self):
        from .services import classify_request
        IPRule.objects.create(
            workspace=self.workspace, ip_or_cidr='8.8.8.8',
            action='deny', reason='Expired',
            expires_at=timezone.now() - timedelta(days=1),
        )
        result = classify_request(
            None, '8.8.8.8',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            self.workspace,
        )
        self.assertFalse(result['is_bot'])
        self.assertEqual(result['decision'], 'allowed')

    def test_inactive_rule_ignored(self):
        from .services import classify_request
        IPRule.objects.create(
            workspace=self.workspace, ip_or_cidr='8.8.8.8',
            action='deny', reason='Inactive',
            is_active=False,
        )
        result = classify_request(
            None, '8.8.8.8',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            self.workspace,
        )
        self.assertFalse(result['is_bot'])
        self.assertEqual(result['decision'], 'allowed')


# SEO Endpoints

class SEOEndpointTests(APITestCase):
    @override_settings(SITE_URL='https://example.org')
    def test_robots_txt(self):
        res = self.client.get('/robots.txt')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res['Content-Type'], 'text/plain')
        body = res.content.decode()
        self.assertIn('Disallow: /auth/', body)
        self.assertIn('Disallow: /api/', body)
        self.assertIn('Sitemap: https://example.org/sitemap.xml', body)

    @override_settings(SITE_URL='https://example.org')
    def test_sitemap_xml(self):
        res = self.client.get('/sitemap.xml')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res['Content-Type'], 'application/xml')
        body = res.content.decode()
        self.assertIn('<urlset', body)
        self.assertIn('<loc>https://example.org/</loc>', body)
        self.assertIn('<loc>https://example.org/pricing</loc>', body)
        self.assertNotIn('auth', body)


# Tracker Events

class TrackerEventTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='tracker_user')
        self.workspace = Workspace.objects.get(owner=self.user)

    def _payload(self, **overrides):
        data = {
            'site_id': str(self.workspace.id),
            'token': str(self.workspace.tracker_secret),
            'page_url': 'https://example.com/landing',
            'referrer': 'https://google.com',
            'signals': {
                'user_agent': 'Mozilla/5.0',
                'language': 'en-US',
                'cookies_enabled': True,
                'timezone': 'America/New_York',
                'touch_support': False,
                'screen_depth': 24,
                'plugins': 5,
                'viewport': {'width': 1920, 'height': 1080},
            },
            'engagement': {'moves': 42, 'clicks': 3, 'scroll_depth': 60, 'time_on_page': 12},
        }
        data.update(overrides)
        return data

    def test_creates_tracker_event(self):
        res = self.client.post('/api/tracker/event/', self._payload(), format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.json()['status'], 'ok')
        self.assertEqual(TrackerEvent.objects.count(), 1)
        event = TrackerEvent.objects.first()
        self.assertEqual(event.workspace, self.workspace)
        self.assertEqual(event.page_url, 'https://example.com/landing')
        self.assertEqual(event.referrer, 'https://google.com')

    def test_bad_site_id_returns_400(self):
        res = self.client.post('/api/tracker/event/', self._payload(site_id=str(uuid.uuid4())), format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(TrackerEvent.objects.count(), 0)

    def test_missing_site_id_returns_400(self):
        payload = self._payload()
        del payload['site_id']
        res = self.client.post('/api/tracker/event/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(TrackerEvent.objects.count(), 0)

    def test_missing_token_returns_400(self):
        payload = self._payload()
        del payload['token']
        res = self.client.post('/api/tracker/event/', payload, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(TrackerEvent.objects.count(), 0)

    def test_invalid_token_returns_400(self):
        res = self.client.post('/api/tracker/event/', self._payload(token='not-the-secret'), format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(TrackerEvent.objects.count(), 0)

    def test_token_binds_to_workspace(self):
        other_user = User.objects.create_user(username='other_tracker')
        other_ws = Workspace.objects.get(owner=other_user)
        res = self.client.post(
            '/api/tracker/event/',
            self._payload(site_id=str(other_ws.id), token=str(self.workspace.tracker_secret)),
            format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(TrackerEvent.objects.count(), 0)

    def test_allows_unauthenticated(self):
        res = self.client.post('/api/tracker/event/', self._payload(), format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_all_signal_fields_stored(self):
        res = self.client.post('/api/tracker/event/', self._payload(), format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        event = TrackerEvent.objects.first()
        for key in ['user_agent', 'language', 'cookies_enabled', 'timezone', 'touch_support', 'screen_depth', 'plugins', 'viewport']:
            self.assertIn(key, event.signals)
        self.assertEqual(event.signals['viewport'], {'width': 1920, 'height': 1080})
        self.assertEqual(event.engagement['moves'], 42)
        self.assertEqual(event.engagement['clicks'], 3)
        self.assertEqual(event.engagement['scroll_depth'], 60)
        self.assertEqual(event.engagement['time_on_page'], 12)


# Blocked IPs

class BlockedIPTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='blocked_user', password='testpass123')
        self.client.force_authenticate(user=self.user)
        self.workspace = Workspace.objects.get(owner=self.user)
        self.other_user = User.objects.create_user(username='other_blocked', password='testpass123')
        self.other_ws = Workspace.objects.get(owner=self.other_user)

    def test_list_blocked_ips(self):
        TrackerEvent.objects.create(
            workspace=self.workspace, ip='203.0.113.5',
            page_url='https://example.com/', verdict='blocked',
            reason='Suspicious UA', is_bot=True,
            country='Australia', region='New South Wales', city='Sydney',
        )
        TrackerEvent.objects.create(
            workspace=self.workspace, ip='8.8.8.8',
            page_url='https://example.com/', verdict='allowed', is_bot=False,
        )
        res = self.client.get('/api/ip-rules/blocked/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        body = res.json()
        self.assertEqual(body['count'], 1)
        entry = body['results'][0]
        self.assertEqual(entry['ip'], '203.0.113.5')
        self.assertEqual(entry['reason'], 'Suspicious UA')
        self.assertEqual(entry['verdict'], 'blocked')
        self.assertTrue(entry['isBot'])

    def test_only_own_workspace_blocked(self):
        TrackerEvent.objects.create(
            workspace=self.workspace, ip='203.0.113.5',
            page_url='https://example.com/', verdict='blocked', is_bot=True,
        )
        TrackerEvent.objects.create(
            workspace=self.other_ws, ip='198.51.100.7',
            page_url='https://other.com/', verdict='blocked', is_bot=True,
        )
        res = self.client.get('/api/ip-rules/blocked/')
        body = res.json()
        self.assertEqual(body['count'], 1)
        self.assertEqual(body['results'][0]['ip'], '203.0.113.5')

    def test_search_by_ip(self):
        TrackerEvent.objects.create(
            workspace=self.workspace, ip='203.0.113.5',
            page_url='https://example.com/', verdict='blocked', is_bot=True,
        )
        TrackerEvent.objects.create(
            workspace=self.workspace, ip='198.51.100.7',
            page_url='https://example.com/', verdict='blocked', is_bot=True,
        )
        res = self.client.get('/api/ip-rules/blocked/?search=198')
        body = res.json()
        self.assertEqual(body['count'], 1)
        self.assertEqual(body['results'][0]['ip'], '198.51.100.7')

    def test_unauthenticated_access(self):
        self.client.force_authenticate(user=None)
        res = self.client.get('/api/ip-rules/blocked/')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_whitelist_creates_allow_rule(self):
        event = TrackerEvent.objects.create(
            workspace=self.workspace, ip='203.0.113.5',
            page_url='https://example.com/', verdict='blocked', is_bot=True,
        )
        res = self.client.post(f'/api/ip-rules/{event.id}/whitelist/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        body = res.json()
        self.assertEqual(body['ipOrCidr'], '203.0.113.5')
        self.assertEqual(body['action'], 'allow')
        rule = IPRule.objects.get(workspace=self.workspace, ip_or_cidr='203.0.113.5')
        self.assertEqual(rule.action, 'allow')
        self.assertTrue(rule.is_active)

    def test_whitelist_cross_workspace_rejected(self):
        event = TrackerEvent.objects.create(
            workspace=self.other_ws, ip='198.51.100.7',
            page_url='https://other.com/', verdict='blocked', is_bot=True,
        )
        res = self.client.post(f'/api/ip-rules/{event.id}/whitelist/')
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)
        self.assertFalse(IPRule.objects.filter(ip_or_cidr='198.51.100.7').exists())

    def test_whitelist_existing_rule_reactivated(self):
        event = TrackerEvent.objects.create(
            workspace=self.workspace, ip='203.0.113.5',
            page_url='https://example.com/', verdict='blocked', is_bot=True,
        )
        IPRule.objects.create(
            workspace=self.workspace, ip_or_cidr='203.0.113.5',
            action='allow', is_active=False,
        )
        res = self.client.post(f'/api/ip-rules/{event.id}/whitelist/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(
            IPRule.objects.filter(workspace=self.workspace, ip_or_cidr='203.0.113.5').count(), 1,
        )
        rule = IPRule.objects.get(workspace=self.workspace, ip_or_cidr='203.0.113.5')
        self.assertTrue(rule.is_active)

    def test_whitelisted_ip_hidden_from_blocked_list(self):
        blocked_ip = '203.0.113.5'
        other_ip = '198.51.100.7'
        event = TrackerEvent.objects.create(
            workspace=self.workspace, ip=blocked_ip,
            page_url='https://example.com/', verdict='blocked', is_bot=True,
        )
        TrackerEvent.objects.create(
            workspace=self.workspace, ip=other_ip,
            page_url='https://example.com/', verdict='blocked', is_bot=True,
        )
        res = self.client.post(f'/api/ip-rules/{event.id}/whitelist/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        res = self.client.get('/api/ip-rules/blocked/')
        ips = [e['ip'] for e in res.json()['results']]
        self.assertNotIn(blocked_ip, ips)
        self.assertIn(other_ip, ips)


class BillingPeriodGrantTests(APITestCase):
    """A purchase must grant exactly the access it was sold: 7 days weekly,
    30 days monthly."""

    def setUp(self):
        self.user = User.objects.create_user(username='granted', email='g@example.com', password='pw')
        self.workspace = Workspace.objects.get(owner=self.user)
        self.plan = Plan.objects.get(code='plus')

    def _pay(self, period):
        from vericlick.payments import fulfil_paid_checkout
        intent = CheckoutIntent.objects.create(
            workspace=self.workspace, plan=self.plan, user=self.user,
            billing_mode=CheckoutIntent.BillingMode.PERIOD,
            billing_period=period,
            checkout_id=f'chk_{period}',
            status=CheckoutIntent.Status.OPEN,
        )
        fulfil_paid_checkout(intent.checkout_id, charge_id=f'ch_{period}')
        self.workspace.refresh_from_db()
        return intent

    def _granted_days(self):
        from django.utils import timezone
        delta = self.workspace.plan_expires_at - timezone.now()
        # Round to shed the sub-second drift between grant and assertion.
        return round(delta.total_seconds() / 86400)

    def test_weekly_grants_seven_days(self):
        self._pay('weekly')
        self.assertEqual(self._granted_days(), 7)
        self.assertEqual(self.workspace.plan_billing_period, 'weekly')
        self.assertEqual(self.workspace.plan, self.plan)

    def test_monthly_grants_thirty_days(self):
        self._pay('monthly')
        self.assertEqual(self._granted_days(), 30)
        self.assertEqual(self.workspace.plan_billing_period, 'monthly')

    def test_ledger_records_the_price_for_that_period(self):
        self._pay('monthly')
        event = BillingEvent.objects.filter(workspace=self.workspace).latest('occurred_at')
        self.assertEqual(event.amount, self.plan.monthly_price)
        self.assertEqual(event.data['billing_period'], 'monthly')

    def test_weekly_ledger_uses_the_weekly_price(self):
        self._pay('weekly')
        event = BillingEvent.objects.filter(workspace=self.workspace).latest('occurred_at')
        self.assertEqual(event.amount, self.plan.weekly_price)

    def test_period_days_follows_the_purchase(self):
        self._pay('weekly')
        self.assertEqual(self.workspace.period_days, 7)
        self.workspace.plan_billing_period = 'monthly'
        self.assertEqual(self.workspace.period_days, 30)


class PricingEndpointTests(APITestCase):
    def test_pricing_returns_seeded_plans(self):
        res = self.client.get('/api/pricing/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        body = res.json()
        codes = [p['code'] for p in body['plans']]
        self.assertEqual(codes, ['basic', 'plus', 'pro'])
        by_code = {p['code']: p for p in body['plans']}
        self.assertEqual(by_code['basic']['weeklyPrice'], 25)
        self.assertEqual(by_code['plus']['weeklyPrice'], 50)
        self.assertEqual(by_code['pro']['weeklyPrice'], 100)

    def test_pricing_returns_monthly_prices(self):
        res = self.client.get('/api/pricing/')
        by_code = {p['code']: p for p in res.json()['plans']}
        self.assertEqual(by_code['basic']['monthlyPrice'], 100)
        self.assertEqual(by_code['plus']['monthlyPrice'], 150)
        self.assertEqual(by_code['pro']['monthlyPrice'], 200)

    def test_monthly_availability_follows_bachs_product(self):
        res = self.client.get('/api/pricing/')
        by_code = {p['code']: p for p in res.json()['plans']}
        # No monthly Bachs product is seeded, so monthly starts unavailable.
        self.assertFalse(by_code['plus']['monthlyAvailable'])
        Plan.objects.filter(code='plus').update(bachs_monthly_product_id='prod_m')
        res = self.client.get('/api/pricing/')
        by_code = {p['code']: p for p in res.json()['plans']}
        self.assertTrue(by_code['plus']['monthlyAvailable'])

    def test_pricing_hides_inactive_plans(self):
        Plan.objects.filter(code='pro').update(is_active=False)
        res = self.client.get('/api/pricing/')
        codes = [p['code'] for p in res.json()['plans']]
        self.assertNotIn('pro', codes)


class DiscountCodeEndpointTests(APITestCase):
    def setUp(self):
        DiscountCode.objects.create(
            code='SPRING20', discount_percent=20, max_uses=100,
        )

    def test_validate_valid_code(self):
        res = self.client.post('/api/discount-codes/validate/', {'code': 'spring20'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        body = res.json()
        self.assertTrue(body['valid'])
        self.assertEqual(body['discountPercent'], 20)

    def test_validate_unknown_code(self):
        res = self.client.post('/api/discount-codes/validate/', {'code': 'NOPE'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_validate_inactive_code(self):
        DiscountCode.objects.filter(code='BETA20').update(is_active=False)
        res = self.client.post('/api/discount-codes/validate/', {'code': 'BETA20'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_validate_exhausted_code(self):
        DiscountCode.objects.filter(code='BETA20').update(uses_count=100)
        res = self.client.post('/api/discount-codes/validate/', {'code': 'BETA20'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_validate_missing_code(self):
        res = self.client.post('/api/discount-codes/validate/', {}, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)


class SignupToggleTests(APITestCase):
    def test_signups_closed_blocks_register(self):
        SiteConfig.objects.update(signups_open=False)
        res = self.client.post('/api/auth/register/', {
            'username': 'blockeduser',
            'email': 'blocked@example.com',
            'password': 'strongpass123',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(User.objects.filter(username='blockeduser').exists())

    def test_signups_open_allows_register(self):
        res = self.client.post('/api/auth/register/', {
            'username': 'alloweduser',
            'email': 'allowed@example.com',
            'password': 'strongpass123',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)


class SiteConfigEndpointTests(APITestCase):
    def test_site_config_defaults(self):
        res = self.client.get('/api/site-config/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        body = res.json()
        self.assertTrue(body['signupsOpen'])

    def test_site_config_reflects_admin_changes(self):
        SiteConfig.objects.update(signups_open=False)
        res = self.client.get('/api/site-config/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        body = res.json()
        self.assertFalse(body['signupsOpen'])


class UpgradeEndpointTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='upgradeuser', password='testpass123')
        self.client.force_authenticate(user=self.user)
        self.workspace = Workspace.objects.get(owner=self.user)
        Plan.objects.filter(code='plus').update(bachs_product_id='prod_plus')

    def test_upgrade_requires_auth(self):
        self.client.force_authenticate(user=None)
        res = self.client.post('/api/upgrade/', {'plan_code': 'basic'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    @patch('vericlick.payments.create_checkout_session')
    def test_upgrade_creates_checkout_session(self, mock_create):
        mock_create.return_value = {
            'checkout_id': 'chk_test123',
            'checkout_url': 'https://checkout.bachs.io/c/tok_test',
            'expires_at': '2026-01-01T00:00:00Z',
        }
        res = self.client.post('/api/upgrade/', {'plan_code': 'plus'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        body = res.json()
        self.assertEqual(body['checkoutUrl'], 'https://checkout.bachs.io/c/tok_test')
        self.assertEqual(body['checkoutId'], 'chk_test123')
        self.workspace.refresh_from_db()
        self.assertIsNone(self.workspace.plan)
        self.assertTrue(mock_create.called)
        intent = CheckoutIntent.objects.get(workspace=self.workspace)
        self.assertEqual(intent.checkout_id, 'chk_test123')
        self.assertEqual(intent.plan.code, 'plus')

    def test_upgrade_plan_without_product_rejected(self):
        Plan.objects.filter(code='plus').update(bachs_product_id='')
        res = self.client.post('/api/upgrade/', {'plan_code': 'plus'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(CheckoutIntent.objects.filter(workspace=self.workspace).exists())

    def test_upgrade_unknown_plan_rejected(self):
        res = self.client.post('/api/upgrade/', {'plan_code': 'platinum'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_upgrade_inactive_plan_rejected(self):
        Plan.objects.filter(code='pro').update(is_active=False)
        res = self.client.post('/api/upgrade/', {'plan_code': 'pro'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)


class BachsWebhookEndpointTests(APITestCase):
    SECRET = 'whsec_test_secret'

    def setUp(self):
        self.user = User.objects.create_user(username='payuser', email='pay@example.com', password='testpass123')
        self.workspace = Workspace.objects.get(owner=self.user)
        self.plan = Plan.objects.get(code='plus')
        self.intent = CheckoutIntent.objects.create(
            workspace=self.workspace, plan=self.plan, user=self.user,
            checkout_id='chk_paid123',
        )

    def _signed_delivery(self, payload):
        body = json.dumps(payload).encode('utf-8')
        timestamp = str(int(time.time()))
        message = f'{timestamp}.{body.decode("utf-8")}'
        signature = hmac.new(
            self.SECRET.encode(), message.encode('utf-8'), hashlib.sha256
        ).hexdigest()
        return body.decode('utf-8'), timestamp, signature

    def _post(self, body, timestamp, signature):
        return self.client.post(
            '/api/webhooks/bachs/',
            data=body,
            content_type='application/json',
            HTTP_X_BACHS_TIMESTAMP=timestamp,
            HTTP_X_BACHS_SIGNATURE=signature,
        )

    def _collection_event(self, checkout_id=None):
        return {
            'id': 'evt_test1',
            'type': 'collection.succeeded',
            'created_at': '2026-08-10T00:00:00Z',
            'organization_id': 'org_test',
            'data': {
                'charge_id': 'chr_test1',
                'checkout_id': checkout_id or self.intent.checkout_id,
                'status': 'SUCCEEDED',
                'amount': '10.00',
                'currency': 'USD',
            },
        }

    @override_settings(BACHS_WEBHOOK_SECRET='whsec_test_secret')
    def test_paid_collection_grants_plan(self):
        body, ts, sig = self._signed_delivery(self._collection_event())
        res = self._post(body, ts, sig)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.workspace.refresh_from_db()
        self.intent.refresh_from_db()
        self.assertEqual(self.workspace.plan.code, 'plus')
        self.assertEqual(self.intent.status, CheckoutIntent.Status.PAID)
        self.assertEqual(self.intent.charge_id, 'chr_test1')

    @override_settings(BACHS_WEBHOOK_SECRET='whsec_test_secret')
    def test_duplicate_delivery_is_idempotent(self):
        body, ts, sig = self._signed_delivery(self._collection_event())
        self.assertEqual(self._post(body, ts, sig).status_code, status.HTTP_200_OK)
        self.assertEqual(self._post(body, ts, sig).status_code, status.HTTP_200_OK)
        self.workspace.refresh_from_db()
        self.intent.refresh_from_db()
        self.assertEqual(self.workspace.plan.code, 'plus')
        self.assertEqual(self.intent.status, CheckoutIntent.Status.PAID)

    @override_settings(BACHS_WEBHOOK_SECRET='whsec_test_secret')
    @override_settings(PAYMENT_NOTIFY_EMAILS=['owner@example.com', 'engineer@example.com'])
    @patch('vericlick.emails.send_payment_admin_notification')
    def test_paid_collection_notifies_owner_and_engineer(self, mock_notify):
        body, ts, sig = self._signed_delivery(self._collection_event())
        res = self._post(body, ts, sig)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.workspace.refresh_from_db()
        self.intent.refresh_from_db()
        self.assertEqual(self.workspace.plan.code, 'plus')
        self.assertEqual(self.intent.status, CheckoutIntent.Status.PAID)
        mock_notify.assert_called_once()
        self.assertEqual(mock_notify.call_args.kwargs['charge_id'], 'chr_test1')

    @override_settings(BACHS_WEBHOOK_SECRET='whsec_test_secret')
    def test_bad_signature_rejected(self):
        body, ts, sig = self._signed_delivery(self._collection_event())
        res = self._post(body, ts, 'deadbeef' * 8)
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)
        self.intent.refresh_from_db()
        self.assertEqual(self.intent.status, CheckoutIntent.Status.OPEN)

    @override_settings(BACHS_WEBHOOK_SECRET='whsec_test_secret')
    def test_unknown_checkout_id_is_ignored(self):
        event = self._collection_event(checkout_id='chk_nope')
        body, ts, sig = self._signed_delivery(event)
        res = self._post(body, ts, sig)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.workspace.refresh_from_db()
        self.assertIsNone(self.workspace.plan)

    @override_settings(BACHS_WEBHOOK_SECRET='whsec_test_secret')
    def test_non_payment_event_is_ignored(self):
        event = {'id': 'evt_other', 'type': 'customer.created', 'data': {}}
        body, ts, sig = self._signed_delivery(event)
        res = self._post(body, ts, sig)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.workspace.refresh_from_db()
        self.assertIsNone(self.workspace.plan)

    @override_settings(BACHS_WEBHOOK_SECRET='')
    def test_webhook_rejected_when_unconfigured(self):
        body, ts, sig = self._signed_delivery(self._collection_event())
        res = self._post(body, ts, sig)
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)


class PasswordResetEndpointTests(APITestCase):
    def setUp(self):
        self.shared_email = 'reset@example.com'
        self.user = User.objects.create_user(username='resetuser', email=self.shared_email, password='testpass123')

    def test_reset_request_generic_response(self):
        res = self.client.post('/api/auth/password-reset/', {'email': self.shared_email}, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_reset_request_unknown_email_is_200(self):
        res = self.client.post('/api/auth/password-reset/', {'email': 'nobody@example.com'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_reset_request_no_email_rejected(self):
        res = self.client.post('/api/auth/password-reset/', {}, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_reset_request_duplicate_email_does_not_500(self):
        User.objects.create_user(username='resetuser2', email=self.shared_email, password='testpass123')
        res = self.client.post('/api/auth/password-reset/', {'email': self.shared_email}, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)


class AdminManualPaymentActionTests(TestCase):
    def setUp(self):
        self.plan = Plan.objects.create(
            code='manual-test-pro', name='Pro', weekly_price='25.00', monthly_price='90.00',
            domain_limit=20, is_active=True,
        )
        self.owner = User.objects.create_user(username='owner', email='owner@example.com', password='pw')
        self.ws = Workspace.objects.create(name='Acme', owner=self.owner)
        self.staff = User.objects.create_superuser(username='admin', email='admin@example.com', password='pw')
        self.client.force_login(self.staff)
        self.changelist = reverse('admin:vericlick_workspace_changelist')

    def _post_action(self, **overrides):
        data = {
            'action': 'record_manual_payment',
            'apply': 'Record payment',
            admin.helpers.ACTION_CHECKBOX_NAME: str(self.ws.pk),
            'kind': 'plan_period_paid',
            'plan': str(self.plan.pk),
            'amount': '25.00',
            'currency': 'USD',
            'charge_id': 'chr_manual_1',
            'note': 'paid via payment link',
            'activate': 'on',
        }
        data.update(overrides)
        return self.client.post(self.changelist, data)

    def test_records_event_and_activates_period_plan(self):
        res = self._post_action()
        self.assertRedirects(res, self.changelist)
        evt = BillingEvent.objects.get(workspace=self.ws)
        self.assertEqual(evt.kind, BillingEvent.Kind.PLAN_PERIOD_PAID)
        self.assertEqual(evt.plan_name, 'Pro')
        self.assertEqual(evt.amount, Decimal('25.00'))
        self.assertEqual(evt.charge_id, 'chr_manual_1')
        self.ws.refresh_from_db()
        self.assertEqual(self.ws.plan, self.plan)
        self.assertEqual(self.ws.plan_billing_mode, Workspace.BillingMode.PERIOD)
        self.assertIsNotNone(self.ws.plan_expires_at)

    def test_without_activate_only_logs_event(self):
        res = self._post_action(activate='')
        self.assertRedirects(res, self.changelist)
        self.assertEqual(BillingEvent.objects.count(), 1)
        self.ws.refresh_from_db()
        self.assertIsNone(self.ws.plan)

    def test_invalid_kind_rejected(self):
        res = self._post_action(kind='not_a_kind')
        self.assertRedirects(res, self.changelist)
        self.assertEqual(BillingEvent.objects.count(), 0)

    def test_invalid_amount_rejected(self):
        res = self._post_action(amount='abc')
        self.assertRedirects(res, self.changelist)
        self.assertEqual(BillingEvent.objects.count(), 0)


class BillingGraceSuspensionTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='payperiod', email='period@example.com', password='pw')
        self.workspace = Workspace.objects.get(owner=self.user)
        self.plan = Plan.objects.get(code='plus')
        self.plan.bachs_product_id = 'prod_recurring'
        self.plan.bachs_ot_product_id = 'prod_one_time'
        self.plan.save()
        self.workspace.plan = self.plan
        self.workspace.plan_billing_mode = Workspace.BillingMode.PERIOD
        self.workspace.plan_expires_at = timezone.now() + timedelta(days=5)
        self.workspace.save()

    def _expire(self):
        self.workspace.plan_expires_at = timezone.now() - timedelta(days=1)
        self.workspace.save()

    def _end_grace(self):
        self.workspace.plan_expires_at = timezone.now() - timedelta(days=8)
        self.workspace.save()

    def test_status_transitions(self):
        self.assertEqual(self.workspace.plan_status, 'active')
        self.assertTrue(self.workspace.has_plan_access())
        self._expire()
        self.assertEqual(self.workspace.plan_status, 'grace')
        self.assertTrue(self.workspace.has_plan_access())
        self._end_grace()
        self.assertEqual(self.workspace.plan_status, 'suspended')
        self.assertFalse(self.workspace.has_plan_access())

    def test_grace_keeps_plan_access(self):
        self._expire()
        self.assertEqual(self.workspace.plan_status, 'grace')
        self.assertTrue(self.workspace.has_plan_access())
        self.assertIsNotNone(self.workspace.active_plan)

    def test_suspended_drops_plan_access(self):
        self._end_grace()
        self.assertEqual(self.workspace.plan_status, 'suspended')
        self.assertFalse(self.workspace.has_plan_access())
        self.assertIsNone(self.workspace.active_plan)

    def test_suspended_tracker_event_not_recorded(self):
        self._end_grace()
        res = self.client.post(
            '/api/tracker/event/',
            {
                'site_id': str(self.workspace.id),
                'token': str(self.workspace.tracker_secret),
                'page_url': 'https://example.com/',
            },
            format='json',
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(TrackerEvent.objects.filter(workspace=self.workspace).count(), 0)

    @patch('vericlick.emails.send_period_expiring_email')
    def test_expiring_check_emits_event_and_email_once(self, mock_email):
        self.workspace.plan_expires_at = timezone.now() + timedelta(days=2)
        self.workspace.save()
        from vericlick.payments import maybe_run_billing_checks
        maybe_run_billing_checks(self.workspace, force=True)
        maybe_run_billing_checks(self.workspace, force=True)
        self.assertEqual(
            BillingEvent.objects.filter(workspace=self.workspace, kind=BillingEvent.Kind.PLAN_EXPIRING).count(), 1
        )
        self.assertEqual(mock_email.call_count, 1)

    @patch('vericlick.emails.send_period_expired_email')
    @patch('vericlick.emails.send_plan_suspended_email')
    def test_expired_then_suspended_emits_each_once(self, mock_suspended, mock_expired):
        self._end_grace()
        from vericlick.payments import maybe_run_billing_checks
        maybe_run_billing_checks(self.workspace, force=True)
        maybe_run_billing_checks(self.workspace, force=True)
        self.assertEqual(
            BillingEvent.objects.filter(workspace=self.workspace, kind=BillingEvent.Kind.PLAN_EXPIRED).count(), 1
        )
        self.assertEqual(
            BillingEvent.objects.filter(workspace=self.workspace, kind=BillingEvent.Kind.PLAN_SUSPENDED).count(), 1
        )
        self.assertEqual(mock_expired.call_count, 1)
        self.assertEqual(mock_suspended.call_count, 1)

    def test_billing_history_reflects_grace(self):
        self.client.force_authenticate(user=self.user)
        self._expire()
        res = self.client.get('/api/workspace/billing-history/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        sub = res.json()['subscription']
        self.assertEqual(sub['status'], 'grace')
        self.assertIsNotNone(sub['graceExpiresAt'])
        self.assertEqual(sub['planName'], 'Plus')


@override_settings(BACHS_API_KEY='test_api_key')
class CheckoutProductSelectionTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='prodsel', email='prod@example.com', password='pw')
        self.workspace = Workspace.objects.get(owner=self.user)
        self.plan = Plan.objects.get(code='plus')
        self.plan.bachs_product_id = 'prod_recurring'
        self.plan.bachs_ot_product_id = 'prod_one_time'
        self.plan.save()

    @patch('vericlick.payments._request')
    def test_period_uses_one_time_product_and_methods(self, mock_request):
        mock_request.return_value = {
            'checkout_id': 'chk_1', 'checkout_url': 'https://checkout.bachs.io/c/tok', 'expires_at': 'x',
        }
        from vericlick.payments import create_checkout_session
        from vericlick.models import CheckoutIntent
        intent = CheckoutIntent.objects.create(
            workspace=self.workspace, plan=self.plan, user=self.user,
            billing_mode=CheckoutIntent.BillingMode.PERIOD,
        )
        create_checkout_session(intent, self.plan, 'a@b.com', 'a', payment_methods=['crypto'])
        payload = mock_request.call_args.kwargs['payload']
        self.assertEqual(payload['product_cart'][0]['product_id'], 'prod_one_time')
        self.assertEqual(payload['allowed_payment_method_types'], ['crypto'])

    @patch('vericlick.payments._request')
    def test_monthly_period_uses_the_monthly_product(self, mock_request):
        mock_request.return_value = {
            'checkout_id': 'chk_2', 'checkout_url': 'https://checkout.bachs.io/c/tok2', 'expires_at': 'x',
        }
        self.plan.bachs_monthly_product_id = 'prod_monthly'
        self.plan.save()
        from vericlick.payments import create_checkout_session
        from vericlick.models import CheckoutIntent, Plan as PlanModel
        intent = CheckoutIntent.objects.create(
            workspace=self.workspace, plan=self.plan, user=self.user,
            billing_mode=CheckoutIntent.BillingMode.PERIOD,
            billing_period=PlanModel.BillingPeriod.MONTHLY,
        )
        create_checkout_session(intent, self.plan, 'a@b.com', 'a')
        payload = mock_request.call_args.kwargs['payload']
        self.assertEqual(payload['product_cart'][0]['product_id'], 'prod_monthly')
        self.assertEqual(payload['metadata']['billing_period'], 'monthly')

    @patch('vericlick.payments._request')
    def test_monthly_without_product_is_rejected(self, mock_request):
        from vericlick.payments import create_checkout_session, BachsError
        from vericlick.models import CheckoutIntent, Plan as PlanModel
        self.plan.bachs_monthly_product_id = ''
        self.plan.save()
        intent = CheckoutIntent.objects.create(
            workspace=self.workspace, plan=self.plan, user=self.user,
            billing_mode=CheckoutIntent.BillingMode.PERIOD,
            billing_period=PlanModel.BillingPeriod.MONTHLY,
        )
        # Must fail loudly rather than silently charging the weekly price.
        with self.assertRaises(BachsError):
            create_checkout_session(intent, self.plan, 'a@b.com', 'a')
        self.assertFalse(mock_request.called)

    @patch('vericlick.payments._request')
    def test_period_falls_back_to_recurring_product_when_no_one_time_set(self, mock_request):
        mock_request.return_value = {
            'checkout_id': 'chk_3', 'checkout_url': 'https://checkout.bachs.io/c/tok3', 'expires_at': 'x',
        }
        self.plan.bachs_ot_product_id = ''
        self.plan.save()
        from vericlick.payments import create_checkout_session
        from vericlick.models import CheckoutIntent
        intent = CheckoutIntent.objects.create(
            workspace=self.workspace, plan=self.plan, user=self.user,
            billing_mode=CheckoutIntent.BillingMode.PERIOD,
        )
        create_checkout_session(intent, self.plan, 'a@b.com', 'a')
        payload = mock_request.call_args.kwargs['payload']
        self.assertEqual(payload['product_cart'][0]['product_id'], 'prod_recurring')

    @patch('vericlick.payments.create_checkout_session')
    def test_period_upgrade_allowed_with_only_one_time_product(self, mock_create):
        mock_create.return_value = {
            'checkout_id': 'chk_4', 'checkout_url': 'https://checkout.bachs.io/c/tok4', 'expires_at': 'x',
        }
        self.client.force_authenticate(user=self.user)
        Plan.objects.filter(code='plus').update(bachs_product_id='', bachs_ot_product_id='prod_one_time')
        res = self.client.post(
            '/api/upgrade/', {'plan_code': 'plus', 'billing_mode': 'period'}, format='json'
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.json()['checkoutUrl'], 'https://checkout.bachs.io/c/tok4')


# ---- v2.0.0 Traffic Rules + Instant Authorize + Site Shield ----

DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'
MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
BOT_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'

US_LOCATION = {
    'country': 'United States', 'country_code': 'US', 'region': 'CA', 'city': 'Mountain View',
}


def _make_workspace(username):
    user = User.objects.create_user(username=username)
    return Workspace.objects.get(owner=user)


class DeviceParsingTests(TestCase):
    def test_desktop(self):
        from .services import parse_device
        d = parse_device(DESKTOP_UA)
        self.assertEqual(d['device_class'], 'desktop')
        self.assertEqual(d['os_family'], 'Windows')
        self.assertEqual(d['browser'], 'Chrome')
        self.assertFalse(d['is_bot'])

    def test_mobile_and_tablet(self):
        from .services import parse_device
        self.assertEqual(parse_device(MOBILE_UA)['device_class'], 'mobile')
        self.assertEqual(parse_device(MOBILE_UA)['os_family'], 'iOS')
        ipad = 'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'
        self.assertEqual(parse_device(ipad)['device_class'], 'tablet')

    def test_bot_and_blank(self):
        from .services import parse_device
        self.assertTrue(parse_device(BOT_UA)['is_bot'])
        self.assertEqual(parse_device(BOT_UA)['device_class'], 'bot')
        self.assertTrue(parse_device('')['is_bot'])
        self.assertTrue(parse_device('   ')['is_bot'])

    def test_os_normalization(self):
        from .services import normalize_os_family
        self.assertEqual(normalize_os_family('Mac OS X'), 'macOS')
        self.assertEqual(normalize_os_family('Windows Phone'), 'Windows')
        self.assertEqual(normalize_os_family('Ubuntu'), 'Linux')
        self.assertEqual(normalize_os_family('Chrome OS'), 'Chrome OS')
        self.assertEqual(normalize_os_family(''), 'Other')


class CountryRuleClassificationTests(TestCase):
    def setUp(self):
        self.workspace = _make_workspace('country_cls')

    @patch('vericlick.services.lookup_location', return_value=dict(US_LOCATION))
    def test_country_deny_blocks(self, _mock):
        from .models import CountryRule
        from .services import classify_request
        CountryRule.objects.create(
            workspace=self.workspace, country_code='US', action=CountryRule.Action.DENY,
        )
        result = classify_request(None, '8.8.8.8', DESKTOP_UA, self.workspace)
        self.assertTrue(result['is_bot'])
        self.assertEqual(result['decision'], 'blocked')
        self.assertEqual(result['reason'], 'CountryRule: deny')
        self.assertEqual(result['matched_rule'], 'US')

    @patch('vericlick.services.lookup_location', return_value=dict(US_LOCATION))
    def test_country_allow_wins_over_deny(self, _mock):
        from .models import CountryRule
        from .services import classify_request
        CountryRule.objects.create(
            workspace=self.workspace, country_code='US', action=CountryRule.Action.ALLOW,
        )
        CountryRule.objects.create(
            workspace=self.workspace, country_code='US', action=CountryRule.Action.DENY,
        )
        result = classify_request(None, '8.8.8.8', BOT_UA, self.workspace)
        self.assertFalse(result['is_bot'])
        self.assertEqual(result['decision'], 'allowed')

    @patch('vericlick.services.lookup_location', return_value=dict(US_LOCATION))
    def test_other_country_not_blocked(self, _mock):
        from .models import CountryRule
        from .services import classify_request
        CountryRule.objects.create(
            workspace=self.workspace, country_code='NG', action=CountryRule.Action.DENY,
        )
        result = classify_request(None, '8.8.8.8', DESKTOP_UA, self.workspace)
        self.assertEqual(result['decision'], 'allowed')

    @patch('vericlick.services.lookup_location', return_value=dict(US_LOCATION))
    def test_inactive_country_rule_ignored(self, _mock):
        from .models import CountryRule
        from .services import classify_request
        CountryRule.objects.create(
            workspace=self.workspace, country_code='US', action=CountryRule.Action.DENY,
            is_active=False,
        )
        result = classify_request(None, '8.8.8.8', DESKTOP_UA, self.workspace)
        self.assertEqual(result['decision'], 'allowed')

    def test_ip_allow_rule_still_wins_over_country_deny(self):
        from .models import CountryRule, IPRule
        from .services import classify_request
        CountryRule.objects.create(
            workspace=self.workspace, country_code='US', action=CountryRule.Action.DENY,
        )
        IPRule.objects.create(
            workspace=self.workspace, ip_or_cidr='8.8.8.8', action=IPRule.Action.ALLOW,
        )
        result = classify_request(None, '8.8.8.8', DESKTOP_UA, self.workspace)
        self.assertEqual(result['decision'], 'allowed')
        self.assertIn('allow', result['reason'])


class DevicePolicyClassificationTests(TestCase):
    def setUp(self):
        self.workspace = _make_workspace('device_cls')

    def test_no_policy_means_all_allowed(self):
        from .services import classify_request
        result = classify_request(None, '8.8.8.8', MOBILE_UA, self.workspace)
        self.assertEqual(result['decision'], 'allowed')

    def test_allowed_classes_excludes_mobile(self):
        from .models import DevicePolicy
        from .services import classify_request
        DevicePolicy.objects.create(
            workspace=self.workspace, allowed_device_classes=['desktop'],
        )
        result = classify_request(None, '8.8.8.8', MOBILE_UA, self.workspace)
        self.assertTrue(result['is_bot'])
        self.assertEqual(result['decision'], 'blocked')
        self.assertEqual(result['reason'], 'device')
        self.assertEqual(result['matched_rule'], 'mobile')

    def test_blocked_os_family(self):
        from .models import DevicePolicy
        from .services import classify_request
        DevicePolicy.objects.create(
            workspace=self.workspace, blocked_os_families=['iOS'],
        )
        result = classify_request(None, '8.8.8.8', MOBILE_UA, self.workspace)
        self.assertEqual(result['decision'], 'blocked')
        self.assertEqual(result['reason'], 'os')

    def test_desktop_allowed_when_os_blocked_is_other(self):
        from .models import DevicePolicy
        from .services import classify_request
        DevicePolicy.objects.create(
            workspace=self.workspace, blocked_os_families=['iOS'],
        )
        result = classify_request(None, '8.8.8.8', DESKTOP_UA, self.workspace)
        self.assertEqual(result['decision'], 'allowed')


class CountryRuleApiTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='country_api', password='pw123')
        self.client.force_authenticate(user=self.user)
        self.workspace = Workspace.objects.get(owner=self.user)
        self.plan = Plan.objects.get(code='plus')
        self.workspace.plan = self.plan
        self.workspace.save()

    def test_create_country_rule(self):
        res = self.client.post('/api/country-rules/', {
            'country_code': 'cn', 'action': 'deny',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        body = res.json()
        self.assertEqual(body['countryCode'], 'CN')
        from .models import CountryRule
        self.assertTrue(CountryRule.objects.filter(
            workspace=self.workspace, country_code='CN', action='deny'
        ).exists())

    def test_upsert_reactivates_existing(self):
        from .models import CountryRule
        rule = CountryRule.objects.create(
            workspace=self.workspace, country_code='US', action='deny', is_active=False,
        )
        res = self.client.post('/api/country-rules/', {
            'country_code': 'us', 'action': 'deny',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(CountryRule.objects.filter(
            workspace=self.workspace, country_code='US', action='deny'
        ).count(), 1)
        rule.refresh_from_db()
        self.assertTrue(rule.is_active)

    def test_invalid_country_code_rejected(self):
        res = self.client.post('/api/country-rules/', {
            'country_code': 'USA', 'action': 'deny',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_list_scoped_to_workspace(self):
        from .models import CountryRule
        CountryRule.objects.create(workspace=self.workspace, country_code='US', action='deny')
        other = _make_workspace('country_api_other')
        CountryRule.objects.create(workspace=other, country_code='NG', action='deny')
        res = self.client.get('/api/country-rules/')
        codes = [r['countryCode'] for r in res.json()['results']]
        self.assertIn('US', codes)
        self.assertNotIn('NG', codes)


class DevicePolicyApiTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='device_api', password='pw123')
        self.client.force_authenticate(user=self.user)
        self.workspace = Workspace.objects.get(owner=self.user)
        self.plan = Plan.objects.get(code='plus')
        self.workspace.plan = self.plan
        self.workspace.save()

    def test_get_creates_policy_lazily(self):
        from .models import DevicePolicy
        self.assertFalse(DevicePolicy.objects.filter(workspace=self.workspace).exists())
        res = self.client.get('/api/device-policy/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(DevicePolicy.objects.filter(workspace=self.workspace).exists())
        self.assertEqual(res.json()['allowedDeviceClasses'], [])

    def test_patch_updates_policy(self):
        res = self.client.patch('/api/device-policy/', {
            'allowed_device_classes': ['desktop'],
            'blocked_os_families': ['Android'],
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        body = res.json()
        self.assertEqual(body['allowedDeviceClasses'], ['desktop'])
        self.assertEqual(body['blockedOsFamilies'], ['Android'])

    def test_patch_rejects_unknown_device_class(self):
        res = self.client.patch('/api/device-policy/', {
            'allowed_device_classes': ['hoverboard'],
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_patch_rejected_when_suspended(self):
        self.workspace.plan_expires_at = timezone.now() - timedelta(days=99)
        self.workspace.plan_billing_mode = Workspace.BillingMode.PERIOD
        self.workspace.plan = Plan.objects.get(code='plus')
        self.workspace.save()
        res = self.client.patch('/api/device-policy/', {
            'allowed_device_classes': ['desktop'],
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)


class DashboardBreakdownTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='breakdown_user', password='pw123')
        self.client.force_authenticate(user=self.user)
        self.workspace = Workspace.objects.get(owner=self.user)
        for i in range(3):
            TrackerEvent.objects.create(
                workspace=self.workspace, ip='1.1.1.1',
                page_url='https://example.com/',
                country_code='US', country='United States',
                device_class='desktop', verdict='allowed',
            )
        TrackerEvent.objects.create(
            workspace=self.workspace, ip='2.2.2.2',
            page_url='https://example.com/',
            country_code='NG', country='Nigeria',
            device_class='mobile', verdict='blocked',
        )

    def test_country_breakdown(self):
        res = self.client.get('/api/dashboard/breakdown/?dimension=country&range=30d')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        rows = res.json()
        by_key = {r['key']: r for r in rows}
        self.assertEqual(by_key['US']['total'], 3)
        self.assertEqual(by_key['NG']['blocked'], 1)

    def test_device_breakdown(self):
        res = self.client.get('/api/dashboard/breakdown/?dimension=device&range=30d')
        rows = res.json()
        by_key = {r['key']: r for r in rows}
        self.assertEqual(by_key['desktop']['total'], 3)
        self.assertEqual(by_key['mobile']['blocked'], 1)

    def test_breakdown_requires_auth(self):
        self.client.force_authenticate(user=None)
        res = self.client.get('/api/dashboard/breakdown/')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)


class TrackerEventBeaconVerdictTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='beacon_user')
        self.workspace = Workspace.objects.get(owner=self.user)

    def test_beacon_stores_verdict_fields(self):
        res = self.client.post('/api/tracker/event/', {
            'site_id': str(self.workspace.id),
            'token': str(self.workspace.tracker_secret),
            'page_url': 'https://brand.example.com/landing',
            'verdict': 'allowed',
            'is_bot': False,
            'reason': '',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        event = TrackerEvent.objects.get(workspace=self.workspace)
        self.assertEqual(event.verdict, 'allowed')
        self.assertFalse(event.is_bot)

    def test_beacon_without_verdict_stays_blank(self):
        self.client.post('/api/tracker/event/', {
            'site_id': str(self.workspace.id),
            'token': str(self.workspace.tracker_secret),
            'page_url': 'https://brand.example.com/landing',
        }, format='json')
        event = TrackerEvent.objects.get(workspace=self.workspace)
        self.assertEqual(event.verdict, '')
        self.assertFalse(event.is_bot)


# ---------------------------------------------------------------------------
# Domain Verification
# ---------------------------------------------------------------------------

class DomainVerifyChallengeTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='verify_user', password='testpass123')
        self.client.force_authenticate(user=self.user)
        self.workspace = Workspace.objects.get(owner=self.user)
        self.domain = DomainRegistry.objects.create(
            workspace=self.workspace, domain='example.com', purpose='protection',
        )

    def test_challenge_generates_token(self):
        res = self.client.get(f'/api/domains/{self.domain.id}/verify-challenge/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        body = res.json()
        self.assertEqual(body['method'], 'html_meta')
        self.assertIn('token', body)
        self.assertIn('metaTag', body)
        self.assertIn(body['token'], body['metaTag'])
        self.domain.refresh_from_db()
        self.assertEqual(self.domain.verification_token, body['token'])

    def test_challenge_dns_method(self):
        res = self.client.get(f'/api/domains/{self.domain.id}/verify-challenge/?method=dns_txt')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        body = res.json()
        self.assertEqual(body['method'], 'dns_txt')
        self.assertIn('_vericlick-challenge.example.com', body['dnsName'])
        self.assertIn('vericlick-verify=', body['dnsValue'])

    def test_challenge_returns_existing_token(self):
        self.domain.generate_verification_token()
        original = self.domain.verification_token
        res = self.client.get(f'/api/domains/{self.domain.id}/verify-challenge/')
        self.assertEqual(res.json()['token'], original)

    def test_challenge_not_found(self):
        res = self.client.get(f'/api/domains/{uuid.uuid4()}/verify-challenge/')
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_challenge_requires_auth(self):
        self.client.force_authenticate(user=None)
        res = self.client.get(f'/api/domains/{self.domain.id}/verify-challenge/')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)


class DomainVerifyConfirmTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='confirm_user', password='testpass123')
        self.client.force_authenticate(user=self.user)
        self.workspace = Workspace.objects.get(owner=self.user)
        self.domain = DomainRegistry.objects.create(
            workspace=self.workspace, domain='example.com', purpose='protection',
        )

    def test_already_verified_returns_true(self):
        self.domain.verified = True
        self.domain.save()
        res = self.client.post(f'/api/domains/{self.domain.id}/verify-confirm/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.json()['verified'])

    def test_no_token_returns_400(self):
        res = self.client.post(f'/api/domains/{self.domain.id}/verify-confirm/')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    @patch('vericlick.views._check_meta_tag', return_value=True)
    def test_successful_verification(self, mock_check):
        self.domain.generate_verification_token()
        res = self.client.post(f'/api/domains/{self.domain.id}/verify-confirm/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        body = res.json()
        self.assertTrue(body['verified'])
        self.domain.refresh_from_db()
        self.assertTrue(self.domain.verified)

    @patch('vericlick.views._check_meta_tag', return_value=False)
    def test_failed_verification(self, mock_check):
        self.domain.generate_verification_token()
        res = self.client.post(f'/api/domains/{self.domain.id}/verify-confirm/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        body = res.json()
        self.assertFalse(body['verified'])
        self.assertIn('error', body)

    def test_not_found(self):
        res = self.client.post(f'/api/domains/{uuid.uuid4()}/verify-confirm/')
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)


class DomainRecheckTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='recheck_user', password='testpass123')
        self.client.force_authenticate(user=self.user)
        self.workspace = Workspace.objects.get(owner=self.user)
        self.domain = DomainRegistry.objects.create(
            workspace=self.workspace, domain='example.com', purpose='protection',
        )

    @patch('urllib.request.urlopen')
    def test_healthy_domain(self, mock_urlopen):
        mock_resp = mock_urlopen.return_value.__enter__.return_value
        mock_resp.status = 200
        res = self.client.post(f'/api/domains/{self.domain.id}/recheck/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        body = res.json()
        self.assertEqual(body['healthStatus'], 'healthy')

    @patch('urllib.request.urlopen', side_effect=OSError('connection refused'))
    def test_unhealthy_domain(self, mock_urlopen):
        res = self.client.post(f'/api/domains/{self.domain.id}/recheck/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.json()['healthStatus'], 'unhealthy')


# ---------------------------------------------------------------------------
# Install Tokens
# ---------------------------------------------------------------------------

class InstallTokenTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='token_user', password='testpass123')
        self.client.force_authenticate(user=self.user)
        self.workspace = Workspace.objects.get(owner=self.user)

    def test_list_empty(self):
        res = self.client.get('/api/install-tokens/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.json(), [])

    def test_create_token(self):
        res = self.client.post('/api/install-tokens/', {'label': 'Test'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        body = res.json()
        self.assertTrue(body['token'].startswith('vc_'))
        self.assertEqual(body['label'], 'Test')
        self.assertIn('id', body)
        self.assertIn('expiresAt', body)

    def test_token_shown_once(self):
        res = self.client.post('/api/install-tokens/', format='json')
        raw_token = res.json()['token']
        self.assertTrue(raw_token.startswith('vc_'))
        self.assertNotIn('token', self.client.get('/api/install-tokens/').json()[0])

    def test_max_5_tokens(self):
        for i in range(5):
            InstallToken.create_for_workspace(self.workspace, label=f'Token {i}')
        res = self.client.post('/api/install-tokens/', format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_revoke_token(self):
        raw, inst = InstallToken.create_for_workspace(self.workspace)
        res = self.client.delete(f'/api/install-tokens/{inst.id}/')
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)
        inst.refresh_from_db()
        self.assertFalse(inst.is_active)

    def test_revoke_nonexistent(self):
        res = self.client.delete(f'/api/install-tokens/{uuid.uuid4()}/')
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_verify_token_valid(self):
        raw, inst = InstallToken.create_for_workspace(self.workspace)
        ws, token = InstallToken.verify_token(raw)
        self.assertEqual(ws.id, self.workspace.id)
        self.assertEqual(token.id, inst.id)

    def test_verify_token_invalid(self):
        ws, token = InstallToken.verify_token('vc_nonexistent')
        self.assertIsNone(ws)
        self.assertIsNone(token)

    def test_verify_token_inactive(self):
        raw, inst = InstallToken.create_for_workspace(self.workspace)
        inst.is_active = False
        inst.save()
        ws, _ = InstallToken.verify_token(raw)
        self.assertIsNone(ws)

    def test_workspace_scoping(self):
        other = User.objects.create_user(username='other_token', password='testpass123')
        other_ws = Workspace.objects.get(owner=other)
        raw, inst = InstallToken.create_for_workspace(other_ws)
        res = self.client.get('/api/install-tokens/')
        self.assertEqual(len(res.json()), 0)


# ---------------------------------------------------------------------------
# Redirect Domains
# ---------------------------------------------------------------------------

class RedirectDomainTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='rdomain_user', password='testpass123')
        self.client.force_authenticate(user=self.user)
        self.workspace = Workspace.objects.get(owner=self.user)
        self.plan = Plan.objects.get(code='plus')
        self.workspace.plan = self.plan
        self.workspace.save()

    def test_list_empty(self):
        res = self.client.get('/api/redirect-domains/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.json(), [])

    def test_create_redirect_domain(self):
        res = self.client.post('/api/redirect-domains/', {
            'domain': 'go.example.com',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        body = res.json()
        self.assertEqual(body['domain'], 'go.example.com')
        self.assertEqual(body['purpose'], 'redirect')

    def test_duplicate_domain_returns_existing(self):
        existing = DomainRegistry.objects.create(
            workspace=self.workspace, domain='go.example.com', purpose='redirect',
        )
        res = self.client.post('/api/redirect-domains/', {
            'domain': 'go.example.com',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.json()['id'], str(existing.id))
        self.assertEqual(
            DomainRegistry.objects.filter(workspace=self.workspace, domain='go.example.com').count(), 1,
        )

    def test_verified_protection_domain_is_reusable(self):
        protection = DomainRegistry.objects.create(
            workspace=self.workspace, domain='shielded.example.com',
            purpose='protection', verified=True,
        )
        res = self.client.post('/api/redirect-domains/', {
            'domain': 'shielded.example.com',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.json()['id'], str(protection.id))
        # Reuse must not consume a second domain slot.
        self.assertEqual(
            DomainRegistry.objects.filter(workspace=self.workspace, domain='shielded.example.com').count(), 1,
        )

    def test_unverified_protection_domain_is_not_reusable(self):
        DomainRegistry.objects.create(
            workspace=self.workspace, domain='pending.example.com',
            purpose='protection', verified=False,
        )
        res = self.client.post('/api/redirect-domains/', {
            'domain': 'pending.example.com',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_list_includes_verified_protection_domains_only(self):
        DomainRegistry.objects.create(
            workspace=self.workspace, domain='r.example.com', purpose='redirect',
        )
        DomainRegistry.objects.create(
            workspace=self.workspace, domain='ok.example.com',
            purpose='protection', verified=True,
        )
        DomainRegistry.objects.create(
            workspace=self.workspace, domain='nope.example.com',
            purpose='protection', verified=False,
        )
        res = self.client.get('/api/redirect-domains/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        listed = {d['domain'] for d in res.json()}
        self.assertIn('r.example.com', listed)
        self.assertIn('ok.example.com', listed)
        self.assertNotIn('nope.example.com', listed)

    def test_route_can_be_created_on_verified_protection_domain(self):
        protection = DomainRegistry.objects.create(
            workspace=self.workspace, domain='go.shielded.example.com',
            purpose='protection', verified=True,
        )
        res = self.client.post('/api/redirect-routes/', {
            'domain_id': str(protection.id),
            'destination_url': 'https://example.com/landing',
            'slug': 'promo',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertTrue(RedirectRoute.objects.filter(domain=protection).exists())

    def test_domain_limit_enforced(self):
        for i in range(10):
            DomainRegistry.objects.create(
                workspace=self.workspace, domain=f'd{i}.example.com', purpose='redirect',
            )
        res = self.client.post('/api/redirect-domains/', {
            'domain': 'extra.example.com',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)


# ---------------------------------------------------------------------------
# Redirect Routes
# ---------------------------------------------------------------------------

class RedirectRouteTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='route_user', password='testpass123')
        self.client.force_authenticate(user=self.user)
        self.workspace = Workspace.objects.get(owner=self.user)
        self.domain = DomainRegistry.objects.create(
            workspace=self.workspace, domain='go.example.com',
            purpose='redirect', verified=True,
        )

    def test_list_empty(self):
        res = self.client.get('/api/redirect-routes/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.json(), [])

    def test_create_route(self):
        res = self.client.post('/api/redirect-routes/', {
            'domain_id': str(self.domain.id),
            'destination_url': 'https://target.example.com',
            'slug': 'promo',
            'bot_action': 'honeypot',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        body = res.json()
        self.assertEqual(body['slug'], 'promo')
        self.assertEqual(body['destinationUrl'], 'https://target.example.com')
        self.assertTrue(body['isActive'])

    def test_create_requires_domain_and_url(self):
        res = self.client.post('/api/redirect-routes/', {}, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_create_unverified_domain_rejected(self):
        d = DomainRegistry.objects.create(
            workspace=self.workspace, domain='unverified.com', purpose='redirect',
        )
        res = self.client.post('/api/redirect-routes/', {
            'domain_id': str(d.id),
            'destination_url': 'https://target.example.com',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_auto_replace_existing_route(self):
        RedirectRoute.objects.create(
            workspace=self.workspace, domain=self.domain,
            destination_url='https://old.example.com',
        )
        res = self.client.post('/api/redirect-routes/', {
            'domain_id': str(self.domain.id),
            'destination_url': 'https://new.example.com',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(RedirectRoute.objects.filter(workspace=self.workspace).count(), 1)
        self.assertEqual(
            RedirectRoute.objects.first().destination_url, 'https://new.example.com',
        )

    def test_get_route_detail(self):
        route = RedirectRoute.objects.create(
            workspace=self.workspace, domain=self.domain,
            destination_url='https://target.example.com',
        )
        res = self.client.get(f'/api/redirect-routes/{route.id}/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.json()['destinationUrl'], 'https://target.example.com')

    def test_patch_route(self):
        route = RedirectRoute.objects.create(
            workspace=self.workspace, domain=self.domain,
            destination_url='https://old.example.com',
        )
        res = self.client.patch(f'/api/redirect-routes/{route.id}/', {
            'destination_url': 'https://new.example.com',
            'bot_action': 'block',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        route.refresh_from_db()
        self.assertEqual(route.destination_url, 'https://new.example.com')
        self.assertEqual(route.bot_action, 'block')

    def test_patch_null_fallback_url_is_rejected(self):
        # Previously setattr'd straight onto a NOT NULL column -> 500.
        route = RedirectRoute.objects.create(
            workspace=self.workspace, domain=self.domain,
            destination_url='https://old.example.com', fallback_url='https://fb.example.com',
        )
        res = self.client.patch(f'/api/redirect-routes/{route.id}/', {
            'fallback_url': None,
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        route.refresh_from_db()
        self.assertEqual(route.fallback_url, '')

    def test_patch_invalid_bot_action_is_rejected(self):
        # Previously saved silently, leaving a route the edge cannot interpret.
        route = RedirectRoute.objects.create(
            workspace=self.workspace, domain=self.domain,
            destination_url='https://old.example.com', bot_action='honeypot',
        )
        res = self.client.patch(f'/api/redirect-routes/{route.id}/', {
            'bot_action': 'garbage',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        route.refresh_from_db()
        self.assertEqual(route.bot_action, 'honeypot')

    def test_patch_invalid_destination_url_is_rejected(self):
        route = RedirectRoute.objects.create(
            workspace=self.workspace, domain=self.domain,
            destination_url='https://old.example.com',
        )
        res = self.client.patch(f'/api/redirect-routes/{route.id}/', {
            'destination_url': 'javascript:alert(1)',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        route.refresh_from_db()
        self.assertEqual(route.destination_url, 'https://old.example.com')

    def test_patch_invalid_slug_is_rejected(self):
        route = RedirectRoute.objects.create(
            workspace=self.workspace, domain=self.domain,
            destination_url='https://old.example.com', slug='good',
        )
        res = self.client.patch(f'/api/redirect-routes/{route.id}/', {
            'slug': 'bad slug/../etc',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        route.refresh_from_db()
        self.assertEqual(route.slug, 'good')

    def test_create_route_rejects_invalid_bot_action(self):
        res = self.client.post('/api/redirect-routes/', {
            'domain_id': str(self.domain.id),
            'destination_url': 'https://target.example.com',
            'bot_action': 'garbage',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_create_route_without_fallback_url_succeeds(self):
        # The honeypot/block/neutral default path — previously an IntegrityError.
        res = self.client.post('/api/redirect-routes/', {
            'domain_id': str(self.domain.id),
            'destination_url': 'https://target.example.com',
            'bot_action': 'honeypot',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertEqual(RedirectRoute.objects.get(domain=self.domain).fallback_url, '')

    def test_delete_route(self):
        route = RedirectRoute.objects.create(
            workspace=self.workspace, domain=self.domain,
            destination_url='https://target.example.com',
        )
        res = self.client.delete(f'/api/redirect-routes/{route.id}/')
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(RedirectRoute.objects.filter(id=route.id).exists())

    def test_renew_route(self):
        route = RedirectRoute.objects.create(
            workspace=self.workspace, domain=self.domain,
            destination_url='https://target.example.com',
            expires_at=timezone.now() + timedelta(days=1),
        )
        res = self.client.post(f'/api/redirect-routes/{route.id}/renew/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        route.refresh_from_db()
        self.assertTrue(route.is_active)
        self.assertGreater(route.expires_at, timezone.now() + timedelta(days=6))

    def test_activate_route(self):
        route = RedirectRoute.objects.create(
            workspace=self.workspace, domain=self.domain,
            destination_url='https://target.example.com',
            is_active=False,
            expires_at=timezone.now() + timedelta(days=3),
        )
        res = self.client.post(f'/api/redirect-routes/{route.id}/activate/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        route.refresh_from_db()
        self.assertTrue(route.is_active)

    def test_activate_expired_route_rejected(self):
        route = RedirectRoute.objects.create(
            workspace=self.workspace, domain=self.domain,
            destination_url='https://target.example.com',
            is_active=False,
            expires_at=timezone.now() - timedelta(days=1),
        )
        res = self.client.post(f'/api/redirect-routes/{route.id}/activate/')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_deactivate_route(self):
        route = RedirectRoute.objects.create(
            workspace=self.workspace, domain=self.domain,
            destination_url='https://target.example.com',
            is_active=True,
        )
        res = self.client.post(f'/api/redirect-routes/{route.id}/deactivate/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        route.refresh_from_db()
        self.assertFalse(route.is_active)

    def test_one_to_one_enforced(self):
        RedirectRoute.objects.create(
            workspace=self.workspace, domain=self.domain,
            destination_url='https://a.example.com',
        )
        with self.assertRaises(Exception):
            RedirectRoute.objects.create(
                workspace=self.workspace, domain=self.domain,
                destination_url='https://b.example.com',
            )


# ---------------------------------------------------------------------------
# Edge Sync Credential Management
# ---------------------------------------------------------------------------

class EdgeCredentialTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='edge_user', password='testpass123')
        self.client.force_authenticate(user=self.user)
        self.workspace = Workspace.objects.get(owner=self.user)

    def test_list_empty(self):
        res = self.client.get('/api/edge/credentials/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.json(), [])

    def test_create_credential(self):
        res = self.client.post('/api/edge/credentials/', {
            'label': 'FlokiNET DE',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        body = res.json()
        self.assertTrue(body['key'].startswith('ek_'))
        self.assertEqual(body['label'], 'FlokiNET DE')

    def test_max_2_credentials(self):
        EdgeSyncCredential.create_for_workspace(self.workspace, label='Node 1')
        EdgeSyncCredential.create_for_workspace(self.workspace, label='Node 2')
        res = self.client.post('/api/edge/credentials/', format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_revoke_credential(self):
        raw, cred = EdgeSyncCredential.create_for_workspace(self.workspace)
        res = self.client.delete(f'/api/edge/credentials/{cred.id}/')
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)
        cred.refresh_from_db()
        self.assertFalse(cred.is_active)

    def test_revoke_allows_new_creation(self):
        _, cred = EdgeSyncCredential.create_for_workspace(self.workspace)
        cred.is_active = False
        cred.save()
        res = self.client.post('/api/edge/credentials/', format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

    def test_verify_key_valid(self):
        raw, cred = EdgeSyncCredential.create_for_workspace(self.workspace)
        ws, instance = EdgeSyncCredential.verify_key(raw)
        self.assertEqual(ws.id, self.workspace.id)
        self.assertEqual(instance.id, cred.id)

    def test_verify_key_invalid(self):
        ws, cred = EdgeSyncCredential.verify_key('ek_nonexistent')
        self.assertIsNone(ws)
        self.assertIsNone(cred)

    def test_verify_key_inactive(self):
        raw, cred = EdgeSyncCredential.create_for_workspace(self.workspace)
        cred.is_active = False
        cred.save()
        ws, _ = EdgeSyncCredential.verify_key(raw)
        self.assertIsNone(ws)

    def test_verify_key_updates_last_sync(self):
        raw, cred = EdgeSyncCredential.create_for_workspace(self.workspace)
        self.assertIsNone(cred.last_sync_at)
        EdgeSyncCredential.verify_key(raw)
        cred.refresh_from_db()
        self.assertIsNotNone(cred.last_sync_at)


# ---------------------------------------------------------------------------
# Edge Sync Endpoint
# ---------------------------------------------------------------------------

class EdgeSyncTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='sync_user', password='testpass123')
        self.workspace = Workspace.objects.get(owner=self.user)
        self.raw_key, self.cred = EdgeSyncCredential.create_for_workspace(
            self.workspace, label='Test Node',
        )
        self.headers = {'HTTP_X_EDGE_API_KEY': self.raw_key}

    def test_requires_edge_api_key(self):
        res = self.client.get('/api/edge/sync/')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_invalid_key(self):
        res = self.client.get('/api/edge/sync/', **{'HTTP_X_EDGE_API_KEY': 'ek_bad'})
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_returns_routes(self):
        domain = DomainRegistry.objects.create(
            workspace=self.workspace, domain='go.example.com',
            purpose='redirect', verified=True,
        )
        RedirectRoute.objects.create(
            workspace=self.workspace, domain=domain,
            destination_url='https://target.example.com',
            bot_action='honeypot',
        )
        res = self.client.get('/api/edge/sync/', **self.headers)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        body = res.json()
        self.assertIn('routes', body)
        self.assertIn('blockedIps', body)
        self.assertIn('countryRules', body)
        self.assertEqual(len(body['routes']), 1)
        self.assertEqual(body['routes'][0]['domain'], 'go.example.com')

    def test_returns_blocked_ips(self):
        IPRule.objects.create(
            workspace=self.workspace, ip_or_cidr='1.2.3.4', action='deny',
        )
        res = self.client.get('/api/edge/sync/', **self.headers)
        self.assertIn('1.2.3.4', res.json()['blockedIps'])

    def test_returns_country_rules(self):
        CountryRule.objects.create(
            workspace=self.workspace, country_code='CN', action='deny',
        )
        res = self.client.get('/api/edge/sync/', **self.headers)
        rules = res.json()['countryRules']
        self.assertTrue(any(r['countryCode'] == 'CN' for r in rules))

    def test_domain_filter(self):
        d1 = DomainRegistry.objects.create(
            workspace=self.workspace, domain='a.com',
            purpose='redirect', verified=True,
        )
        d2 = DomainRegistry.objects.create(
            workspace=self.workspace, domain='b.com',
            purpose='redirect', verified=True,
        )
        RedirectRoute.objects.create(workspace=self.workspace, domain=d1, destination_url='https://a.example.com')
        RedirectRoute.objects.create(workspace=self.workspace, domain=d2, destination_url='https://b.example.com')
        res = self.client.get('/api/edge/sync/?domain=a.com', **self.headers)
        routes = res.json()['routes']
        self.assertEqual(len(routes), 1)
        self.assertEqual(routes[0]['domain'], 'a.com')

    def test_sync_token_present(self):
        res = self.client.get('/api/edge/sync/', **self.headers)
        self.assertIn('syncToken', res.json())


# ---------------------------------------------------------------------------
# Edge Validate Domain
# ---------------------------------------------------------------------------

class EdgeValidateDomainTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='val_user', password='testpass123')
        self.workspace = Workspace.objects.get(owner=self.user)

    def test_vericlick_cc_always_valid(self):
        res = self.client.get('/api/edge/validate-domain/?domain=vericlick.cc')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_active_route_returns_200(self):
        domain = DomainRegistry.objects.create(
            workspace=self.workspace, domain='go.example.com',
            purpose='redirect', verified=True,
        )
        RedirectRoute.objects.create(
            workspace=self.workspace, domain=domain,
            destination_url='https://target.example.com',
        )
        res = self.client.get('/api/edge/validate-domain/?domain=go.example.com')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_unknown_domain_returns_404(self):
        res = self.client.get('/api/edge/validate-domain/?domain=unknown.com')
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_no_domain_param_returns_404(self):
        res = self.client.get('/api/edge/validate-domain/')
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)


# ---------------------------------------------------------------------------
# Edge Events Batch
# ---------------------------------------------------------------------------

class EdgeEventsBatchTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='events_user', password='testpass123')
        self.workspace = Workspace.objects.get(owner=self.user)
        self.raw_key, self.cred = EdgeSyncCredential.create_for_workspace(self.workspace)
        self.domain = DomainRegistry.objects.create(
            workspace=self.workspace, domain='go.example.com',
            purpose='redirect', verified=True,
        )
        self.route = RedirectRoute.objects.create(
            workspace=self.workspace, domain=self.domain,
            destination_url='https://target.example.com',
        )
        self.headers = {'HTTP_X_EDGE_API_KEY': self.raw_key}

    def test_requires_edge_api_key(self):
        res = self.client.post('/api/edge/events/', {'events': []}, format='json')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_creates_events(self):
        res = self.client.post('/api/edge/events/', {
            'events': [{
                'domain': 'go.example.com',
                'slug': 'promo',
                'ip': '1.2.3.4',
                'user_agent': 'Mozilla/5.0',
                'destination': 'https://target.example.com',
                'verdict': 'allowed',
                'is_bot': False,
                'country_code': 'US',
                'country': 'United States',
            }],
        }, format='json', **self.headers)
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.json()['created'], 1)
        self.assertEqual(RedirectEvent.objects.count(), 1)
        event = RedirectEvent.objects.first()
        self.assertEqual(event.ip, '1.2.3.4')
        self.assertEqual(event.verdict, 'allowed')

    def test_increments_clicks_count(self):
        self.route.refresh_from_db()
        self.assertEqual(self.route.clicks_count, 0)
        self.client.post('/api/edge/events/', {
            'events': [{
                'domain': 'go.example.com',
                'ip': '1.2.3.4',
                'destination': 'https://target.example.com',
            }],
        }, format='json', **self.headers)
        self.route.refresh_from_db()
        self.assertEqual(self.route.clicks_count, 1)

    def test_skips_invalid_events(self):
        res = self.client.post('/api/edge/events/', {
            'events': [
                {'domain': '', 'ip': '1.2.3.4', 'destination': 'x'},
                {'domain': 'go.example.com', 'ip': '', 'destination': 'x'},
                {'domain': 'go.example.com', 'ip': '1.2.3.4', 'destination': 'x'},
            ],
        }, format='json', **self.headers)
        self.assertEqual(res.json()['created'], 1)

    def test_batch_capped_at_500(self):
        events = [
            {'domain': 'go.example.com', 'ip': '1.2.3.4', 'destination': 'x'}
            for _ in range(600)
        ]
        res = self.client.post('/api/edge/events/', {'events': events}, format='json', **self.headers)
        self.assertEqual(res.json()['created'], 500)

    def test_events_must_be_list(self):
        res = self.client.post('/api/edge/events/', {'events': 'not-a-list'}, format='json', **self.headers)
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)


# ---------------------------------------------------------------------------
# Shield Verify with Install Token
# ---------------------------------------------------------------------------

class ShieldVerifyInstallTokenTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='shield_user', password='testpass123')
        self.workspace = Workspace.objects.get(owner=self.user)
        self.domain = DomainRegistry.objects.create(
            workspace=self.workspace, domain='example.com', purpose='protection',
        )
        self.raw_token, self.install_token = InstallToken.create_for_workspace(self.workspace)

    def test_verify_with_api_key(self):
        res = self.client.post('/api/shield/verify/', {
            'api_key': str(self.workspace.tracker_secret),
            'page_url': 'https://example.com/',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn('verdict', res.json())

    def test_verify_with_install_token(self):
        res = self.client.post('/api/shield/verify/', {
            'install_token': self.raw_token,
            'page_url': 'https://example.com/',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn('verdict', res.json())

    def test_verify_invalid_token(self):
        res = self.client.post('/api/shield/verify/', {
            'install_token': 'vc_nonexistent',
            'page_url': 'https://example.com/',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_verify_unregistered_domain_returns_allow(self):
        res = self.client.post('/api/shield/verify/', {
            'api_key': str(self.workspace.tracker_secret),
            'page_url': 'https://unknown.com/',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.json()['verdict'], 'allow')

    def test_verify_missing_both_keys(self):
        res = self.client.post('/api/shield/verify/', {
            'page_url': 'https://example.com/',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)


class ShieldConfigInstallTokenTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='shieldcfg_user', password='testpass123')
        self.workspace = Workspace.objects.get(owner=self.user)
        self.raw_token, self.install_token = InstallToken.create_for_workspace(self.workspace)

    def test_config_with_api_key(self):
        res = self.client.get(f'/api/shield/config/?api_key={self.workspace.tracker_secret}')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn('protectionMode', res.json())

    def test_config_with_install_token(self):
        res = self.client.get(f'/api/shield/config/?install_token={self.raw_token}')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn('protectionMode', res.json())

    def test_config_invalid_token(self):
        res = self.client.get('/api/shield/config/?install_token=vc_bad')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)


# ---------------------------------------------------------------------------
# Test Installation
# ---------------------------------------------------------------------------

class TestInstallationTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='testinst_user', password='testpass123')
        self.client.force_authenticate(user=self.user)
        self.workspace = Workspace.objects.get(owner=self.user)
        self.domain = DomainRegistry.objects.create(
            workspace=self.workspace, domain='example.com',
        )

    def test_requires_domain_id(self):
        res = self.client.post('/api/test-installation/', {}, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_domain_not_found(self):
        res = self.client.post('/api/test-installation/', {
            'domain_id': str(uuid.uuid4()),
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    @patch('urllib.request.urlopen')
    def test_installed(self, mock_urlopen):
        mock_resp = mock_urlopen.return_value.__enter__.return_value
        mock_resp.status = 200
        mock_resp.read.return_value = b'<html><script src="https://cdn.vericlick.site/shield.js"></script></html>'
        res = self.client.post('/api/test-installation/', {
            'domain_id': str(self.domain.id),
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.json()['installed'])
        self.domain.refresh_from_db()
        self.assertTrue(self.domain.script_installed)
        self.assertTrue(self.domain.verified)

    @patch('urllib.request.urlopen')
    def test_not_installed(self, mock_urlopen):
        mock_resp = mock_urlopen.return_value.__enter__.return_value
        mock_resp.status = 200
        mock_resp.read.return_value = b'<html><head></head><body>Hello</body></html>'
        res = self.client.post('/api/test-installation/', {
            'domain_id': str(self.domain.id),
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertFalse(res.json()['installed'])
        self.domain.refresh_from_db()
        self.assertFalse(self.domain.script_installed)

    def test_requires_auth(self):
        self.client.force_authenticate(user=None)
        res = self.client.post('/api/test-installation/', {
            'domain_id': str(self.domain.id),
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)


# ---------------------------------------------------------------------------
# Model Tests: InstallToken, RedirectRoute, EdgeSyncCredential, RedirectEvent
# ---------------------------------------------------------------------------

class InstallTokenModelTests(TestCase):
    def test_create_for_workspace(self):
        user = User.objects.create_user(username='itok_model')
        ws = Workspace.objects.get(owner=user)
        raw, inst = InstallToken.create_for_workspace(ws, label='Test')
        self.assertTrue(raw.startswith('vc_'))
        self.assertEqual(inst.label, 'Test')
        self.assertTrue(inst.is_active)
        self.assertEqual(inst.token_prefix, raw[:12])

    def test_verify_token(self):
        user = User.objects.create_user(username='itok_verify')
        ws = Workspace.objects.get(owner=user)
        raw, inst = InstallToken.create_for_workspace(ws)
        found_ws, found_inst = InstallToken.verify_token(raw)
        self.assertEqual(found_ws.id, ws.id)

    def test_str(self):
        user = User.objects.create_user(username='itok_str')
        ws = Workspace.objects.get(owner=user)
        _, inst = InstallToken.create_for_workspace(ws)
        self.assertIn(inst.token_prefix, str(inst))


class RedirectRouteModelTests(TestCase):
    def test_str(self):
        user = User.objects.create_user(username='rr_str')
        ws = Workspace.objects.get(owner=user)
        d = DomainRegistry.objects.create(workspace=ws, domain='go.com', purpose='redirect')
        route = RedirectRoute.objects.create(
            workspace=ws, domain=d, destination_url='https://target.com',
        )
        self.assertIn('go.com', str(route))
        self.assertIn('target.com', str(route))

    def test_bot_action_choices(self):
        self.assertEqual(len(RedirectRoute.BotAction), 4)

    def test_default_values(self):
        user = User.objects.create_user(username='rr_defaults')
        ws = Workspace.objects.get(owner=user)
        d = DomainRegistry.objects.create(workspace=ws, domain='go.com', purpose='redirect')
        route = RedirectRoute.objects.create(
            workspace=ws, domain=d, destination_url='https://target.com',
        )
        self.assertEqual(route.bot_action, 'honeypot')
        self.assertTrue(route.is_active)
        self.assertEqual(route.clicks_count, 0)


class EdgeSyncCredentialModelTests(TestCase):
    def test_create_and_verify(self):
        user = User.objects.create_user(username='esc_model')
        ws = Workspace.objects.get(owner=user)
        raw, cred = EdgeSyncCredential.create_for_workspace(ws, label='Test')
        self.assertTrue(raw.startswith('ek_'))
        self.assertEqual(cred.key_prefix, raw[:12])
        found_ws, found_cred = EdgeSyncCredential.verify_key(raw)
        self.assertEqual(found_ws.id, ws.id)

    def test_str(self):
        user = User.objects.create_user(username='esc_str')
        ws = Workspace.objects.get(owner=user)
        _, cred = EdgeSyncCredential.create_for_workspace(ws, label='MyNode')
        self.assertIn('MyNode', str(cred))


class DomainRegistryModelTests(TestCase):
    def test_generate_verification_token(self):
        user = User.objects.create_user(username='dr_model')
        ws = Workspace.objects.get(owner=user)
        d = DomainRegistry.objects.create(workspace=ws, domain='test.com')
        token = d.generate_verification_token()
        self.assertEqual(len(token), 32)
        d.refresh_from_db()
        self.assertEqual(d.verification_token, token)


# ---------------------------------------------------------------------------
# Additional Edge Cases
# ---------------------------------------------------------------------------

class EdgeEventsBatchInvalidCredentialTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='ev_badcred', password='pass')
        self.workspace = Workspace.objects.get(owner=self.user)

    def test_invalid_edge_api_key_returns_401(self):
        res = self.client.post('/api/edge/events/', {
            'events': [{'domain': 'x', 'ip': '1.2.3.4', 'destination': 'y'}],
        }, format='json', HTTP_X_EDGE_API_KEY='invalid_key_here')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_missing_edge_api_key_returns_401(self):
        res = self.client.post('/api/edge/events/', {
            'events': [{'domain': 'x', 'ip': '1.2.3.4', 'destination': 'y'}],
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)


class ShieldTelemetryTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='telem_user', password='pass')
        self.workspace = Workspace.objects.get(owner=self.user)
        self.domain = DomainRegistry.objects.create(
            workspace=self.workspace, domain='example.com', purpose='protection',
        )
        self.raw_token, self.install_token = InstallToken.create_for_workspace(self.workspace)

    def test_telemetry_with_api_key(self):
        res = self.client.post('/api/shield/telemetry/', {
            'api_key': str(self.workspace.tracker_secret),
            'page_url': 'https://example.com/',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.json()['status'], 'ok')

    def test_telemetry_with_install_token(self):
        res = self.client.post('/api/shield/telemetry/', {
            'install_token': self.raw_token,
            'page_url': 'https://example.com/',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.json()['status'], 'ok')

    def test_telemetry_invalid_token(self):
        res = self.client.post('/api/shield/telemetry/', {
            'install_token': 'vc_nonexistent',
            'page_url': 'https://example.com/',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_telemetry_missing_both_keys(self):
        res = self.client.post('/api/shield/telemetry/', {
            'page_url': 'https://example.com/',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_telemetry_unregistered_domain_silently_ignored(self):
        res = self.client.post('/api/shield/telemetry/', {
            'api_key': str(self.workspace.tracker_secret),
            'page_url': 'https://unknown.com/',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.json()['status'], 'ok')

    def test_telemetry_suspended_workspace_returns_ok(self):
        # plan_status is derived: a plan whose period AND grace window have both
        # lapsed reads as suspended.
        self.workspace.plan = Plan.objects.get(code='plus')
        self.workspace.plan_expires_at = timezone.now() - timedelta(days=PLAN_GRACE_DAYS + 1)
        self.workspace.save(update_fields=['plan', 'plan_expires_at'])
        self.assertEqual(self.workspace.plan_status, 'suspended')
        res = self.client.post('/api/shield/telemetry/', {
            'api_key': str(self.workspace.tracker_secret),
            'page_url': 'https://example.com/',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)


class InstallTokenExpiredTests(APITestCase):
    def test_verify_expired_token(self):
        user = User.objects.create_user(username='tok_exp', password='pass')
        ws = Workspace.objects.get(owner=user)
        raw_token, token = InstallToken.create_for_workspace(ws)
        token.expires_at = timezone.now() - timedelta(hours=1)
        token.save(update_fields=['expires_at'])
        found_ws, found_token = InstallToken.verify_token(raw_token)
        self.assertIsNone(found_ws)
        self.assertIsNone(found_token)


class EdgeEventsBatchClickIncrementTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='ev_f', password='pass')
        self.workspace = Workspace.objects.get(owner=self.user)
        self.raw_key, self.cred = EdgeSyncCredential.create_for_workspace(self.workspace)
        self.domain = DomainRegistry.objects.create(
            workspace=self.workspace, domain='f.example.com',
            purpose='redirect', verified=True,
        )
        self.route = RedirectRoute.objects.create(
            workspace=self.workspace, domain=self.domain,
            destination_url='https://target.example.com',
        )
        self.headers = {'HTTP_X_EDGE_API_KEY': self.raw_key}

    def test_click_count_uses_F_expression(self):
        """Verify F() expression works for atomic click increment."""
        self.route.refresh_from_db()
        self.assertEqual(self.route.clicks_count, 0)
        self.client.post('/api/edge/events/', {
            'events': [{
                'domain': 'f.example.com',
                'ip': '1.2.3.4',
                'destination': 'https://target.example.com',
            }],
        }, format='json', **self.headers)
        self.route.refresh_from_db()
        self.assertEqual(self.route.clicks_count, 1)
        # Second event should increment to 2, not overwrite
        self.client.post('/api/edge/events/', {
            'events': [{
                'domain': 'f.example.com',
                'ip': '5.6.7.8',
                'destination': 'https://target.example.com',
            }],
        }, format='json', **self.headers)
        self.route.refresh_from_db()
        self.assertEqual(self.route.clicks_count, 2)


class WorkspaceShieldConfigTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='wsc_user', password='pass')
        self.client.force_authenticate(user=self.user)
        self.workspace = Workspace.objects.get(owner=self.user)

    def test_get_creates_default_config(self):
        res = self.client.get('/api/workspace/shield-config/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.json()['protectionMode'], 'balanced')

    def test_get_returns_existing_config(self):
        ShieldConfig.objects.create(
            workspace=self.workspace, protection_mode='strict', bot_action='block',
        )
        res = self.client.get('/api/workspace/shield-config/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.json()['protectionMode'], 'strict')

    def test_patch_updates_config(self):
        res = self.client.patch('/api/workspace/shield-config/', {
            'protection_mode': 'monitor',
            'bot_action': 'honeypot',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.json()['protectionMode'], 'monitor')
        self.assertEqual(res.json()['botAction'], 'honeypot')

    def test_requires_authentication(self):
        self.client.force_authenticate(user=None)
        res = self.client.get('/api/workspace/shield-config/')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_no_tracker_secret_leak(self):
        """The response must not contain tracker_secret."""
        res = self.client.get('/api/workspace/shield-config/')
        body = res.json()
        self.assertNotIn('tracker_secret', body)
        self.assertNotIn('trackerSecret', body)
