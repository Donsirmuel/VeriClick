import { apiClient } from './client'
import type { BillingHistory, BillingMode, CheckoutSession, PaymentMethod, Workspace } from '@/types'

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

export async function startCheckout(
  planCode: string,
  billingMode?: BillingMode,
  paymentMethods?: PaymentMethod[],
): Promise<CheckoutSession> {
  const { data } = await apiClient.post<CheckoutSession>('/upgrade/', {
    plan_code: planCode,
    billing_mode: billingMode,
    payment_methods: paymentMethods,
  })
  return data
}

export async function fetchBillingHistory(): Promise<BillingHistory> {
  const { data } = await apiClient.get<BillingHistory>('/workspace/billing-history/')
  return data
}
