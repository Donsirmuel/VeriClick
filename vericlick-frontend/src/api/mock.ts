import type { DashboardStats, TrafficData, ActivityEntry, TrackingLink, Domain, LinkCreateInput } from '@/types'

function uuid(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

export const mockDashboardStats: DashboardStats = {
  totalClicks24h: 14239,
  botTrafficBlocked: 2847,
  botTrafficPercentage: 20.0,
  blocked: 2847,
  challenged: 410,
  allowed: 11392,
  activeLinks: 24,
  domainsHealthy: 8,
  domainsDegraded: 1,
  domainsBlacklisted: 1,
  lastDomainScan: '2026-07-22T06:10:00Z',
}

export const mockTrafficData: Record<string, TrafficData[]> = {
  '7d': [
    { date: 'Jul 16', human: 8200, bot: 1640 },
    { date: 'Jul 17', human: 9100, bot: 1820 },
    { date: 'Jul 18', human: 7800, bot: 1560 },
    { date: 'Jul 19', human: 10500, bot: 2100 },
    { date: 'Jul 20', human: 9800, bot: 1960 },
    { date: 'Jul 21', human: 11200, bot: 2240 },
    { date: 'Jul 22', human: 11400, bot: 2280 },
  ],
  '30d': Array.from({ length: 30 }, (_, i) => ({
    date: `Jun ${i + 23 > 30 ? i + 23 - 30 : i + 23}`,
    human: 7000 + Math.floor(Math.random() * 5000),
    bot: 1400 + Math.floor(Math.random() * 1000),
  })),
  '90d': Array.from({ length: 12 }, (_, i) => ({
    date: `Week ${i + 1}`,
    human: 60000 + Math.floor(Math.random() * 20000),
    bot: 12000 + Math.floor(Math.random() * 4000),
  })),
}

export const mockActivity: ActivityEntry[] = [
  { id: uuid(), ip: '185.220.101.42', country: 'Germany', region: 'Berlin', city: 'Berlin', device: 'Desktop', reason: 'Tor Exit Node', reasonLabel: 'Blocked by automated detection', time: '2026-07-22T06:10:00Z', slug: 'a8k3x2m', isBot: true },
  { id: uuid(), ip: '104.28.31.5', country: 'United States', region: 'California', city: 'San Francisco', device: 'Mobile', reason: null, reasonLabel: 'Human traffic — let through', time: '2026-07-22T06:08:00Z', slug: 'a8k3x2m', isBot: false },
  { id: uuid(), ip: '162.243.12.7', country: 'United States', region: 'New York', city: 'New York', device: 'Bot', reason: 'Bot Detected', reasonLabel: 'Blocked by automated detection', time: '2026-07-22T06:05:00Z', slug: 'q7w9p1k', isBot: true },
  { id: uuid(), ip: '91.108.56.23', country: 'Netherlands', region: 'North Holland', city: 'Amsterdam', device: 'Desktop', reason: null, reasonLabel: 'Human traffic — let through', time: '2026-07-22T06:02:00Z', slug: 'm4n8j5h', isBot: false },
  { id: uuid(), ip: '45.155.205.18', country: 'Netherlands', region: 'South Holland', city: 'Rotterdam', device: 'Desktop', reason: 'Datacenter IP', reasonLabel: 'Blocked by automated detection', time: '2026-07-22T05:58:00Z', slug: 'q7w9p1k', isBot: true },
  { id: uuid(), ip: '176.32.100.14', country: 'Brazil', region: 'Sao Paulo', city: 'Sao Paulo', device: 'Mobile', reason: null, reasonLabel: 'Human traffic — let through', time: '2026-07-22T05:55:00Z', slug: 't3r7k9v', isBot: false },
  { id: uuid(), ip: '109.70.100.93', country: 'Austria', region: 'Vienna', city: 'Vienna', device: 'Mobile', reason: 'VPN / Proxy', reasonLabel: 'Blocked by automated detection', time: '2026-07-22T05:52:00Z', slug: 'a8k3x2m', isBot: true },
  { id: uuid(), ip: '72.14.199.8', country: 'United States', region: 'California', city: 'Mountain View', device: 'Desktop', reason: null, reasonLabel: 'Human traffic — let through', time: '2026-07-22T05:48:00Z', slug: 'm4n8j5h', isBot: false },
  { id: uuid(), ip: '185.220.102.244', country: 'Czechia', region: 'Prague', city: 'Prague', device: 'Desktop', reason: 'Headless Browser', reasonLabel: 'Blocked by automated detection', time: '2026-07-22T05:45:00Z', slug: 'q7w9p1k', isBot: true },
  { id: uuid(), ip: '203.0.113.42', country: 'Australia', region: 'New South Wales', city: 'Sydney', device: 'Tablet', reason: null, reasonLabel: 'Human traffic — let through', time: '2026-07-22T05:42:00Z', slug: 't3r7k9v', isBot: false },
  { id: uuid(), ip: '23.129.64.211', country: 'United States', region: 'Texas', city: 'Dallas', device: 'Tablet', reason: 'Suspicious UA', reasonLabel: 'Request looked automated (bot-like browser)', time: '2026-07-22T05:38:00Z', slug: 'a8k3x2m', isBot: true },
  { id: uuid(), ip: '88.99.177.34', country: 'United Kingdom', region: 'England', city: 'London', device: 'Desktop', reason: null, reasonLabel: 'Human traffic — let through', time: '2026-07-22T05:35:00Z', slug: 'm4n8j5h', isBot: false },
]

export const mockLinks: TrackingLink[] = [
  { id: uuid(), slug: 'a8k3x2m', destinationUrl: 'https://example.com/offer/campaign-alpha', domain: 'click.tracking-d.com', domainHealth: 'healthy', trackingUrl: 'https://click.tracking-d.com/a8k3x2m', totalClicks: 4821, botClicks: 964, status: 'active', createdAt: '2026-07-10T08:00:00Z' },
  { id: uuid(), slug: 'q7w9p1k', destinationUrl: 'https://example.com/offer/campaign-beta', domain: 'go.linkshield.io', domainHealth: 'healthy', trackingUrl: 'https://go.linkshield.io/q7w9p1k', totalClicks: 3204, botClicks: 641, status: 'active', createdAt: '2026-07-12T14:30:00Z' },
  { id: uuid(), slug: 'm4n8j5h', destinationUrl: 'https://example.com/offer/campaign-gamma', domain: 'safe.route.net', domainHealth: 'degraded', trackingUrl: 'https://safe.route.net/m4n8j5h', totalClicks: 2107, botClicks: 421, status: 'active', createdAt: '2026-07-14T10:15:00Z' },
  { id: uuid(), slug: 't3r7k9v', destinationUrl: 'https://example.com/offer/campaign-delta', domain: 'click.tracking-d.com', domainHealth: 'healthy', trackingUrl: 'https://click.tracking-d.com/t3r7k9v', totalClicks: 1589, botClicks: 318, status: 'active', createdAt: '2026-07-16T16:45:00Z' },
  { id: uuid(), slug: 'x2y5w8q', destinationUrl: 'https://example.com/offer/campaign-epsilon', domain: 'blacked.listed.xyz', domainHealth: 'blacklisted', trackingUrl: 'https://blacked.listed.xyz/x2y5w8q', totalClicks: 892, botClicks: 446, status: 'paused', createdAt: '2026-07-08T09:00:00Z' },
  { id: uuid(), slug: 'p9u3v6n', destinationUrl: 'https://example.com/offer/campaign-zeta', domain: 'go.linkshield.io', domainHealth: 'healthy', trackingUrl: 'https://go.linkshield.io/p9u3v6n', totalClicks: 756, botClicks: 151, status: 'active', createdAt: '2026-07-18T11:20:00Z' },
]

function mockDomain(domain: string, healthStatus: Domain['healthStatus'], verified: boolean, lastChecked: string, linksCount: number): Domain {
  const token = uuid()
  return {
    id: uuid(),
    domain,
    healthStatus,
    verified,
    verificationToken: token,
    verificationRecord: `vericlick-verify=${token}`,
    lastChecked,
    linksCount,
    createdAt: '2026-07-01T00:00:00Z',
  }
}

export const mockDomains: Domain[] = [
  mockDomain('click.tracking-d.com', 'healthy', true, '2026-07-22T06:00:00Z', 8),
  mockDomain('go.linkshield.io', 'healthy', true, '2026-07-22T05:45:00Z', 12),
  mockDomain('safe.route.net', 'degraded', false, '2026-07-22T05:30:00Z', 4),
  mockDomain('blacked.listed.xyz', 'blacklisted', true, '2026-07-22T04:00:00Z', 2),
  mockDomain('fresh.rotator.io', 'healthy', true, '2026-07-22T06:10:00Z', 6),
  mockDomain('pivot.switch.net', 'healthy', true, '2026-07-22T05:55:00Z', 3),
  mockDomain('edge.proxy.link', 'healthy', true, '2026-07-22T06:05:00Z', 5),
  mockDomain('relay.bounce.dev', 'healthy', true, '2026-07-22T05:50:00Z', 7),
]

export async function mockFetch<T>(data: T, delay = 200): Promise<T> {
  return new Promise((resolve) => {
    setTimeout(() => resolve(data), delay)
  })
}

export function createMockLink(input: LinkCreateInput): TrackingLink {
  return {
    id: uuid(),
    slug: input.slug || (() => {
      const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
      let s = ''
      for (let i = 0; i < 7; i++) s += chars.charAt(Math.floor(Math.random() * chars.length))
      return s
    })(),
    destinationUrl: input.destinationUrl,
    domain: input.domain ?? null,
    domainHealth: 'healthy',
    trackingUrl: input.domain ? `https://${input.domain}/${input.slug || ''}` : '',
    totalClicks: 0,
    botClicks: 0,
    status: input.status ?? 'active',
    createdAt: new Date().toISOString(),
  }
}
