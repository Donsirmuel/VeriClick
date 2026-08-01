import json
import uuid
from datetime import timedelta
from django.test import TestCase
from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.test import APITestCase, APIClient
from rest_framework import status
from .models import Workspace, DomainRegistry, TrackingLink, ClickLog, IPRule, TrackerEvent
from .utils import snake_to_camel, camel_to_snake, transform_keys


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

    def test_login_invalid_credentials(self):
        res = self.client.post('/api/auth/login/', {
            'username': 'nonexistent',
            'password': 'wrong',
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_401_UNAUTHORIZED)

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
        self.assertFalse(TrackingLink.objects.filter(id=link.id).exists())

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
        self.assertEqual(res.json()['trackingUrl'], 'http://testserver/r/track-url')

    def test_tracking_url_uses_custom_domain(self):
        domain = DomainRegistry.objects.create(
            workspace=self.workspace, domain='link.example.com',
        )
        link = TrackingLink.objects.create(
            workspace=self.workspace, domain=domain,
            slug='dom-url', destination_url='https://example.com',
        )
        res = self.client.get(f'/api/links/{link.id}/')
        self.assertEqual(res.json()['trackingUrl'], 'https://link.example.com/dom-url')


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
        self.assertFalse(DomainRegistry.objects.filter(id=domain.id).exists())

    def test_recheck_updates_last_checked(self):
        domain = DomainRegistry.objects.create(
            workspace=self.workspace, domain='recheck.example.com',
        )
        self.assertIsNone(domain.last_checked)
        res = self.client.post(f'/api/domains/{domain.id}/recheck/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        body = res.json()
        self.assertEqual(body['status'], 'ok')
        self.assertIsNotNone(body['lastChecked'])
        domain.refresh_from_db()
        self.assertIsNotNone(domain.last_checked)

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

    def test_neutral_page_renders(self):
        res = self.client.get('/suspicious/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertIn('protected', res.content.decode())

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


# SEO Endpoints

class SEOEndpointTests(APITestCase):
    def test_robots_txt(self):
        res = self.client.get('/robots.txt')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res['Content-Type'], 'text/plain')
        self.assertIn('Disallow: /auth/', res.content.decode())
        self.assertIn('Sitemap:', res.content.decode())

    def test_sitemap_xml(self):
        res = self.client.get('/sitemap.xml')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res['Content-Type'], 'application/xml')
        self.assertIn('<urlset', res.content.decode())


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
        call_command('check_domains')
        self.workspace.refresh_from_db()
        self.assertIsNotNone(self.workspace.last_domain_scan_at)

    def test_command_checks_domains(self):
        from django.core.management import call_command
        call_command('check_domains')
        self.domain.refresh_from_db()
        self.assertIsNotNone(self.domain.last_checked)
        self.assertIn(self.domain.health_status, ['healthy', 'degraded'])

    def test_command_runs_once_with_interval_zero(self):
        from django.core.management import call_command
        call_command('check_domains', interval=0)
        self.workspace.refresh_from_db()
        self.assertIsNotNone(self.workspace.last_domain_scan_at)

    def test_command_rejects_negative_interval(self):
        from django.core.management import call_command
        from django.core.management.base import CommandError
        with self.assertRaises(CommandError):
            call_command('check_domains', interval=-1)


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
