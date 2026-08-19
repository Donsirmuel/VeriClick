import { apiClient } from './client'
import type { DashboardStats, TrafficData, ActivityEntry, TimeRange, BreakdownRow } from '@/types'

export async function fetchDashboardStats(domain?: string): Promise<DashboardStats> {
  const { data } = await apiClient.get<DashboardStats>('/dashboard/stats/', {
    params: domain ? { domain } : undefined,
  })
  return data
}

export async function fetchTrafficData(range: TimeRange, domain?: string): Promise<TrafficData[]> {
  const params: Record<string, string> = { range }
  if (domain) params.domain = domain
  const { data } = await apiClient.get<TrafficData[]>('/dashboard/traffic/', { params })
  return data
}

export async function fetchActivity(domain?: string): Promise<ActivityEntry[]> {
  const { data } = await apiClient.get<ActivityEntry[]>('/dashboard/activity/', {
    params: domain ? { domain } : undefined,
  })
  return data
}

export async function fetchBreakdown(
  dimension: 'country' | 'device',
  range: TimeRange,
  domain?: string,
): Promise<BreakdownRow[]> {
  const params: Record<string, string> = { dimension, range }
  if (domain) params.domain = domain
  const { data } = await apiClient.get<BreakdownRow[]>('/dashboard/breakdown/', { params })
  return data
}
