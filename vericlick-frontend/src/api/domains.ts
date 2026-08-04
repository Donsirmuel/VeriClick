import { MOCK_MODE, apiClient } from './client'
import { mockDomains, mockFetch } from './mock'
import type { Domain, PaginatedResponse } from '@/types'

export async function fetchDomains(): Promise<Domain[]> {
  if (MOCK_MODE) {
    return mockFetch(mockDomains)
  }
  const { data } = await apiClient.get<PaginatedResponse<Domain>>('/domains/')
  return data.results
}

export async function fetchDomain(id: string): Promise<Domain> {
  if (MOCK_MODE) {
    const domain = mockDomains.find(d => d.id === id)
    if (!domain) throw new Error('Domain not found')
    return mockFetch(domain)
  }
  const { data } = await apiClient.get<Domain>(`/domains/${id}/`)
  return data
}

export async function createDomain(domain: string): Promise<Domain> {
  if (MOCK_MODE) {
    const token = crypto.randomUUID()
    const newDomain: Domain = {
      id: crypto.randomUUID(),
      domain,
      healthStatus: 'healthy',
      verified: true,
      verificationToken: token,
      verificationRecord: `vericlick-verify=${token}`,
      lastChecked: null,
      linksCount: 0,
      createdAt: new Date().toISOString(),
    }
    return mockFetch(newDomain)
  }
  const { data } = await apiClient.post<Domain>('/domains/', { domain })
  return data
}

export async function updateDomain(id: string, domain: string): Promise<Domain> {
  if (MOCK_MODE) {
    const existing = mockDomains.find(d => d.id === id)
    if (!existing) throw new Error('Domain not found')
    return mockFetch({ ...existing, domain })
  }
  const { data } = await apiClient.patch<Domain>(`/domains/${id}/`, { domain })
  return data
}

export async function deleteDomain(id: string): Promise<void> {
  if (MOCK_MODE) {
    return
  }
  await apiClient.delete(`/domains/${id}/`)
}

export async function recheckDomain(id: string): Promise<{ status: string; lastChecked: string }> {
  if (MOCK_MODE) {
    return mockFetch({ status: 'ok', lastChecked: new Date().toISOString() })
  }
  const { data } = await apiClient.post<{ status: string; lastChecked: string }>(`/domains/${id}/recheck/`)
  return data
}

export async function verifyDomain(id: string): Promise<{ status: string; verified: boolean; verificationRecord: string }> {
  if (MOCK_MODE) {
    return mockFetch({ status: 'ok', verified: true, verificationRecord: 'vericlick-verify=mock-token' })
  }
  const { data } = await apiClient.post<{ status: string; verified: boolean; verificationRecord: string }>(`/domains/${id}/verify/`)
  return data
}
