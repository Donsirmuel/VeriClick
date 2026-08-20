export type TimeRange = '7d' | '30d' | '90d'
export type BillingMode = 'subscription' | 'period'
export type PaymentMethod = 'card' | 'crypto' | 'bank_transfer' | 'mobile_money'
export type CountryRuleAction = 'allow' | 'deny'
export type BotAction = 'safe' | 'not_found' | 'block'
export type DeviceClass = 'mobile' | 'tablet' | 'desktop' | 'bot' | 'other'

export interface DashboardStats {
  totalVisits24h: number
  clicksTrend: number | null
  botsBlocked: number
  blocked: number
  allowed: number
  botTrafficPercentage: number
  protectionMode: string
  botAction: string
}

export interface TrafficData {
  date: string
  human: number
  bot: number
}

export interface ActivityEntry {
  id: string
  ip: string
  reason: string | null
  reasonLabel: string
  verdict: string
  pageUrl: string
  referrer: string
  isBot: boolean
  botScore: number
  botVerdict: string
  createdAt: string
}

export interface Workspace {
  id: string
  name: string
  trackerSecret: string
  safeDestination: string
  plan: string | null
  planName: string | null
  planBillingMode: BillingMode | null
  planExpiresAt: string | null
  planStatus: 'active' | 'grace' | 'suspended' | 'none' | null
  graceExpiresAt: string | null
  trialExpiresAt: string | null
  trialActive: boolean
  domainsUsed: number
  domainLimit: number
  onboardingComplete: boolean
  onboardingType: 'shield' | 'redirect' | null
}

export interface Domain {
  id: string
  domain: string
  purpose: 'protection' | 'redirect'
  verificationMethod: 'html_meta' | 'dns_txt' | null
  verified: boolean
  verifiedAt: string | null
  healthStatus: 'healthy' | 'unhealthy' | 'unknown'
  lastHealthCheck: string | null
  scriptInstalled: boolean
  isActive: boolean
  createdAt: string
}

export interface InstallToken {
  id: string
  tokenPrefix: string
  label: string
  isActive: boolean
  lastUsedAt: string | null
  createdAt: string
}

export interface RedirectRoute {
  id: string
  domain: { id: string; domain: string }
  slug: string
  destinationUrl: string
  isActive: boolean
  botAction: 'honeypot' | 'block'
  fallbackUrl: string | null
  expiresAt: string | null
  clicksCount: number
  abuseStatus: 'none' | 'flagged' | 'blocked'
  destinationSafe: boolean | null
  createdAt: string
}

export interface RedirectDomain {
  id: string
  domain: string
  purpose: 'redirect'
  verified: boolean
  verifiedAt: string | null
  healthStatus: string
  isActive: boolean
  createdAt: string
}

export interface Plan {
  code: string
  name: string
  monthlyPrice: number
  domainLimit: number
  features: string[]
  sortOrder: number
}

export interface PricingResponse {
  plans: Plan[]
}

export interface CheckoutSession {
  checkoutId: string
  checkoutUrl: string
  expiresAt?: string | null
  plan: string
}

export interface BillingEvent {
  id: string
  kind: string
  label: string
  planName: string | null
  amount: number | null
  currency: string
  occurredAt: string
  chargeId: string | null
  checkoutId: string | null
  note: string | null
  data: Record<string, unknown>
}

export interface BillingHistory {
  subscription: {
    status: 'active' | 'grace' | 'suspended' | 'none'
    active: boolean
    plan: string | null
    planName: string | null
    mode: BillingMode | null
    startedAt: string | null
    expiresAt: string | null
    graceExpiresAt: string | null
    nextRenewalAt: string | null
    trialActive: boolean
    trialExpiresAt: string | null
  }
  events: BillingEvent[]
}

export interface SiteConfig {
  signupsOpen: boolean
}

export interface DiscountCodeValidation {
  valid: boolean
  code?: string
  discountPercent?: number
}

export interface AuthUser {
  id: number
  email: string
  username: string
}

export interface PaginatedResponse<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

export type IPRuleAction = 'allow' | 'deny'

export interface IPRule {
  id: string
  ipOrCidr: string
  action: IPRuleAction
  reason: string
  expiresAt: string | null
  isActive: boolean
  source: 'manual' | 'auto'
  createdBy: number | null
  createdByUsername: string | null
  createdAt: string
  updatedAt: string
}

export interface IPRuleCreateInput {
  ipOrCidr: string
  action: IPRuleAction
  reason?: string
  expiresAt?: string | null
  isActive?: boolean
}

export interface BlockedIPEntry {
  id: string
  ip: string
  reason: string
  reasonLabel: string
  decision: 'blocked'
  isBot: boolean
  pageUrl: string
  country: string
  verdict: string
  createdAt: string
}

export interface CountryRule {
  id: string
  countryCode: string
  action: CountryRuleAction
  reason: string
  isActive: boolean
  source: 'manual' | 'auto'
  createdBy: number | null
  createdByUsername: string | null
  createdAt: string
  updatedAt: string
}

export interface CountryRuleCreateInput {
  countryCode: string
  action: CountryRuleAction
  reason?: string
  isActive?: boolean
}

export interface DevicePolicy {
  allowedDeviceClasses: DeviceClass[]
  blockedOsFamilies: string[]
  updatedAt: string
}

export interface DevicePolicyUpdateInput {
  allowedDeviceClasses?: DeviceClass[]
  blockedOsFamilies?: string[]
}

export interface BreakdownRow {
  key: string
  label: string
  total: number
  blocked: number
}

export interface ShieldConfig {
  id: string
  protectionMode: 'strict' | 'balanced' | 'monitor'
  botAction: 'block' | 'honeypot' | 'log'
  protectedPaths: string[]
  blockedPaths: string[]
  rateLimitPerHour: number
  updatedAt: string
}

export interface ShieldVerifyResponse {
  verdict: 'allow' | 'block' | 'challenge'
  isBot: boolean
  reason: string
  reasonLabel: string
}

export interface TrackerEventSignals {
  userAgent: string
  language: string
  cookiesEnabled: boolean
  timezone: string
  touchSupport: boolean
  screenDepth: number | null
  plugins: number
  viewport: { width: number; height: number }
  canvasHash: string
  trajectory: {
    straightness: number
    speed_var: number
    curvature_entropy: number
    teleports: number
    event_count: number
    max_jump: number
  }
  clickMetrics: {
    dwell_avg: number
    timing_var: number
    click_count: number
  }
}

export interface TrackerEvent {
  id: string
  workspace: string
  pageUrl: string
  referrer: string
  signals: TrackerEventSignals
  engagement: {
    moves: number
    clicks: number
    scrollDepth: number
    timeOnPage: number
  }
  ip: string
  userAgent: string
  verdict: string
  isBot: boolean
  reason: string
  canvasHash: string
  trajectory: Record<string, unknown>
  ja4Hash: string
  botScore: number
  botVerdict: string
  createdAt: string
}
