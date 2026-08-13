import hashlib
import hmac
import json
import time
import uuid
from datetime import timedelta
from unittest.mock import patch
from django.test import TestCase, override_settings
from django.contrib.auth.models import User
from django.contrib import admin
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APITestCase, APIClient
from rest_framework import status
from decimal import Decimal
from .models import (
    Workspace, DomainRegistry, TrackingLink, ClickLog, IPRule, TrackerEvent,
    Plan, DiscountCode, SiteConfig, CheckoutIntent, BillingEvent,
)
from .utils import snake_to_camel, camel_to_snake, transform_keys
from . import services as _services


# Deterministic diagnosis report used to keep flow tests off the real network.
# Tests that exercise the DNS diagnosis engine itself use their own mocks.
FAKE_DIAGNOSIS = {
    'generated_at': '2026-01-01T00:00:00Z',
    'tracking_host': 't.example.com',
    'expected_ips': ['1.2.3.4'],
    'verified': False,
    'points_to_us': False,
    'apex_resolves': True,
    'ready': False,
    'findings': [],
}


_REAL_DIAGNOSE_DOMAIN = _services.diagnose_domain


def _fake_diagnose(domain):
    # No-network stand-in for diagnose_domain used by every flow test: health
    # checks are a side effect of create/recheck/verify/scan, and the tests
    # only care that a report gets persisted, not what DNS really says. The
    # real engine is restored inside DomainDiagnosisTests.
    is_obj = hasattr(domain, 'domain')
    name = domain.domain if is_obj else str(domain)
    report = dict(FAKE_DIAGNOSIS)
    report.update({
        'tracking_host': f't.{name}',
        'verified': bool(getattr(domain, 'verified', False)),
        'points_to_us': bool(getattr(domain, 'points_to_server', False)),
        'apex_resolves': bool(getattr(domain, 'health_status', DomainRegistry.HealthStatus.HEALTHY) == DomainRegistry.HealthStatus.HEALTHY),
        'ready': bool(getattr(domain, 'verified', False) and getattr(domain, 'points_to_server', False)),
    })
    return report


_services.diagnose_domain = _fake_diagnose


#Utils 

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


#Models

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
        # Save again to trigger signal
        user.save()
        count = Workspace.objects.filter(owner=user).count()
        self.assertEqual(count, 1)


class DomainRegistryModelTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='domain_user')
        self.workspace = Workspace.objects.get(owner=self.user)

    def test_create_domain(self):
        domain = DomainRegistry.objects.create(
            workspace=self.workspace,
            domain='example.com',
        )
        self.assertIsInstance(domain.id, uuid.UUID)
        self.assertEqual(domain.health_status, DomainRegistry.HealthStatus.HEALTHY)
        self.assertIsNone(domain.last_checked)
        self.assertEqual(str(domain), 'example.com')

    def test_domain_ordering(self):
        DomainRegistry.objects.create(workspace=self.workspace, domain='zeta.com')
        DomainRegistry.objects.create(workspace=self.workspace, domain='alpha.com')
        qs = DomainRegistry.objects.all()
        self.assertEqual(qs[0].domain, 'alpha.com')
        self.assertEqual(qs[1].domain, 'zeta.com')


class TrackingLinkModelTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='link_user')
        self.workspace = Workspace.objects.get(owner=self.user)
        self.domain = DomainRegistry.objects.create(
            workspace=self.workspace, domain='track.example.com'
        )

    def test_create_link(self):
        link = TrackingLink.objects.create(
            workspace=self.workspace,
            domain=self.domain,
            slug='test-slug',
            destination_url='https://example.com/landing',
        )
        self.assertIsInstance(link.id, uuid.UUID)
        self.assertEqual(link.status, TrackingLink.Status.ACTIVE)
        self.assertEqual(link.total_clicks, 0)
        self.assertEqual(link.bot_clicks, 0)
        self.assertIn('test-slug', str(link))

    def test_link_without_domain(self):
        link = TrackingLink.objects.create(
            workspace=self.workspace,
            domain=None,
            slug='no-domain',
            destination_url='https://example.com',
        )
        self.assertIsNone(link.domain)

    def test_link_ordering_newest_first(self):
        l1 = TrackingLink.objects.create(
            workspace=self.workspace, slug='first', destination_url='https://a.com',
        )
        l2 = TrackingLink.objects.create(
            workspace=self.workspace, slug='second', destination_url='https://b.com',
        )
        qs = TrackingLink.objects.all()
        self.assertEqual(qs[0], l2)
        self.assertEqual(qs[1], l1)

    def test_domain_delete_sets_null(self):
        link = TrackingLink.objects.create(
            workspace=self.workspace,
            domain=self.domain,
            slug='domain-will-delete',
            destination_url='https://example.com',
        )
        self.domain.delete()
        link.refresh_from_db()
        self.assertIsNone(link.domain)


class ClickLogModelTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='click_user')
        self.workspace = Workspace.objects.get(owner=self.user)
        self.link = TrackingLink.objects.create(
            workspace=self.workspace,
            slug='click-test',
            destination_url='https://example.com',
        )

    def test_create_click(self):
        click = ClickLog.objects.create(
            link=self.link,
            ip='192.168.1.1',
            is_bot=False,
        )
        self.assertIsInstance(click.id, uuid.UUID)
        self.assertEqual(click.country, '')
        self.assertEqual(click.device, '')
        self.assertEqual(str(click), '192.168.1.1 -> click-test (human)')

    def test_bot_click(self):
        click = ClickLog.objects.create(
            link=self.link,
            ip='10.0.0.1',
            is_bot=True,
            reason='known_bot',
        )
        self.assertTrue(click.is_bot)
        self.assertIn('bot', str(click))


#  API Endpoints 

