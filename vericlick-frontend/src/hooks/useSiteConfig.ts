import { useQuery } from '@tanstack/react-query'
import { fetchSiteConfig } from '@/api/siteConfig'
import type { SiteConfig } from '@/types'

export function useSiteConfig() {
  return useQuery<SiteConfig>({
    queryKey: ['siteConfig'],
    queryFn: fetchSiteConfig,
    staleTime: 60_000,
  })
}