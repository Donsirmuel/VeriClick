export type HealthStatus = 'healthy' | 'degraded' | 'blacklisted'
export type LinkStatus = 'active' | 'paused' | 'disabled'
export type TimeRange = '7d' | '30d' | '90d'

export interface DashboardStats {
  totalClicks24h: number
  botTrafficBlocked: number
  blocked: number
  challenged: number
  allowed: number
  botTrafficPercentage: number
  activeLinks: number
  domainsHealthy: number
  domainsDegraded: number
  domainsBlacklisted: number
  lastDomainScan: string | null
}

export interface TrafficData {
  date: string
  human: number
  bot: number
}

export interface ActivityEntry {
  id: string
  ip: string
  country: string
  region: string
  city: string
  device: string
  reason: string | null
  time: string
  slug: string
  isBot: boolean
}

export interface TrackingLink {
  id: string
  slug: string
  destinationUrl: string
  domain: string | null
  domainHealth: HealthStatus | null
  trackingUrl: string
  totalClicks: number
  botClicks: number
  status: LinkStatus
  createdAt: string
}

export interface LinkCreateInput {
  slug: string
  destinationUrl: string
  domain?: string | null
  status?: LinkStatus
}

export interface Domain {
  id: string
  domain: string
  healthStatus: HealthStatus
  verified: boolean
  lastChecked: string | null
  linksCount: number
  createdAt: string
}

export interface Workspace {
  id: string
  name: string
  trackerSecret: string
  safeDestination: string
  lastDomainScanAt: string | null
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
  decision: 'blocked'
  isBot: boolean
  matchedRule: string
  slug: string
  country: string
  region: string
  city: string
  createdAt: string
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
  createdAt: string
}
