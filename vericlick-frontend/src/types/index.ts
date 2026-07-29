export type HealthStatus = 'healthy' | 'degraded' | 'blacklisted'
export type LinkStatus = 'active' | 'paused' | 'disabled'
export type TimeRange = '7d' | '30d' | '90d'

export interface DashboardStats {
  totalClicks24h: number
  botTrafficBlocked: number
  botTrafficPercentage: number
  activeLinks: number
  domainsHealthy: number
  domainsDegraded: number
  domainsBlacklisted: number
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
  lastChecked: string | null
  linksCount: number
  createdAt: string
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
