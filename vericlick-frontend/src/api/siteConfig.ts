import { apiClient } from './client'
import type { SiteConfig } from '@/types'

export async function fetchSiteConfig(): Promise<SiteConfig> {
  const { data } = await apiClient.get<SiteConfig>('/site-config/')
  return data
}
