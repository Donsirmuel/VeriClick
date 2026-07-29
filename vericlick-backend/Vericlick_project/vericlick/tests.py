import json
import uuid
from datetime import timedelta
from django.test import TestCase
from django.contrib.auth.models import User
from django.utils import timezone
from rest_framework.test import APITestCase, APIClient
from rest_framework import status
from .models import Workspace, DomainRegistry, TrackingLink, ClickLog
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
        self.assertEqual(res.json(), {'status': 'ok'})

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
            'domain': str(domain.id),
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
        self.assertEqual(body['healthStatus'], 'healthy')
        self.assertIsNone(body.get('lastChecked'))
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
