import { MOCK_MODE, apiClient } from './client'
import { mockDashboardStats, mockTrafficData, mockActivity, mockFetch } from './mock'
import type { DashboardStats, TrafficData, ActivityEntry, TimeRange } from '@/types'

export async function fetchDashboardStats(): Promise<DashboardStats> {
  if (MOCK_MODE) {
    return mockFetch(mockDashboardStats)
  }
  const { data } = await apiClient.get<DashboardStats>('/dashboard/stats/')
  return data
}

export async function fetchTrafficData(range: TimeRange): Promise<TrafficData[]> {
  if (MOCK_MODE) {
    return mockFetch(mockTrafficData[range])
  }
  const { data } = await apiClient.get<TrafficData[]>('/dashboard/traffic/', {
    params: { range },
  })
  return data
}

export async function fetchActivity(): Promise<ActivityEntry[]> {
  if (MOCK_MODE) {
    return mockFetch(mockActivity)
  }
  const { data } = await apiClient.get<ActivityEntry[]>('/dashboard/activity/')
  return data
}
