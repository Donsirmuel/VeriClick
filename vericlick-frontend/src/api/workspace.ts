import { MOCK_MODE, apiClient } from './client'
import { mockFetch } from './mock'
import type { Workspace } from '@/types'

interface WorkspaceUpdateInput {
  name?: string
  safeDestination?: string
}

export async function fetchWorkspace(): Promise<Workspace> {
  if (MOCK_MODE) {
    return mockFetch<Workspace>({
      id: 'mock-id',
      name: 'VeriClick Pro',
      trackerSecret: 'mock-secret',
      safeDestination: '',
      lastDomainScanAt: '2026-07-22T06:10:00Z',
    })
  }
  const { data } = await apiClient.get<Workspace>('/workspace/')
  return data
}

export async function updateWorkspace(input: WorkspaceUpdateInput): Promise<Workspace> {
  if (MOCK_MODE) {
    return mockFetch<Workspace>({
      id: 'mock-id',
      name: input.name ?? 'VeriClick Pro',
      trackerSecret: 'mock-secret',
      safeDestination: input.safeDestination ?? '',
      lastDomainScanAt: '2026-07-22T06:10:00Z',
    })
  }
  const { data } = await apiClient.patch<Workspace>('/workspace/', input)
  return data
}