class HealthEndpointTests(APITestCase):
    def test_health_returns_ok(self):
        res = self.client.get('/api/health/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        body = res.json()
        self.assertEqual(body['status'], 'ok')
        self.assertEqual(body['version'], '1.0.0')

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
        # The signup flow logs the just-registered user in via their email;
        # login must accept it (SimpleJWT is username-only by default).
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
        # Same account, wrong password — the reason must be the password, not a
        # misleading "no active account found" (the case right after a reset).
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
        domain = DomainRegistry.objects.create(workspace=self.workspace, domain='del.example.com')
        link = TrackingLink.objects.create(
            workspace=self.workspace, domain=domain,
            slug='del-link', destination_url='https://example.com',
        )
        IPRule.objects.create(workspace=self.workspace)
        res = self.client.post('/api/auth/delete-account/',
                               {'confirmation': '  delete '}, format='json')
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(User.objects.filter(pk=self.user.pk).exists())
        self.assertFalse(Workspace.objects.filter(pk=self.workspace.pk).exists())
        self.assertFalse(DomainRegistry.objects.filter(pk=domain.pk).exists())
        self.assertFalse(TrackingLink.objects.filter(pk=link.pk).exists())

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
        self.assertEqual(body['totalClicks24h'], 0)
        self.assertEqual(body['botTrafficBlocked'], 0)
        self.assertEqual(body['botTrafficPercentage'], 0)
        self.assertEqual(body['activeLinks'], 0)
        self.assertIsNone(body['clicksTrend'])

    def test_stats_trend_is_computed_from_previous_24h(self):
        link = TrackingLink.objects.create(
            workspace=self.workspace,
            slug='trend-link', destination_url='https://example.com',
        )
        now = timezone.now()
        now_click_1 = ClickLog.objects.create(link=link, ip='1.1.1.1', is_bot=False)
        now_click_2 = ClickLog.objects.create(link=link, ip='3.3.3.3', is_bot=False)
        prev_click = ClickLog.objects.create(link=link, ip='2.2.2.2', is_bot=False)
        ClickLog.objects.filter(pk=now_click_1.pk).update(created_at=now)
        ClickLog.objects.filter(pk=now_click_2.pk).update(created_at=now - timedelta(hours=2))
        ClickLog.objects.filter(pk=prev_click.pk).update(created_at=now - timedelta(hours=30))
        res = self.client.get('/api/dashboard/stats/')
        body = res.json()
        self.assertIsNotNone(body['clicksTrend'])
        self.assertAlmostEqual(body['clicksTrend'], 100.0, places=1)

    def test_stats_with_data(self):
        domain = DomainRegistry.objects.create(
            workspace=self.workspace, domain='stats.example.com',
            health_status=DomainRegistry.HealthStatus.DEGRADED,
        )
        link = TrackingLink.objects.create(
            workspace=self.workspace, domain=domain,
            slug='stats-link', destination_url='https://example.com',
        )
        ClickLog.objects.create(link=link, ip='1.1.1.1', is_bot=True)
        ClickLog.objects.create(link=link, ip='2.2.2.2', is_bot=False)
        res = self.client.get('/api/dashboard/stats/')
        body = res.json()
        self.assertEqual(body['totalClicks24h'], 2)
        self.assertEqual(body['botTrafficBlocked'], 1)
        self.assertAlmostEqual(body['botTrafficPercentage'], 50.0)
        self.assertEqual(body['domainsDegraded'], 1)

    def test_traffic_defaults_to_7d(self):
        res = self.client.get('/api/dashboard/traffic/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIsInstance(res.json(), list)

    def test_traffic_range_param(self):
        for r in ['7d', '30d', '90d']:
            res = self.client.get(f'/api/dashboard/traffic/?range={r}')
            self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_traffic_returns_aggregated_data(self):
        link = TrackingLink.objects.create(
            workspace=self.workspace,
            slug='traffic-test', destination_url='https://example.com',
        )
        now = timezone.now()
        ClickLog.objects.create(link=link, ip='1.1.1.1', is_bot=False, created_at=now)
        ClickLog.objects.create(link=link, ip='2.2.2.2', is_bot=True, created_at=now)
        res = self.client.get('/api/dashboard/traffic/?range=7d')
        body = res.json()
        self.assertGreaterEqual(len(body), 1)
        entry = body[0]
        self.assertIn('date', entry)
        self.assertIn('human', entry)
        self.assertIn('bot', entry)

    def test_activity_returns_recent_clicks(self):
        link = TrackingLink.objects.create(
            workspace=self.workspace,
            slug='activity-test', destination_url='https://example.com',
        )
        ClickLog.objects.create(link=link, ip='3.3.3.3', is_bot=False)
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


class LinksEndpointTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='linksuser', password='testpass123')
        self.client.force_authenticate(user=self.user)
        self.workspace = Workspace.objects.get(owner=self.user)

    def test_list_links_empty(self):
        res = self.client.get('/api/links/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.json()['results'], [])

    def test_create_link(self):
        data = {
            'slug': 'my-link',
            'destinationUrl': 'https://example.com',
            'status': 'active',
        }
        res = self.client.post('/api/links/', data, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        body = res.json()
        self.assertEqual(body['slug'], 'my-link')
        self.assertEqual(body['destinationUrl'], 'https://example.com')
        self.assertEqual(body['status'], 'active')
        self.assertIsNone(body['domain'])
        self.assertIsNone(body['domainHealth'])
        self.assertEqual(body['totalClicks'], 0)
        self.assertEqual(body['botClicks'], 0)
        self.assertEqual(body['humanClicks'], 0)

    def test_create_link_with_domain(self):
        domain = DomainRegistry.objects.create(
            workspace=self.workspace, domain='link.example.com'
        )
        data = {
            'slug': 'with-domain',
            'destinationUrl': 'https://example.com',
            'domain': 'link.example.com',
        }
        res = self.client.post('/api/links/', data, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        body = res.json()
        self.assertIsNotNone(body['domain'])
        self.assertEqual(body['domainHealth'], 'healthy')

    def test_create_link_auto_assigns_workspace(self):
        data = {
            'slug': 'auto-ws',
            'destinationUrl': 'https://example.com',
        }
        res = self.client.post('/api/links/', data, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        link = TrackingLink.objects.get(slug='auto-ws')
        self.assertEqual(link.workspace, self.workspace)

    def test_list_only_user_links(self):
        other_user = User.objects.create_user(username='other', password='testpass123')
        other_ws = Workspace.objects.get(owner=other_user)
        TrackingLink.objects.create(
            workspace=other_ws, slug='other-link', destination_url='https://other.com',
        )
        TrackingLink.objects.create(
            workspace=self.workspace, slug='my-link', destination_url='https://mine.com',
        )
        res = self.client.get('/api/links/')
        results = res.json()['results']
        slugs = [l['slug'] for l in results]
        self.assertIn('my-link', slugs)
        self.assertNotIn('other-link', slugs)

    def test_search_links(self):
        TrackingLink.objects.create(
            workspace=self.workspace, slug='findme', destination_url='https://find.com',
        )
        TrackingLink.objects.create(
            workspace=self.workspace, slug='other', destination_url='https://other.com',
        )
        res = self.client.get('/api/links/?search=find')
        results = res.json()['results']
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]['slug'], 'findme')

    def test_get_single_link(self):
        link = TrackingLink.objects.create(
            workspace=self.workspace, slug='get-me', destination_url='https://get.com',
        )
        res = self.client.get(f'/api/links/{link.id}/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.json()['slug'], 'get-me')

    def test_update_link(self):
        link = TrackingLink.objects.create(
            workspace=self.workspace, slug='update-me', destination_url='https://old.com',
        )
        data = {'destinationUrl': 'https://new.com', 'status': 'paused'}
        res = self.client.patch(f'/api/links/{link.id}/', data, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        link.refresh_from_db()
        self.assertEqual(link.destination_url, 'https://new.com')
        self.assertEqual(link.status, 'paused')

    def test_delete_link(self):
        link = TrackingLink.objects.create(
            workspace=self.workspace, slug='delete-me', destination_url='https://del.com',
        )
        res = self.client.delete(f'/api/links/{link.id}/')
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)
        # Soft delete: the row stays so it keeps counting toward plan limits.
        link.refresh_from_db()
        self.assertIsNotNone(link.removed_at)
        self.assertFalse(
            TrackingLink.objects.filter(id=link.id, removed_at__isnull=True).exists()
        )

    def test_pagination_defaults(self):
        for i in range(25):
            TrackingLink.objects.create(
                workspace=self.workspace, slug=f'page-link-{i}',
                destination_url=f'https://example{i}.com',
            )
        res = self.client.get('/api/links/')
        body = res.json()
        self.assertEqual(len(body['results']), 20)
        self.assertIsNotNone(body['next'])
        self.assertIsNone(body['previous'])
        self.assertEqual(body['count'], 25)

    def test_unauthenticated_access(self):
        self.client.force_authenticate(user=None)
        res = self.client.get('/api/links/')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_tracking_url_fallback_to_redirect_route(self):
        link = TrackingLink.objects.create(
            workspace=self.workspace, slug='track-url', destination_url='https://example.com',
        )
        res = self.client.get(f'/api/links/{link.id}/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.json()['trackingUrl'], 'http://testserver/r/track-url/')

    def test_tracking_url_uses_custom_domain(self):
        domain = DomainRegistry.objects.create(
            workspace=self.workspace, domain='link.example.com',
            verified=True, points_to_server=True,
        )
        link = TrackingLink.objects.create(
            workspace=self.workspace, domain=domain,
            slug='dom-url', destination_url='https://example.com',
        )
        res = self.client.get(f'/api/links/{link.id}/')
        self.assertEqual(res.json()['trackingUrl'], 'https://link.example.com/r/dom-url/')

    def test_tracking_url_uses_custom_domain_only_when_verified(self):
        domain = DomainRegistry.objects.create(
            workspace=self.workspace, domain='link.example.com',
            verified=False, points_to_server=True,
        )
        link = TrackingLink.objects.create(
            workspace=self.workspace, domain=domain,
            slug='unverified-url', destination_url='https://example.com',
        )
        res = self.client.get(f'/api/links/{link.id}/')
        self.assertEqual(res.json()['trackingUrl'], 'http://testserver/r/unverified-url/')

    def test_tracking_url_uses_custom_domain_only_when_pointing_at_server(self):
        domain = DomainRegistry.objects.create(
            workspace=self.workspace, domain='link.example.com',
            verified=True, points_to_server=False,
        )
        link = TrackingLink.objects.create(
            workspace=self.workspace, domain=domain,
            slug='not-pointing-url', destination_url='https://example.com',
        )
        res = self.client.get(f'/api/links/{link.id}/')
        self.assertEqual(res.json()['trackingUrl'], 'http://testserver/r/not-pointing-url/')

    def test_tracking_url_falls_back_when_domain_is_not_healthy(self):
        domain = DomainRegistry.objects.create(
            workspace=self.workspace,
            domain='stale.example.com',
            health_status=DomainRegistry.HealthStatus.DEGRADED,
        )
        link = TrackingLink.objects.create(
            workspace=self.workspace, domain=domain,
            slug='stale-url', destination_url='https://example.com',
        )
        res = self.client.get(f'/api/links/{link.id}/')
        self.assertEqual(res.json()['trackingUrl'], 'http://testserver/r/stale-url/')


class DomainsEndpointTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='domainsuser', password='testpass123')
        self.client.force_authenticate(user=self.user)
        self.workspace = Workspace.objects.get(owner=self.user)

    def test_list_domains_empty(self):
        res = self.client.get('/api/domains/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.json()['results'], [])

    def test_create_domain(self):
        data = {'domain': 'tracking.example.com'}
        with patch('vericlick.services.diagnose_domain', return_value=FAKE_DIAGNOSIS):
            res = self.client.post('/api/domains/', data, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        body = res.json()
        self.assertEqual(body['domain'], 'tracking.example.com')
        self.assertIn(body['healthStatus'], ['healthy', 'degraded'])
        self.assertIsNotNone(body.get('lastChecked'))
        self.assertEqual(body['linksCount'], 0)
        self.assertIn('id', body)

    def test_create_domain_duplicate_fails(self):
        DomainRegistry.objects.create(
            workspace=self.workspace, domain='dup.example.com',
        )
        data = {'domain': 'dup.example.com'}
        res = self.client.post('/api/domains/', data, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_list_only_user_domains(self):
        other_user = User.objects.create_user(username='otherdom', password='testpass123')
        other_ws = Workspace.objects.get(owner=other_user)
        DomainRegistry.objects.create(workspace=other_ws, domain='other.com')
        DomainRegistry.objects.create(workspace=self.workspace, domain='mine.com')
        res = self.client.get('/api/domains/')
        domains = [d['domain'] for d in res.json()['results']]
        self.assertIn('mine.com', domains)
        self.assertNotIn('other.com', domains)

    def test_get_single_domain(self):
        domain = DomainRegistry.objects.create(
            workspace=self.workspace, domain='single.example.com',
        )
        res = self.client.get(f'/api/domains/{domain.id}/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.json()['domain'], 'single.example.com')

    def test_update_domain(self):
        domain = DomainRegistry.objects.create(
            workspace=self.workspace, domain='old.example.com',
        )
        res = self.client.patch(f'/api/domains/{domain.id}/', {'domain': 'new.example.com'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        domain.refresh_from_db()
        self.assertEqual(domain.domain, 'new.example.com')

    def test_delete_domain(self):
        domain = DomainRegistry.objects.create(
            workspace=self.workspace, domain='delete.example.com',
        )
        res = self.client.delete(f'/api/domains/{domain.id}/')
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)
        # Soft delete: the row stays so a verified domain keeps counting toward
        # the plan limit until the period ends.
        domain.refresh_from_db()
        self.assertIsNotNone(domain.removed_at)
        self.assertFalse(
            DomainRegistry.objects.filter(id=domain.id, removed_at__isnull=True).exists()
        )

    def test_delete_domain_removes_its_links(self):
        domain = DomainRegistry.objects.create(
            workspace=self.workspace, domain='cascade.example.com',
        )
        link = TrackingLink.objects.create(
            workspace=self.workspace, domain=domain,
            slug='cascade-link', destination_url='https://example.com',
        )
        ClickLog.objects.create(link=link, ip='9.9.9.9')
        res = self.client.delete(f'/api/domains/{domain.id}/')
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)
        domain.refresh_from_db()
        link.refresh_from_db()
        self.assertIsNotNone(domain.removed_at)
        self.assertIsNotNone(link.removed_at)
        # Click logs are retained for the soft-deleted link.
        self.assertTrue(ClickLog.objects.filter(link=link).exists())
        # Removed links no longer appear in the API list.
        self.assertFalse(
            TrackingLink.objects.filter(id=link.id, removed_at__isnull=True).exists()
        )

    def test_recheck_updates_last_checked(self):
        domain = DomainRegistry.objects.create(
            workspace=self.workspace, domain='recheck.example.com',
        )
        self.assertIsNone(domain.last_checked)
        with patch('vericlick.services.diagnose_domain', return_value=FAKE_DIAGNOSIS):
            res = self.client.post(f'/api/domains/{domain.id}/recheck/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        body = res.json()
        self.assertEqual(body['status'], 'ok')
        self.assertIsNotNone(body['lastChecked'])
        self.assertIn(body['pointsToServer'], [True, False])
        domain.refresh_from_db()
        self.assertIsNotNone(domain.last_checked)

    def test_ready_is_true_only_when_verified_and_pointing_at_server(self):
        domain = DomainRegistry.objects.create(
            workspace=self.workspace,
            domain='ready.example.com',
            verified=True,
            points_to_server=True,
            health_status=DomainRegistry.HealthStatus.HEALTHY,
        )
        res = self.client.get(f'/api/domains/{domain.id}/')
        self.assertTrue(res.json()['ready'])

        domain2 = DomainRegistry.objects.create(
            workspace=self.workspace,
            domain='unready.example.com',
            verified=True,
            points_to_server=False,
            health_status=DomainRegistry.HealthStatus.HEALTHY,
        )
        res2 = self.client.get(f'/api/domains/{domain2.id}/')
        self.assertFalse(res2.json()['ready'])
        self.assertFalse(res2.json()['pointsToServer'])

    @override_settings(PUBLIC_TRACKING_BASE_URL='https://links.example.org')
    def test_dns_setup_guidance_returned(self):
        domain = DomainRegistry.objects.create(
            workspace=self.workspace, domain='track.example.com',
        )
        res = self.client.get(f'/api/domains/{domain.id}/')
        body = res.json()
        self.assertIn('dnsSetup', body)
        self.assertIn('label', body['dnsSetup'])
        self.assertIn('host', body['dnsSetup'])
        self.assertIn('target', body['dnsSetup'])
        # Subdomain domains get the subdomain label as the record Name/Host.
        self.assertEqual(body['dnsSetup']['host'], 'track')
        # Guidance is always the single CNAME flavour.
        self.assertEqual(body['dnsSetup']['label'], 'CNAME')
        self.assertEqual(body['dnsSetup']['target'], 'links.example.org')

    def test_dns_setup_apex_steers_to_subdomain(self):
        domain = DomainRegistry.objects.create(
            workspace=self.workspace, domain='example.com',
        )
        body = res = self.client.get(f'/api/domains/{domain.id}/').json()
        self.assertEqual(body['dnsSetup']['label'], 'CNAME')
        self.assertEqual(body['dnsSetup']['host'], 't')
        self.assertIn('t.example.com', body['dnsSetup']['note'])
        self.assertEqual(body['dnsSetup']['trackingHost'], 't.example.com')

    def test_dns_setup_tracking_host_for_subdomain(self):
        domain = DomainRegistry.objects.create(
            workspace=self.workspace, domain='track.example.com',
        )
        body = self.client.get(f'/api/domains/{domain.id}/').json()
        self.assertEqual(body['dnsSetup']['trackingHost'], 'track.example.com')

    def test_tracking_host_maps_apex_to_t_subdomain(self):
        from vericlick.models import tracking_host
        for apex in ['donlabs.site', 'example.co', 'example.com']:
            self.assertEqual(tracking_host(apex), f't.{apex}')
        self.assertEqual(tracking_host('track.example.com'), 'track.example.com')
        self.assertEqual(tracking_host('t.sub.example.com'), 't.sub.example.com')

    def test_dns_setup_note_returned_for_apex(self):
        domain = DomainRegistry.objects.create(
            workspace=self.workspace, domain='example.com',
        )
        res = self.client.get(f'/api/domains/{domain.id}/')
        self.assertIn('note', res.json()['dnsSetup'])
        self.assertIn('subdomain', res.json()['dnsSetup']['note'].lower())

    def test_recheck_not_found(self):
        res = self.client.post(f'/api/domains/{uuid.uuid4()}/recheck/')
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_links_count_reflects_related_links(self):
        domain = DomainRegistry.objects.create(
            workspace=self.workspace, domain='count.example.com',
        )
        TrackingLink.objects.create(
            workspace=self.workspace, domain=domain,
            slug='count-link', destination_url='https://example.com',
        )
        res = self.client.get(f'/api/domains/{domain.id}/')
        self.assertEqual(res.json()['linksCount'], 1)

    def test_unauthenticated_access(self):
        self.client.force_authenticate(user=None)
        res = self.client.get('/api/domains/')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)


class DomainVerificationTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='verify_user', password='testpass123')
        self.client.force_authenticate(user=self.user)
        self.workspace = Workspace.objects.get(owner=self.user)
        self.domain = DomainRegistry.objects.create(
            workspace=self.workspace, domain='verify.example.com',
        )

    def test_domain_starts_unverified(self):
        self.assertFalse(self.domain.verified)
        self.assertIsNotNone(self.domain.verification_token)

    def test_verification_record_value(self):
        self.assertEqual(
            self.domain.verification_record,
            f'vericlick-verify={self.domain.verification_token}',
        )

    def test_health_check_does_not_mark_verified(self):
        with patch('vericlick.services.diagnose_domain', return_value=FAKE_DIAGNOSIS):
            self.domain.run_health_check()
        self.domain.refresh_from_db()
        self.assertFalse(self.domain.verified)
        self.assertIsNotNone(self.domain.last_checked)

    def test_serializer_exposes_verification_record(self):
        res = self.client.get(f'/api/domains/{self.domain.id}/')
        body = res.json()
        self.assertEqual(
            body['verificationRecord'],
            f'vericlick-verify={self.domain.verification_token}',
        )
        self.assertIn('verificationToken', body)

    @patch('vericlick.views.verify_domain_ownership', return_value=(True, ''))
    def test_verify_success_marks_verified(self, mock_verify):
        with patch('vericlick.services.diagnose_domain', return_value=FAKE_DIAGNOSIS):
            res = self.client.post(f'/api/domains/{self.domain.id}/verify/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        body = res.json()
        self.assertTrue(body['verified'])
        self.domain.refresh_from_db()
        self.assertTrue(self.domain.verified)
        mock_verify.assert_called_once_with(self.domain)

    @patch('vericlick.views.verify_domain_ownership', return_value=(False, 'Not found yet'))
    def test_verify_failure_returns_400(self, mock_verify):
        with patch('vericlick.services.diagnose_domain', return_value=FAKE_DIAGNOSIS):
            res = self.client.post(f'/api/domains/{self.domain.id}/verify/')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.domain.refresh_from_db()
        self.assertFalse(self.domain.verified)

    def test_verify_cross_workspace_rejected(self):
        other_user = User.objects.create_user(username='other_verify', password='testpass123')
        other_ws = Workspace.objects.get(owner=other_user)
        other_domain = DomainRegistry.objects.create(
            workspace=other_ws, domain='other.example.com',
        )
        res = self.client.post(f'/api/domains/{other_domain.id}/verify/')
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    @patch('vericlick.views.verify_domain_ownership', return_value=(True, ''))
    def test_verify_requires_auth(self, mock_verify):
        self.client.force_authenticate(user=None)
        res = self.client.post(f'/api/domains/{self.domain.id}/verify/')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)
        mock_verify.assert_not_called()


class DomainDiagnosisTests(APITestCase):
    # Tests for the DNS diagnosis engine and the relaxed "ready" semantics:
    # a domain counts as ready once ownership is proven AND its tracking host
    # points at this server — the apex resolving is a warning, not a failure.

    def setUp(self):
        # Restore the real DNS diagnosis engine for this class (the module-level
        # stand-in is only for flow tests). addCleanup puts the stand-in back so
        # later test classes stay off the network.
        _services.diagnose_domain = _REAL_DIAGNOSE_DOMAIN
        self.addCleanup(setattr, _services, 'diagnose_domain', _fake_diagnose)
        self.user = User.objects.create_user(username='diag_user')
        self.client.force_authenticate(user=self.user)
        self.workspace = Workspace.objects.get(owner=self.user)
        self.domain = DomainRegistry.objects.create(
            workspace=self.workspace, domain='example.com',
        )

    @staticmethod
    def _ns_answer():
        class Target:
            @staticmethod
            def to_text():
                return 'ns1.namecheap.com.'
        class Ans:
            target = Target()
        return [Ans()]

    @staticmethod
    def _txt_answer(value):
        class Rdata:
            def __init__(self, v):
                self._v = v
            def to_text(self):
                return f'"{self._v}"'
        return [Rdata(value)]

    @staticmethod
    def _cname_answer():
        class Target:
            @staticmethod
            def to_text():
                return 'vendora.page.'
        class Ans:
            target = Target()
        return [Ans()]

    def _diagnose(self, apex_ips, tracking_ips, txt_ok, expected_ips):
        import dns.resolver

        def fake_resolve(qname, rtype, lifetime=None):
            if rtype == 'NS':
                return self._ns_answer()
            if rtype == 'CNAME':
                return self._cname_answer()
            if rtype == 'TXT':
                value = self.domain.verification_record if txt_ok else 'unrelated-value'
                return self._txt_answer(value)
            raise Exception(f'unexpected record type {rtype}')

        with patch('vericlick.models._target_addresses', return_value=set(expected_ips)), \
                patch('vericlick.models._resolve_addresses',
                      side_effect=lambda host: set(tracking_ips) if host == 't.example.com' else set(apex_ips)), \
                patch('dns.resolver.resolve', side_effect=fake_resolve):
            from vericlick.services import diagnose_domain
            return diagnose_domain(self.domain)

    def test_apex_with_no_a_record_is_warning_not_failure(self):
        # The customer scenario: root domain has no A record yet, but the TXT
        # is verified and t.example.com points at us. Links work, so "ready".
        report = self._diagnose(apex_ips=[], tracking_ips=['1.2.3.4'], txt_ok=True, expected_ips=['1.2.3.4'])
        self.assertTrue(report['ready'])
        self.assertTrue(report['points_to_us'])
        self.assertFalse(report['apex_resolves'])
        levels = {f['key']: f['level'] for f in report['findings']}
        self.assertEqual(levels['apex'], 'warn')
        self.assertEqual(levels['tracking_host'], 'ok')
        self.assertEqual(levels['txt'], 'ok')

    def test_pointing_elsewhere_reported_with_fix(self):
        report = self._diagnose(apex_ips=['9.9.9.9'], tracking_ips=['9.9.9.9'], txt_ok=True, expected_ips=['1.2.3.4'])
        self.assertFalse(report['ready'])
        self.assertFalse(report['points_to_us'])
        th = next(f for f in report['findings'] if f['key'] == 'tracking_host')
        self.assertEqual(th['level'], 'error')
        self.assertIn('CNAME', th['fix'])
        self.assertIn('t', th['fix'])

    def test_missing_txt_means_not_ready(self):
        report = self._diagnose(apex_ips=['1.2.3.4'], tracking_ips=['1.2.3.4'], txt_ok=False, expected_ips=['1.2.3.4'])
        self.assertFalse(report['ready'])
        txt = next(f for f in report['findings'] if f['key'] == 'txt')
        self.assertEqual(txt['level'], 'error')

    def test_run_health_check_persists_report(self):
        fake = {
            'generated_at': '2026-01-01T00:00:00Z', 'tracking_host': 't.example.com',
            'expected_ips': ['1.2.3.4'], 'verified': True, 'points_to_us': True,
            'apex_resolves': False, 'ready': True, 'findings': [],
        }
        with patch('vericlick.services.diagnose_domain', return_value=fake):
            self.domain.run_health_check()
        self.domain.refresh_from_db()
        self.assertEqual(self.domain.health_detail, fake)
        self.assertTrue(self.domain.points_to_server)
        self.assertEqual(self.domain.health_status, DomainRegistry.HealthStatus.DEGRADED)
        self.assertIsNotNone(self.domain.last_checked)

    def test_ready_true_when_pointing_even_if_apex_degraded(self):
        domain = DomainRegistry.objects.create(
            workspace=self.workspace,
            domain='ready.example.com',
            verified=True,
            points_to_server=True,
            health_status=DomainRegistry.HealthStatus.DEGRADED,
        )
        res = self.client.get(f'/api/domains/{domain.id}/')
        body = res.json()
        self.assertTrue(body['ready'])
        self.assertIn('healthDetail', body)

    def test_tracking_url_uses_custom_domain_when_apex_degraded_but_pointing(self):
        domain = DomainRegistry.objects.create(
            workspace=self.workspace,
            domain='links.example.com',
            verified=True,
            points_to_server=True,
            health_status=DomainRegistry.HealthStatus.DEGRADED,
        )
        link = TrackingLink.objects.create(
            workspace=self.workspace, domain=domain,
            slug='serves-on-brand', destination_url='https://example.com',
        )
        res = self.client.get(f'/api/links/{link.id}/')
        self.assertEqual(
            res.json()['trackingUrl'],
            'https://links.example.com/r/serves-on-brand/',
        )
        self.assertTrue(res.json()['trackingDomainReady'])


# On-demand TLS gate (Caddy ask endpoint)

class TlsAllowedTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='tls_user')
        self.workspace = Workspace.objects.get(owner=self.user)
        self.domain = DomainRegistry.objects.create(
            workspace=self.workspace, domain='brand.example.com',
        )

    def test_unregistered_domain_denied(self):
        res = self.client.get('/api/internal/tls-allowed/', {'domain': 'not-ours.com'})
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_registered_but_unverified_denied(self):
        self.domain.verified = False
        self.domain.save(update_fields=['verified'])
        res = self.client.get('/api/internal/tls-allowed/', {'domain': self.domain.domain})
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_registered_and_verified_allowed(self):
        self.domain.verified = True
        self.domain.save(update_fields=['verified'])
        res = self.client.get('/api/internal/tls-allowed/', {'domain': self.domain.domain})
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_no_domain_returns_400(self):
        res = self.client.get('/api/internal/tls-allowed/')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_does_not_require_auth(self):
        res = self.client.get('/api/internal/tls-allowed/', {'domain': 'nonexistent.net'})
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_works_when_called_by_caddy_from_inside_docker(self):
        # Caddy's on-demand TLS probe reaches the backend with Host: backend,
        # which must not be rejected by ALLOWED_HOSTS before the view runs.
        self.domain.verified = True
        self.domain.save(update_fields=['verified'])
        res = self.client.get(
            '/api/internal/tls-allowed/',
            {'domain': self.domain.domain},
            HTTP_HOST='backend',
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_apex_tracking_host_allowed(self):
        # A root-domain entry (example.com) can't hold a CNAME, so its links
        # run on t.example.com — Caddy must be allowed to mint that certificate.
        apex = DomainRegistry.objects.create(
            workspace=self.workspace, domain='example.com',
        )
        apex.verified = True
        apex.save(update_fields=['verified'])
        res = self.client.get(
            '/api/internal/tls-allowed/',
            {'domain': 't.example.com'},
            HTTP_HOST='backend',
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    @override_settings(
        SECURE_SSL_REDIRECT=True,
        SECURE_REDIRECT_EXEMPT=[r'^api/internal/'],
    )
    def test_ssl_redirect_does_not_apply_to_internal_probe(self):
        # In production SECURE_SSL_REDIRECT is on. Caddy's TLS probe comes in
        # over plain HTTP and refuses to follow redirects, so the internal
        # endpoints must be exempt from the https 302.
        self.domain.verified = True
        self.domain.save(update_fields=['verified'])
        res = self.client.get(
            '/api/internal/tls-allowed/',
            {'domain': self.domain.domain},
            HTTP_HOST='backend',
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_apex_tracking_host_for_unrelated_subdomain_denied(self):
        self.domain.verified = True
        self.domain.save(update_fields=['verified'])
        res = self.client.get(
            '/api/internal/tls-allowed/',
            {'domain': 't.other.example.com'},
            HTTP_HOST='backend',
        )
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)


# IP Rules

class RegisteredDomainHostMiddlewareTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='hostmw_user')
        self.workspace = Workspace.objects.get(owner=self.user)

    def test_tracking_host_of_apex_domain_is_allowed(self):
        # https://t.example.com/r/<slug>/ arrives with Host t.example.com.
        # Even though only the apex example.com is registered, the middleware
        # must let the tracking subdomain hostname through (otherwise Django
        # answers 400 DisallowedHost before the view runs).
        DomainRegistry.objects.create(
            workspace=self.workspace, domain='example.com', verified=True,
        )
        res = self.client.get(
            '/api/internal/tls-allowed/',
            {'domain': 't.example.com'},
            HTTP_HOST='t.example.com',
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_registered_subdomain_host_is_allowed(self):
        # A 3+-label domain keeps its own name (no tracking subdomain), so the
        # Host already equals the registered domain.
        DomainRegistry.objects.create(
            workspace=self.workspace, domain='links.example.com', verified=True,
        )
        res = self.client.get(
            '/api/internal/tls-allowed/',
            {'domain': 'links.example.com'},
            HTTP_HOST='links.example.com',
        )
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_unregistered_host_is_rejected(self):
        res = self.client.get(
            '/api/internal/tls-allowed/',
            {'domain': 't.unknown-domain.io'},
            HTTP_HOST='t.unknown-domain.io',
        )
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)


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
        # Auto-reputation is a built-in protection: on by default for every
        # workspace, and deliberately not exposed through the public API so
        # customers can't switch it off for normal usage.
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
        self.link = TrackingLink.objects.create(
            workspace=self.workspace,
            slug='svc-test',
            destination_url='https://example.com',
        )

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

    def test_verify_domain_ownership_matches_record(self):
        from .services import verify_domain_ownership

        class FakeRdata:
            def to_text(self):
                return f'"{self.domain.verification_record}"'

        class FakeAnswers:
            def __init__(self, records):
                self._records = records

            def __iter__(self):
                return iter(self._records)

        domain = DomainRegistry.objects.create(
            workspace=self.workspace, domain='verify-txt.example.com',
        )
        with patch('dns.resolver.resolve', return_value=FakeAnswers([FakeRdata()])):
            FakeRdata.domain = domain
            verified, detail = verify_domain_ownership(domain)
            self.assertTrue(verified)
            self.assertEqual(detail, '')

    def test_verify_domain_ownership_no_match(self):
        from .services import verify_domain_ownership
        domain = DomainRegistry.objects.create(
            workspace=self.workspace, domain='verify-none.example.com',
        )
        with patch('dns.resolver.resolve', return_value=[]):
            verified, detail = verify_domain_ownership(domain)
            self.assertFalse(verified)
            self.assertTrue(detail)

    def test_verify_domain_ownership_dns_error(self):
        from .services import verify_domain_ownership
        domain = DomainRegistry.objects.create(
            workspace=self.workspace, domain='verify-fail.example.com',
        )
        with patch('dns.resolver.resolve', side_effect=Exception('NXDOMAIN')):
            verified, detail = verify_domain_ownership(domain)
            self.assertFalse(verified)
            self.assertTrue(detail)

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
            self.link, '8.8.8.8',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            self.workspace,
        )
        self.assertFalse(result['is_bot'])
        self.assertEqual(result['decision'], 'allowed')

    def test_classify_bot_ua(self):
        from .services import classify_request
        result = classify_request(
            self.link, '8.8.8.8',
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
            self.link, '8.8.8.8',
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
            self.link, '8.8.8.8',
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
            self.link, '8.8.8.8',
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
            self.link, '8.8.8.8',
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
        self.assertEqual(loc, {'country': '', 'region': '', 'city': ''})

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
        from django.utils import timezone
        from datetime import timedelta
        IPRule.objects.create(
            workspace=self.workspace, ip_or_cidr='8.8.8.8',
            action='deny', reason='Expired',
            expires_at=timezone.now() - timedelta(days=1),
        )
        result = classify_request(
            self.link, '8.8.8.8',
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
            self.link, '8.8.8.8',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            self.workspace,
        )
        self.assertFalse(result['is_bot'])
        self.assertEqual(result['decision'], 'allowed')


# Redirect Endpoint

class RedirectEndpointTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='redirect_user')
        self.workspace = Workspace.objects.get(owner=self.user)
        self.link = TrackingLink.objects.create(
            workspace=self.workspace,
            slug='test-redirect',
            destination_url='https://example.com/landing',
        )

    def test_redirect_human(self):
        res = self.client.get('/api/r/test-redirect/', HTTP_USER_AGENT='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')
        self.assertEqual(res.status_code, status.HTTP_302_FOUND)
        self.assertEqual(res.url, 'https://example.com/landing')

    def test_redirect_bot_ua_diverted_to_neutral_page(self):
        res = self.client.get('/api/r/test-redirect/', HTTP_USER_AGENT='Googlebot/2.1 (+http://www.google.com/bot.html)')
        self.assertEqual(res.status_code, status.HTTP_302_FOUND)
        self.assertTrue(res.url.endswith('/suspicious/'))

    def test_redirect_bot_uses_configured_safe_destination(self):
        self.workspace.safe_destination = 'https://safety.example.com/honeypot'
        self.workspace.save()
        res = self.client.get('/api/r/test-redirect/', HTTP_USER_AGENT='Googlebot/2.1')
        self.assertEqual(res.status_code, status.HTTP_302_FOUND)
        self.assertEqual(res.url, 'https://safety.example.com/honeypot')

    def test_redirect_ip_rule_deny_diverted(self):
        IPRule.objects.create(
            workspace=self.workspace, ip_or_cidr='127.0.0.1',
            action='deny', reason='Block local',
        )
        res = self.client.get('/api/r/test-redirect/', HTTP_USER_AGENT='Mozilla/5.0')
        self.assertEqual(res.status_code, status.HTTP_302_FOUND)
        self.assertTrue(res.url.endswith('/suspicious/'))

    def test_neutral_page_redirects_to_default(self):
        res = self.client.get('/suspicious/')
        self.assertEqual(res.status_code, status.HTTP_302_FOUND)
        self.assertEqual(res.url, 'https://google.com')

    def test_redirect_ip_rule_allow_overrides_bot_ua(self):
        IPRule.objects.create(
            workspace=self.workspace, ip_or_cidr='127.0.0.1',
            action='allow', reason='Allow local',
        )
        res = self.client.get('/api/r/test-redirect/', HTTP_USER_AGENT='Googlebot/2.1')
        self.assertEqual(res.status_code, status.HTTP_302_FOUND)
        self.assertEqual(res.url, 'https://example.com/landing')

    def test_redirect_increments_click_counter(self):
        self.client.get('/api/r/test-redirect/', HTTP_USER_AGENT='Mozilla/5.0')
        self.link.refresh_from_db()
        self.assertEqual(self.link.total_clicks, 1)
        self.assertEqual(self.link.bot_clicks, 0)

    def test_redirect_bot_increments_bot_counter(self):
        self.client.get('/api/r/test-redirect/', HTTP_USER_AGENT='Googlebot/2.1')
        self.link.refresh_from_db()
        self.assertEqual(self.link.total_clicks, 1)
        self.assertEqual(self.link.bot_clicks, 1)

    def test_redirect_creates_click_log(self):
        self.client.get('/api/r/test-redirect/', HTTP_USER_AGENT='Mozilla/5.0')
        self.assertEqual(ClickLog.objects.count(), 1)
        log = ClickLog.objects.first()
        self.assertEqual(log.decision, 'allowed')
        self.assertFalse(log.is_bot)

    def test_redirect_click_log_has_location(self):
        self.client.get('/api/r/test-redirect/', HTTP_USER_AGENT='Googlebot/2.1')
        log = ClickLog.objects.first()
        self.assertEqual(log.country, 'Localhost')
        self.assertEqual(log.region, '')
        self.assertEqual(log.city, '')

    def test_redirect_not_found(self):
        res = self.client.get('/api/r/nonexistent-slug/')
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_redirect_link_paused_returns_404(self):
        self.link.status = TrackingLink.Status.PAUSED
        self.link.save()
        res = self.client.get('/api/r/test-redirect/', HTTP_USER_AGENT='Mozilla/5.0')
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)

    def test_direct_destination_not_tracked(self):
        # Visiting the destination URL directly should NOT create a ClickLog
        res = self.client.get(self.link.destination_url, HTTP_USER_AGENT='Mozilla/5.0')
        self.assertEqual(ClickLog.objects.count(), 0)
        # Destination URL is external, so we don't expect a specific status
        # The key assertion is that no ClickLog was created

    def test_redirect_forwards_utm_params(self):
        res = self.client.get(
            '/api/r/test-redirect/?utm_source=facebook&utm_campaign=summer&click_id=xyz123',
            HTTP_USER_AGENT='Mozilla/5.0',
        )
        self.assertEqual(res.status_code, status.HTTP_302_FOUND)
        self.assertEqual(
            res.url,
            'https://example.com/landing?utm_source=facebook&utm_campaign=summer&click_id=xyz123',
        )

    def test_redirect_keeps_existing_destination_params(self):
        self.link.destination_url = 'https://example.com/landing?ref=web'
        self.link.save(update_fields=['destination_url'])
        res = self.client.get(
            '/api/r/test-redirect/?utm_source=facebook',
            HTTP_USER_AGENT='Mozilla/5.0',
        )
        self.assertEqual(res.status_code, status.HTTP_302_FOUND)
        self.assertIn('ref=web', res.url)
        self.assertIn('utm_source=facebook', res.url)

    def test_redirect_forwards_params_to_safe_destination(self):
        self.workspace.safe_destination = 'https://safety.example.com/honeypot'
        self.workspace.save()
        res = self.client.get(
            '/api/r/test-redirect/?utm_source=botcampaign',
            HTTP_USER_AGENT='Googlebot/2.1',
        )
        self.assertEqual(res.status_code, status.HTTP_302_FOUND)
        self.assertEqual(res.url, 'https://safety.example.com/honeypot?utm_source=botcampaign')


# Auto-reputation & datacenter detection

class AutoReputationAndDatacenterTests(APITestCase):
    def setUp(self):
        from .models import TrackingLink, Workspace
        self.user = User.objects.create_user(username='reputation_user')
        self.workspace = Workspace.objects.get(owner=self.user)
        self.link = TrackingLink.objects.create(
            workspace=self.workspace,
            slug='rep-test',
            destination_url='https://example.com/landing',
        )

    def tearDown(self):
        # The module-level datacenter cache must not leak into later tests.
        from .services import reset_datacenter_cache
        reset_datacenter_cache()

    def _seed_datacenter_range(self):
        from .models import IpAsnRange
        from .services import reset_datacenter_cache
        IpAsnRange.objects.create(
            start_ip='8.8.8.0',
            end_ip='8.8.8.255',
            asn='AS15169', country='US', org='ExampleHosting LLC',
        )
        reset_datacenter_cache()

    def test_datacenter_ip_blocked(self):
        from .services import classify_request
        self._seed_datacenter_range()
        result = classify_request(
            self.link, '8.8.8.8',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            self.workspace,
        )
        self.assertTrue(result['is_bot'])
        self.assertEqual(result['decision'], 'blocked')
        self.assertEqual(result['reason'], 'Hosting/datacenter IP')

    def test_non_datacenter_ip_allowed(self):
        from .services import classify_request
        result = classify_request(
            self.link, '1.1.1.1',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            self.workspace,
        )
        self.assertFalse(result['is_bot'])
        self.assertEqual(result['decision'], 'allowed')

    def test_allow_rule_overrides_datacenter(self):
        from .models import IPRule
        from .services import classify_request
        self._seed_datacenter_range()
        IPRule.objects.create(
            workspace=self.workspace, ip_or_cidr='8.8.8.8',
            action='allow', reason='Trusted',
        )
        result = classify_request(
            self.link, '8.8.8.8',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            self.workspace,
        )
        self.assertFalse(result['is_bot'])
        self.assertEqual(result['decision'], 'allowed')

    def test_auto_reputation_below_threshold(self):
        from .models import ClickLog
        from .services import classify_request
        for _ in range(3):
            ClickLog.objects.create(
                link=self.link, ip='9.9.9.9', is_bot=True,
                decision=ClickLog.Decision.BLOCKED, reason='x',
            )
        result = classify_request(
            self.link, '9.9.9.9',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            self.workspace,
        )
        self.assertFalse(result['is_bot'])
        self.assertEqual(result['decision'], 'allowed')

    def test_auto_reputation_creates_deny_rule(self):
        from .models import ClickLog, IPRule
        from .services import classify_request
        for _ in range(4):
            ClickLog.objects.create(
                link=self.link, ip='9.9.9.9', is_bot=True,
                decision=ClickLog.Decision.BLOCKED, reason='x',
            )
        result = classify_request(
            self.link, '9.9.9.9',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            self.workspace,
        )
        self.assertTrue(result['is_bot'])
        self.assertEqual(result['decision'], 'blocked')
        rule = IPRule.objects.get(workspace=self.workspace, ip_or_cidr='9.9.9.9')
        self.assertEqual(rule.source, IPRule.Source.AUTO)
        self.assertIsNotNone(rule.expires_at)

    def test_auto_reputation_disabled(self):
        from .models import ClickLog
        from .services import classify_request
        self._seed_datacenter_range()
        self.workspace.auto_reputation_enabled = False
        self.workspace.save()
        for _ in range(4):
            ClickLog.objects.create(
                link=self.link, ip='9.9.9.9', is_bot=True,
                decision=ClickLog.Decision.BLOCKED, reason='x',
            )
        for ip in ('8.8.8.8', '9.9.9.9'):
            result = classify_request(
                self.link, ip,
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                self.workspace,
            )
            self.assertFalse(result['is_bot'])
            self.assertEqual(result['decision'], 'allowed')

    def test_redirect_datacenter_ip_diverted(self):
        self._seed_datacenter_range()
        res = self.client.get(
            '/api/r/rep-test/',
            REMOTE_ADDR='8.8.8.8',
            HTTP_USER_AGENT='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        )
        self.assertEqual(res.status_code, status.HTTP_302_FOUND)
        self.assertTrue(res.url.endswith('/suspicious/'))

    def test_redirect_auto_reputation_blocks_repeat_offender(self):
        from .models import ClickLog
        for _ in range(4):
            ClickLog.objects.create(
                link=self.link, ip='9.9.9.9', is_bot=True,
                decision=ClickLog.Decision.BLOCKED, reason='x',
            )
        res = self.client.get(
            '/api/r/rep-test/',
            REMOTE_ADDR='9.9.9.9',
            HTTP_USER_AGENT='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        )
        self.assertEqual(res.status_code, status.HTTP_302_FOUND)
        self.assertTrue(res.url.endswith('/suspicious/'))


# SEO Endpoints

class SEOEndpointTests(APITestCase):
    @override_settings(SITE_URL='https://example.org')
    def test_robots_txt(self):
        res = self.client.get('/robots.txt')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res['Content-Type'], 'text/plain')
        body = res.content.decode()
        self.assertIn('Disallow: /auth/', body)
        self.assertIn('Disallow: /r/', body)
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


class DomainScanCommandTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='scan_user')
        self.workspace = Workspace.objects.get(owner=self.user)
        self.domain = DomainRegistry.objects.create(
            workspace=self.workspace, domain='scan-test.example.com',
        )

    def test_command_updates_last_scan_at(self):
        from django.core.management import call_command
        self.assertIsNone(self.workspace.last_domain_scan_at)
        with patch('vericlick.services.diagnose_domain', return_value=FAKE_DIAGNOSIS):
            call_command('check_domains')
        self.workspace.refresh_from_db()
        self.assertIsNotNone(self.workspace.last_domain_scan_at)

    def test_command_checks_domains(self):
        from django.core.management import call_command
        with patch('vericlick.services.diagnose_domain', return_value=FAKE_DIAGNOSIS):
            call_command('check_domains')
        self.domain.refresh_from_db()
        self.assertIsNotNone(self.domain.last_checked)
        self.assertIn(self.domain.health_status, ['healthy', 'degraded'])

    def test_command_runs_once_with_interval_zero(self):
        from django.core.management import call_command
        with patch('vericlick.services.diagnose_domain', return_value=FAKE_DIAGNOSIS):
            call_command('check_domains', interval=0)
        self.workspace.refresh_from_db()
        self.assertIsNotNone(self.workspace.last_domain_scan_at)

    def test_command_rejects_negative_interval(self):
        from django.core.management import call_command
        from django.core.management.base import CommandError
        with self.assertRaises(CommandError):
            call_command('check_domains', interval=-1)


# In-app domain health refresh (no external scheduler)

class InAppDomainRefreshTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='inapp_scan_user')
        self.workspace = Workspace.objects.get(owner=self.user)
        self.domain = DomainRegistry.objects.create(
            workspace=self.workspace, domain='inapp-scan.example.com',
        )
        self.client.force_authenticate(self.user)

    def test_refresh_stale_domains_checks_never_checked(self):
        from .services import refresh_stale_domains
        self.assertIsNone(self.domain.last_checked)
        with patch('vericlick.services.diagnose_domain', return_value=FAKE_DIAGNOSIS):
            checked = refresh_stale_domains(self.workspace)
        self.assertIn(self.domain, checked)
        self.domain.refresh_from_db()
        self.assertIsNotNone(self.domain.last_checked)
        self.workspace.refresh_from_db()
        self.assertIsNotNone(self.workspace.last_domain_scan_at)

    def test_refresh_skips_recently_checked(self):
        from .services import refresh_stale_domains
        with patch('vericlick.services.diagnose_domain', return_value=FAKE_DIAGNOSIS):
            self.domain.run_health_check()
            checked = refresh_stale_domains(self.workspace)
        self.assertNotIn(self.domain, checked)

    def test_list_endpoint_triggers_async_check(self):
        from unittest.mock import patch
        self.assertIsNone(self.domain.last_checked)
        with patch('vericlick.views.refresh_stale_domains_async') as mock:
            res = self.client.get('/api/domains/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        mock.assert_called_once()

    def test_dashboard_stats_triggers_async_check(self):
        from unittest.mock import patch
        self.assertIsNone(self.domain.last_checked)
        with patch('vericlick.views.refresh_stale_domains_async') as mock:
            res = self.client.get('/api/dashboard/stats/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        mock.assert_called_once()
        self.assertIn('domainsHealthy', res.json())


# Tracker Script

class TrackerScriptTests(APITestCase):
    def test_returns_javascript(self):
        res = self.client.get('/api/tracker.js')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res['Content-Type'], 'application/javascript')
        self.assertIn('tracker/event/', res.content.decode())
        self.assertIn('data-site', res.content.decode())

    def test_cache_control_header(self):
        res = self.client.get('/api/tracker.js')
        self.assertIn('max-age=3600', res['Cache-Control'])

    def test_allows_unauthenticated(self):
        res = self.client.get('/api/tracker.js')
        self.assertEqual(res.status_code, status.HTTP_200_OK)


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
        self.link = TrackingLink.objects.create(
            workspace=self.workspace,
            slug='blocked-link',
            destination_url='https://example.com',
        )
        self.other_user = User.objects.create_user(username='other_blocked', password='testpass123')
        self.other_ws = Workspace.objects.get(owner=self.other_user)
        self.other_link = TrackingLink.objects.create(
            workspace=self.other_ws,
            slug='other-blocked',
            destination_url='https://other.com',
        )

    def test_list_blocked_ips(self):
        ClickLog.objects.create(
            link=self.link, ip='203.0.113.5', decision='blocked',
            reason='Suspicious UA', is_bot=True, matched_rule='',
            country='Australia', region='New South Wales', city='Sydney',
        )
        ClickLog.objects.create(link=self.link, ip='8.8.8.8', decision='allowed', is_bot=False)
        res = self.client.get('/api/ip-rules/blocked/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        body = res.json()
        self.assertEqual(body['count'], 1)
        entry = body['results'][0]
        self.assertEqual(entry['ip'], '203.0.113.5')
        self.assertEqual(entry['reason'], 'Suspicious UA')
        self.assertEqual(entry['decision'], 'blocked')
        self.assertTrue(entry['isBot'])
        self.assertEqual(entry['country'], 'Australia')
        self.assertEqual(entry['region'], 'New South Wales')
        self.assertEqual(entry['city'], 'Sydney')

    def test_blocked_search_by_slug(self):
        ClickLog.objects.create(
            link=self.link, ip='203.0.113.5', decision='blocked', reason='x', is_bot=True,
        )
        ClickLog.objects.create(
            link=self.link, ip='198.51.100.7', decision='blocked', reason='y', is_bot=True,
        )
        res = self.client.get('/api/ip-rules/blocked/', {'search': 'blocked-link'})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.json()['count'], 2)

    def test_only_own_workspace_blocked(self):
        ClickLog.objects.create(link=self.link, ip='203.0.113.5', decision='blocked', is_bot=True)
        ClickLog.objects.create(link=self.other_link, ip='198.51.100.7', decision='blocked', is_bot=True)
        res = self.client.get('/api/ip-rules/blocked/')
        body = res.json()
        self.assertEqual(body['count'], 1)
        self.assertEqual(body['results'][0]['ip'], '203.0.113.5')

    def test_search_by_ip(self):
        ClickLog.objects.create(link=self.link, ip='203.0.113.5', decision='blocked', is_bot=True)
        ClickLog.objects.create(link=self.link, ip='198.51.100.7', decision='blocked', is_bot=True)
        res = self.client.get('/api/ip-rules/blocked/?search=198')
        body = res.json()
        self.assertEqual(body['count'], 1)
        self.assertEqual(body['results'][0]['ip'], '198.51.100.7')

    def test_unauthenticated_access(self):
        self.client.force_authenticate(user=None)
        res = self.client.get('/api/ip-rules/blocked/')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_whitelist_creates_allow_rule(self):
        click = ClickLog.objects.create(link=self.link, ip='203.0.113.5', decision='blocked', is_bot=True)
        res = self.client.post(f'/api/ip-rules/{click.id}/whitelist/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        body = res.json()
        self.assertEqual(body['ipOrCidr'], '203.0.113.5')
        self.assertEqual(body['action'], 'allow')
        rule = IPRule.objects.get(workspace=self.workspace, ip_or_cidr='203.0.113.5')
        self.assertEqual(rule.action, 'allow')
        self.assertTrue(rule.is_active)

    def test_whitelist_cross_workspace_rejected(self):
        click = ClickLog.objects.create(link=self.other_link, ip='198.51.100.7', decision='blocked', is_bot=True)
        res = self.client.post(f'/api/ip-rules/{click.id}/whitelist/')
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)
        self.assertFalse(IPRule.objects.filter(ip_or_cidr='198.51.100.7').exists())

    def test_whitelist_existing_rule_reactivated(self):
        click = ClickLog.objects.create(link=self.link, ip='203.0.113.5', decision='blocked', is_bot=True)
        IPRule.objects.create(
            workspace=self.workspace, ip_or_cidr='203.0.113.5',
            action='allow', is_active=False,
        )
        res = self.client.post(f'/api/ip-rules/{click.id}/whitelist/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(
            IPRule.objects.filter(workspace=self.workspace, ip_or_cidr='203.0.113.5').count(), 1,
        )
        rule = IPRule.objects.get(workspace=self.workspace, ip_or_cidr='203.0.113.5')
        self.assertTrue(rule.is_active)


class PricingEndpointTests(APITestCase):
    def test_pricing_returns_seeded_plans(self):
        res = self.client.get('/api/pricing/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        body = res.json()
        codes = [p['code'] for p in body['plans']]
        self.assertEqual(codes, ['basic', 'plus', 'pro'])
        by_code = {p['code']: p for p in body['plans']}
        self.assertEqual(by_code['basic']['monthlyPrice'], 25)
        self.assertEqual(by_code['basic']['domainLimit'], 5)
        self.assertEqual(by_code['plus']['monthlyPrice'], 50)
        self.assertEqual(by_code['plus']['domainLimit'], 10)
        self.assertEqual(by_code['pro']['monthlyPrice'], 100)
        self.assertEqual(by_code['pro']['domainLimit'], 20)

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


class DomainLimitTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='limituser', password='testpass123')
        self.client.force_authenticate(user=self.user)
        self.workspace = Workspace.objects.get(owner=self.user)

    def test_paid_plan_allows_adding_under_limit(self):
        plan = Plan.objects.get(code='basic')
        self.workspace.plan = plan
        self.workspace.save()
        DomainRegistry.objects.create(
            workspace=self.workspace, domain='one.example.com', verified=True,
        )
        res = self.client.post('/api/domains/', {'domain': 'two.example.com'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

    def test_plan_domain_limit_enforced(self):
        plan = Plan.objects.get(code='basic')
        self.workspace.plan = plan
        self.workspace.save()
        for i in range(5):
            DomainRegistry.objects.create(
                workspace=self.workspace, domain=f'domain{i}.example.com', verified=True,
            )
        res = self.client.post('/api/domains/', {'domain': 'overflow.example.com'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertFalse(
            DomainRegistry.objects.filter(workspace=self.workspace, domain='overflow.example.com').exists()
        )

    def test_workspace_serializer_exposes_plan_usage(self):
        plan = Plan.objects.get(code='plus')
        self.workspace.plan = plan
        self.workspace.save()
        DomainRegistry.objects.create(
            workspace=self.workspace, domain='usage.example.com', verified=True,
        )
        res = self.client.get('/api/workspace/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        body = res.json()
        self.assertEqual(body['plan'], 'plus')
        self.assertEqual(body['domainLimit'], 10)
        self.assertEqual(body['domainsUsed'], 1)
        self.assertTrue(body['canAddDomain'])


class FreeTierTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username='freetieruser', password='testpass123')
        self.client.force_authenticate(user=self.user)
        self.workspace = Workspace.objects.get(owner=self.user)

    def _create_link(self, slug):
        return self.client.post('/api/links/', {
            'slug': slug,
            'destinationUrl': 'https://example.com/landing',
        }, format='json')

    def test_workspace_serializer_exposes_free_tier_and_trial(self):
        res = self.client.get('/api/workspace/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        body = res.json()
        self.assertIsNone(body['plan'])
        self.assertEqual(body['domainLimit'], 1)
        self.assertEqual(body['linkLimit'], 1)
        self.assertEqual(body['domainsUsed'], 0)
        self.assertEqual(body['linksUsed'], 0)
        self.assertTrue(body['canAddDomain'])
        self.assertTrue(body['canAddLink'])
        self.assertTrue(body['trialActive'])
        self.assertIsNotNone(body['trialExpiresAt'])

    def test_free_workspace_can_add_one_domain_only(self):
        res = self.client.post('/api/domains/', {'domain': 'one.example.com'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        # The slot is only consumed once the domain is verified (a typo you can
        # never verify never counts, so you can re-add it).
        DomainRegistry.objects.filter(workspace=self.workspace, domain='one.example.com').update(verified=True)
        res = self.client.post('/api/domains/', {'domain': 'two.example.com'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('free trial', res.json()['errors'][0]['detail'].lower())
        self.assertFalse(
            DomainRegistry.objects.filter(workspace=self.workspace, domain='two.example.com').exists()
        )

    def test_free_unverified_typo_domain_does_not_consume_slot(self):
        # A domain you can't verify (e.g. a typo) never counts toward the limit,
        # so removing it costs nothing and you can register again.
        res = self.client.post('/api/domains/', {'domain': 'goglee.com'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        typo = DomainRegistry.objects.get(workspace=self.workspace, domain='goglee.com')
        res = self.client.delete(f'/api/domains/{typo.id}/')
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)
        res = self.client.post('/api/domains/', {'domain': 'google.com'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

    def test_free_workspace_can_add_one_link_only(self):
        DomainRegistry.objects.create(
            workspace=self.workspace, domain='brand.example.com', verified=True,
        )
        res = self.client.post('/api/links/', {
            'slug': 'trial-one',
            'domain': 'brand.example.com',
            'destinationUrl': 'https://example.com/landing',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        res = self._create_link('trial-two')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('free trial', res.json()['errors'][0]['detail'].lower())
        self.assertFalse(TrackingLink.objects.filter(workspace=self.workspace, slug='trial-two').exists())

    def test_free_workspace_can_use_ip_rules_during_trial(self):
        res = self.client.post('/api/ip-rules/', {
            'ipOrCidr': '1.2.3.4',
            'action': 'deny',
            'reason': 'trial test',
            'isActive': True,
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

    def test_expired_trial_blocks_creation_until_upgrade(self):
        self.workspace.trial_started_at = timezone.now() - timedelta(days=8)
        self.workspace.save()

        res = self.client.get('/api/workspace/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertFalse(res.json()['trialActive'])
        self.assertFalse(res.json()['canAddDomain'])
        self.assertFalse(res.json()['canAddLink'])

        res = self.client.post('/api/domains/', {'domain': 'late.example.com'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('trial ended', res.json()['errors'][0]['detail'].lower())

        res = self._create_link('late-link')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('trial ended', res.json()['errors'][0]['detail'].lower())

        res = self.client.post('/api/ip-rules/', {
            'ipOrCidr': '5.6.7.8',
            'action': 'deny',
            'reason': 'after trial',
            'isActive': True,
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('paid feature', res.json()['errors'][0]['detail'].lower())

    def test_upgrade_after_trial_expiry_restores_creation(self):
        self.workspace.trial_started_at = timezone.now() - timedelta(days=8)
        self.workspace.plan = Plan.objects.get(code='basic')
        self.workspace.save()

        res = self.client.post('/api/domains/', {'domain': 'paid.example.com'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        res = self._create_link('paid-link')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

        res = self.client.get('/api/workspace/')
        body = res.json()
        self.assertEqual(body['plan'], 'basic')
        self.assertFalse(body['trialActive'])
        self.assertTrue(body['canAddDomain'])
        self.assertTrue(body['canAddLink'])


class DeletionCountingPolicyTests(APITestCase):
    # Anti-abuse rule: only VERIFIED domains count toward plan limits, and
    # deleting a verified domain (or a link on one) keeps its slot occupied
    # until the current plan/trial period ends. Unverified "typo" domains never
    # count and can be removed and re-added freely.
    def setUp(self):
        self.user = User.objects.create_user(username='deleterule', password='testpass123')
        self.client.force_authenticate(user=self.user)
        self.workspace = Workspace.objects.get(owner=self.user)
        self.plan = Plan.objects.get(code='basic')

    def _verified_domain(self, domain):
        return DomainRegistry.objects.create(
            workspace=self.workspace, domain=domain, verified=True,
        )

    def test_verified_domain_counts_and_removal_keeps_slot_until_period_ends(self):
        # The app starts the trial clock before any domain can be created.
        self.workspace.ensure_trial_started()
        domain = self._verified_domain('keep.example.com')
        self.assertEqual(self.workspace.domains_in_use(), 1)
        res = self.client.delete(f'/api/domains/{domain.id}/')
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)
        # The slot is NOT freed within the current period.
        self.assertEqual(self.workspace.domains_in_use(), 1)
        res = self.client.post('/api/domains/', {'domain': 'second.example.com'}, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)

    def test_removed_domain_released_when_plan_period_advances(self):
        self.workspace.plan = self.plan
        self.workspace.save()
        old = self._verified_domain('old-month.example.com')
        recent = self._verified_domain('recent-month.example.com')
        old.removed_at = timezone.now() - timedelta(days=40)
        old.save(update_fields=['removed_at'])
        recent.removed_at = timezone.now()
        recent.save(update_fields=['removed_at'])
        # Plan started 65 days ago -> the current period began ~5 days ago, so
        # the 40-day-old removal was in a previous period (released) while the
        # recent one still occupies its slot.
        self.workspace.plan_started_at = timezone.now() - timedelta(days=65)
        self.workspace.save(update_fields=['plan_started_at'])
        self.assertEqual(self.workspace.domains_in_use(), 1)

    def test_free_trial_removed_domain_released_after_upgrade(self):
        self.workspace.trial_started_at = timezone.now() - timedelta(days=5)
        self.workspace.save(update_fields=['trial_started_at'])
        domain = self._verified_domain('trial.example.com')
        domain.removed_at = timezone.now() - timedelta(days=1)
        domain.save(update_fields=['removed_at'])
        # Removed during the trial -> still counted within the trial period.
        self.assertEqual(self.workspace.domains_in_use(), 1)
        # Upgrading starts a fresh paid period, releasing the trial-era removal.
        self.workspace.plan = self.plan
        self.workspace.save()
        self.assertEqual(self.workspace.domains_in_use(), 0)

    def test_links_on_verified_domain_count_and_stay_after_removal(self):
        self.workspace.plan = self.plan
        self.workspace.save()
        domain = self._verified_domain('brand.example.com')
        link = TrackingLink.objects.create(
            workspace=self.workspace, domain=domain,
            slug='brand-link', destination_url='https://example.com',
        )
        self.assertEqual(self.workspace.links_in_use(), 1)
        res = self.client.delete(f'/api/links/{link.id}/')
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)
        # A removed link on a verified domain keeps counting until the period ends.
        self.assertEqual(self.workspace.links_in_use(), 1)

    def test_links_without_verified_domain_do_not_count(self):
        TrackingLink.objects.create(
            workspace=self.workspace, slug='plain-link', destination_url='https://example.com',
        )
        unverified = DomainRegistry.objects.create(workspace=self.workspace, domain='no.example.com')
        TrackingLink.objects.create(
            workspace=self.workspace, domain=unverified,
            slug='unverified-link', destination_url='https://example.com',
        )
        self.assertEqual(self.workspace.links_in_use(), 0)

    def test_unverified_domains_never_count(self):
        DomainRegistry.objects.create(workspace=self.workspace, domain='typo.example.com')
        DomainRegistry.objects.create(workspace=self.workspace, domain='other.example.com')
        self.assertEqual(self.workspace.domains_in_use(), 0)

    def test_removed_domain_stops_serving_links(self):
        domain = DomainRegistry.objects.create(
            workspace=self.workspace, domain='gone.example.com', verified=True,
            points_to_server=True, health_status=DomainRegistry.HealthStatus.HEALTHY,
        )
        link = TrackingLink.objects.create(
            workspace=self.workspace, domain=domain,
            slug='gone-link', destination_url='https://example.com',
        )
        domain.removed_at = timezone.now()
        domain.save(update_fields=['removed_at'])
        from vericlick.services import get_public_tracking_url
        self.assertNotIn('gone.example.com', get_public_tracking_url(link))

    def test_removed_link_does_not_serve(self):
        link = TrackingLink.objects.create(
            workspace=self.workspace, slug='removed-serve', destination_url='https://example.com',
        )
        link.removed_at = timezone.now()
        link.save(update_fields=['removed_at'])
        res = self.client.get(f'/r/{link.slug}/')
        self.assertEqual(res.status_code, status.HTTP_404_NOT_FOUND)


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
        # The plan is NOT granted here — the webhook is the source of truth.
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
        # Legacy sign-ups could create two accounts with the same email. The
        # endpoint must stay a generic 200 even when the address is ambiguous.
        User.objects.create_user(username='resetuser2', email=self.shared_email, password='testpass123')
        res = self.client.post('/api/auth/password-reset/', {'email': self.shared_email}, format='json')
        self.assertEqual(res.status_code, status.HTTP_200_OK)


class AdminManualPaymentActionTests(TestCase):
    """The 'Record a manual payment…' admin action must log a BillingEvent for
    payments received outside the API checkout (payment links, offline
    transfers) and optionally activate the plan."""

    def setUp(self):
        self.plan = Plan.objects.create(
            code='manual-test-pro', name='Pro', monthly_price='25.00', domain_limit=20, is_active=True,
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
