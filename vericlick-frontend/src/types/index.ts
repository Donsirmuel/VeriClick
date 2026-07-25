export type HealthStatus = 'healthy' | 'degraded' | 'blacklisted'
export type LinkStatus = 'active' | 'paused'
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
  id: number
  ip: string
  country: string
  device: string
  reason: string | null
  time: string
  slug: string
  isBot: boolean
}

export interface TrackingLink {
  id: number
  slug: string
  destinationUrl: string
  domain: string
  domainHealth: HealthStatus
  totalClicks: number
  botClicks: number
  status: LinkStatus
  createdAt: string
}

export interface LinkCreateInput {
  slug: string
  destinationUrl: string
  domain: string
  status: LinkStatus
}

export interface Domain {
  id: number
  domain: string
  healthStatus: HealthStatus
  lastChecked: string
  linksCount: number
  createdAt: string
}

export interface AuthUser {
  id: number
  email: string
  name: string
}
