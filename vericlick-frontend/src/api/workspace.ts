import { MOCK_MODE, apiClient } from './client'
import { mockFetch } from './mock'

interface Workspace {
  id: string
  name: string
  created_at: string
}

export async function fetchWorkspace(): Promise<Workspace> {
  if (MOCK_MODE) {
    return mockFetch({ id: 'mock-id', name: 'VeriClick Pro', created_at: new Date().toISOString() })
  }
  const { data } = await apiClient.get<Workspace>('/workspace/')
  return data
}

export async function updateWorkspace(name: string): Promise<Workspace> {
  if (MOCK_MODE) {
    return mockFetch({ id: 'mock-id', name, created_at: new Date().toISOString() })
  }
  const { data } = await apiClient.patch<Workspace>('/workspace/', { name })
  return data
}
