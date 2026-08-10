import { apiClient } from './client'
import type { Workspace, CheckoutSession } from '@/types'

interface WorkspaceUpdateInput {
  name?: string
  safeDestination?: string
}

export async function fetchWorkspace(): Promise<Workspace> {
  const { data } = await apiClient.get<Workspace>('/workspace/')
  return data
}

export async function updateWorkspace(input: WorkspaceUpdateInput): Promise<Workspace> {
  const { data } = await apiClient.patch<Workspace>('/workspace/', input)
  return data
}

export async function startCheckout(planCode: string): Promise<CheckoutSession> {
  const { data } = await apiClient.post<CheckoutSession>('/upgrade/', { plan_code: planCode })
  return data
}
