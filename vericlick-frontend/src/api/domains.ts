import { apiClient } from './client'
import type { Domain, PaginatedResponse } from '@/types'

export async function fetchDomains(): Promise<Domain[]> {
  const { data } = await apiClient.get<PaginatedResponse<Domain>>('/domains/')
  return data.results
}

export async function fetchDomain(id: string): Promise<Domain> {
  const { data } = await apiClient.get<Domain>(`/domains/${id}/`)
  return data
}

export async function createDomain(domain: string): Promise<Domain> {
  const { data } = await apiClient.post<Domain>('/domains/', { domain })
  return data
}

export async function updateDomain(id: string, domain: string): Promise<Domain> {
  const { data } = await apiClient.patch<Domain>(`/domains/${id}/`, { domain })
  return data
}

export async function deleteDomain(id: string): Promise<void> {
  await apiClient.delete(`/domains/${id}/`)
}

export async function recheckDomain(id: string): Promise<{ status: string; lastChecked: string }> {
  const { data } = await apiClient.post<{ status: string; lastChecked: string }>(`/domains/${id}/recheck/`)
  return data
}

export async function verifyDomain(id: string): Promise<{ status: string; verified: boolean; verificationRecord: string }> {
  const { data } = await apiClient.post<{ status: string; verified: boolean; verificationRecord: string }>(`/domains/${id}/verify/`)
  return data
}
