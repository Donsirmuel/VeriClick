import { apiClient } from './client'

export async function reportAbuse(data: {
  slug?: string
  destinationUrl?: string
  reporterEmail?: string
  reason?: string
}): Promise<void> {
  await apiClient.post('/abuse/report/', {
    slug: data.slug || '',
    destination_url: data.destinationUrl || '',
    reporter_email: data.reporterEmail || '',
    reason: data.reason || '',
  })
}

export async function checkSafeBrowsing(url: string): Promise<{
  safe: boolean
  detail?: string
  threats?: string[]
}> {
  const { data } = await apiClient.post<{ safe: boolean; detail?: string; threats?: string[] }>(
    '/safety/check/',
    { url },
  )
  return data
}
