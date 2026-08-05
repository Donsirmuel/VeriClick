import { apiClient } from './client'
import type { DashboardStats, TrafficData, ActivityEntry, TimeRange } from '@/types'

export async function fetchDashboardStats(): Promise<DashboardStats> {
  const { data } = await apiClient.get<DashboardStats>('/dashboard/stats/')
  return data
}

export async function fetchTrafficData(range: TimeRange): Promise<TrafficData[]> {
  const { data } = await apiClient.get<TrafficData[]>('/dashboard/traffic/', {
    params: { range },
  })
  return data
}

export async function fetchActivity(): Promise<ActivityEntry[]> {
  const { data } = await apiClient.get<ActivityEntry[]>('/dashboard/activity/')
  return data
}
