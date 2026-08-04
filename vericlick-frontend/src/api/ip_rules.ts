import { MOCK_MODE, apiClient } from './client'
import { mockFetch } from './mock'
import type { IPRule, IPRuleCreateInput, BlockedIPEntry, PaginatedResponse } from '@/types'

const mockRules: IPRule[] = [
  {
    id: 'mock-rule-1',
    ipOrCidr: '185.220.101.0/24',
    action: 'deny',
    reason: 'Tor exit node range',
    expiresAt: null,
    isActive: true,
    createdBy: null,
    createdByUsername: 'admin',
    createdAt: '2026-07-20T10:00:00Z',
    updatedAt: '2026-07-20T10:00:00Z',
  },
  {
    id: 'mock-rule-2',
    ipOrCidr: '10.0.0.0/8',
    action: 'allow',
    reason: 'Internal network',
    expiresAt: null,
    isActive: true,
    createdBy: null,
    createdByUsername: 'admin',
    createdAt: '2026-07-21T14:00:00Z',
    updatedAt: '2026-07-21T14:00:00Z',
  },
  {
    id: 'mock-rule-3',
    ipOrCidr: '203.0.113.5',
    action: 'deny',
    reason: 'Known scanner',
    expiresAt: '2026-08-01T00:00:00Z',
    isActive: true,
    createdBy: null,
    createdByUsername: 'admin',
    createdAt: '2026-07-22T08:00:00Z',
    updatedAt: '2026-07-22T08:00:00Z',
  },
]

export async function fetchIPRules(): Promise<PaginatedResponse<IPRule>> {
  if (MOCK_MODE) {
    return mockFetch({ count: mockRules.length, next: null, previous: null, results: mockRules })
  }
  const { data } = await apiClient.get<PaginatedResponse<IPRule>>('/ip-rules/')
  return data
}

export async function createIPRule(input: IPRuleCreateInput): Promise<IPRule> {
  if (MOCK_MODE) {
    const newRule: IPRule = {
      id: `mock-${Date.now()}`,
      ipOrCidr: input.ipOrCidr,
      action: input.action,
      reason: input.reason || '',
      expiresAt: input.expiresAt || null,
      isActive: input.isActive ?? true,
      createdBy: null,
      createdByUsername: 'you',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    return mockFetch(newRule)
  }
  const { data } = await apiClient.post<IPRule>('/ip-rules/', input)
  return data
}

export async function updateIPRule(id: string, input: Partial<IPRuleCreateInput>): Promise<IPRule> {
  if (MOCK_MODE) {
    const existing = mockRules.find(r => r.id === id)
    if (!existing) throw new Error('Rule not found')
    return mockFetch({ ...existing, ...input } as IPRule)
  }
  const { data } = await apiClient.patch<IPRule>(`/ip-rules/${id}/`, input)
  return data
}

export async function deleteIPRule(id: string): Promise<void> {
  if (MOCK_MODE) return
  await apiClient.delete(`/ip-rules/${id}/`)
}

const mockBlocked: BlockedIPEntry[] = [
  {
    id: 'mock-blocked-1',
    ip: '185.220.101.42',
    reason: 'Suspicious UA',
    reasonLabel: 'Request looked automated (bot-like browser)',
    decision: 'blocked',
    isBot: true,
    matchedRule: '185.220.101.0/24',
    slug: 'a8k3x2m',
    country: 'Germany',
    region: 'Berlin',
    city: 'Berlin',
    createdAt: '2026-07-22T06:10:00Z',
  },
  {
    id: 'mock-blocked-2',
    ip: '162.243.12.7',
    reason: 'IPRule: deny',
    reasonLabel: 'Blocked by a deny rule you created',
    decision: 'blocked',
    isBot: true,
    matchedRule: '162.243.0.0/16',
    slug: 'q7w9p1k',
    country: 'United States',
    region: 'New York',
    city: 'New York',
    createdAt: '2026-07-22T05:58:00Z',
  },
  {
    id: 'mock-blocked-3',
    ip: '203.0.113.42',
    reason: 'Rate limit',
    reasonLabel: 'Blocked — too many requests from this address',
    decision: 'blocked',
    isBot: true,
    matchedRule: '',
    slug: 't3r7k9v',
    country: 'Australia',
    region: 'New South Wales',
    city: 'Sydney',
    createdAt: '2026-07-22T05:42:00Z',
  },
]

export async function fetchBlockedIps(params?: {
  search?: string
  page?: number
}): Promise<PaginatedResponse<BlockedIPEntry>> {
  if (MOCK_MODE) {
    const search = params?.search?.toLowerCase() ?? ''
    const results = search
      ? mockBlocked.filter((b) => b.ip.includes(search) || b.slug.includes(search))
      : mockBlocked
    return mockFetch({ count: results.length, next: null, previous: null, results })
  }
  const { data } = await apiClient.get<PaginatedResponse<BlockedIPEntry>>('/ip-rules/blocked/', { params })
  return data
}

export async function whitelistIp(id: string): Promise<IPRule> {
  if (MOCK_MODE) {
    const entry = mockBlocked.find((b) => b.id === id)
    if (!entry) throw new Error('Blocked entry not found')
    const rule: IPRule = {
      id: `mock-${Date.now()}`,
      ipOrCidr: entry.ip,
      action: 'allow',
      reason: 'Whitelisted from blocked list',
      expiresAt: null,
      isActive: true,
      createdBy: null,
      createdByUsername: 'you',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    return mockFetch(rule)
  }
  const { data } = await apiClient.post<IPRule>(`/ip-rules/${id}/whitelist/`)
  return data
}
