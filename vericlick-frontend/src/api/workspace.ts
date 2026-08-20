import { apiClient } from './client'
import type { BillingHistory, BillingMode, CheckoutSession, PaymentMethod, Workspace, Domain, RedirectRoute, RedirectDomain, ShieldConfig } from '@/types'

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

export async function fetchDomains(): Promise<Domain[]> {
  const { data } = await apiClient.get<Domain[]>('/domains/')
  return data
}

export async function addDomain(domain: string): Promise<Domain> {
  const { data } = await apiClient.post<Domain>('/domains/', { domain })
  return data
}

export async function deleteDomain(domainId: string): Promise<void> {
  await apiClient.delete(`/domains/${domainId}/`)
}

export interface DashboardDomain {
  domain: string
  registered: boolean
  hasTraffic: boolean
}

export async function fetchDashboardDomains(): Promise<DashboardDomain[]> {
  const { data } = await apiClient.get<DashboardDomain[]>('/dashboard/domains/')
  return data
}

// --- Domain Verification ---

export async function getVerifyChallenge(domainId: string, method: string = 'html_meta'): Promise<{
  method: string
  token: string
  metaTag: string
  dnsName: string
  dnsValue: string
}> {
  const { data } = await apiClient.get(`/domains/${domainId}/verify-challenge/`, {
    params: { method },
  })
  return data
}

export async function confirmVerification(domainId: string): Promise<{
  verified: boolean
  verifiedAt?: string
  healthStatus?: string
  error?: string
  detail?: string
}> {
  const { data } = await apiClient.post(`/domains/${domainId}/verify-confirm/`)
  return data
}

export async function recheckDomain(domainId: string): Promise<{
  healthStatus: string
  lastHealthCheck: string
}> {
  const { data } = await apiClient.post(`/domains/${domainId}/recheck/`)
  return data
}

// --- Redirect Domains ---

export async function fetchRedirectDomains(): Promise<RedirectDomain[]> {
  const { data } = await apiClient.get<RedirectDomain[]>('/redirect-domains/')
  return data
}

export async function addRedirectDomain(domain: string): Promise<RedirectDomain> {
  const { data } = await apiClient.post<RedirectDomain>('/redirect-domains/', { domain })
  return data
}

export async function deleteRedirectDomain(domainId: string): Promise<void> {
  await apiClient.delete(`/redirect-domains/${domainId}/`)
}

// --- Redirect Routes ---

export async function fetchRedirectRoutes(): Promise<RedirectRoute[]> {
  const { data } = await apiClient.get<RedirectRoute[]>('/redirect-routes/')
  return data
}

export async function createRedirectRoute(input: {
  domainId: string
  slug: string
  destinationUrl: string
  botAction?: string
  fallbackUrl?: string
}): Promise<RedirectRoute> {
  const { data } = await apiClient.post<RedirectRoute>('/redirect-routes/', {
    domain_id: input.domainId,
    slug: input.slug,
    destination_url: input.destinationUrl,
    bot_action: input.botAction || 'honeypot',
    fallback_url: input.fallbackUrl || '',
  })
  return data
}

export async function updateRedirectRoute(routeId: string, input: Partial<{
  slug: string
  destinationUrl: string
  botAction: string
  fallbackUrl: string
  isActive: boolean
}>): Promise<RedirectRoute> {
  const payload: Record<string, unknown> = {}
  if (input.slug !== undefined) payload.slug = input.slug
  if (input.destinationUrl !== undefined) payload.destination_url = input.destinationUrl
  if (input.botAction !== undefined) payload.bot_action = input.botAction
  if (input.fallbackUrl !== undefined) payload.fallback_url = input.fallbackUrl
  if (input.isActive !== undefined) payload.is_active = input.isActive
  const { data } = await apiClient.patch<RedirectRoute>(`/redirect-routes/${routeId}/`, payload)
  return data
}

export async function deleteRedirectRoute(routeId: string): Promise<void> {
  await apiClient.delete(`/redirect-routes/${routeId}/`)
}

export async function renewRedirectRoute(routeId: string): Promise<{ expiresAt: string; isActive: boolean }> {
  const { data } = await apiClient.post(`/redirect-routes/${routeId}/renew/`)
  return data
}

// --- Test Installation ---

export async function testInstallation(domainId: string): Promise<{
  installed: boolean
  hasScriptTag?: boolean
  hasInitCall?: boolean
  domain?: string
  error?: string
}> {
  const { data } = await apiClient.post('/test-installation/', { domain_id: domainId })
  return data
}

// --- Onboarding ---

export async function completeOnboarding(type: 'shield' | 'redirect', domain: string): Promise<{
  domain: { id: string; domain: string; purpose: string }
  workspace: Workspace
}> {
  const { data } = await apiClient.post('/workspace/onboarding/', { type, domain })
  return data
}

export async function fetchSnippet(domain: string): Promise<{
  snippet: string
  domain: string
  apiKey: string
  apiBase: string
}> {
  const { data } = await apiClient.get('/workspace/snippet/', { params: { domain } })
  return data
}

export async function updateShieldConfig(payload: {
  protectionMode: string
  botAction: string
  rateLimitPerHour: number
  protectedPaths: string[]
  blockedPaths: string[]
}): Promise<ShieldConfig> {
  const { data } = await apiClient.patch<ShieldConfig>('/workspace/shield-config/', payload)
  return data
}
