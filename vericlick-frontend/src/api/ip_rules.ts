import { apiClient } from './client'
import type { IPRule, IPRuleCreateInput, BlockedIPEntry, PaginatedResponse } from '@/types'

export async function fetchIPRules(): Promise<PaginatedResponse<IPRule>> {
  const { data } = await apiClient.get<PaginatedResponse<IPRule>>('/ip-rules/')
  return data
}

export async function createIPRule(input: IPRuleCreateInput): Promise<IPRule> {
  const { data } = await apiClient.post<IPRule>('/ip-rules/', input)
  return data
}

export async function updateIPRule(id: string, input: Partial<IPRuleCreateInput>): Promise<IPRule> {
  const { data } = await apiClient.patch<IPRule>(`/ip-rules/${id}/`, input)
  return data
}

export async function deleteIPRule(id: string): Promise<void> {
  await apiClient.delete(`/ip-rules/${id}/`)
}

export async function fetchBlockedIps(params?: {
  search?: string
  page?: number
}): Promise<PaginatedResponse<BlockedIPEntry>> {
  const { data } = await apiClient.get<PaginatedResponse<BlockedIPEntry>>('/ip-rules/blocked/', { params })
  return data
}

export async function whitelistIp(id: string): Promise<IPRule> {
  const { data } = await apiClient.post<IPRule>(`/ip-rules/${id}/whitelist/`)
  return data
}
