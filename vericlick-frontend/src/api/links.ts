import { apiClient } from './client'
import type { TrackingLink, LinkCreateInput, PaginatedResponse } from '@/types'

function normalizeTrackingUrl(url: string): string {
  if (!url) return url
  if (/^https?:\/\//i.test(url)) return url
  if (typeof window === 'undefined') return url

  const apiBase = apiClient.defaults.baseURL || window.location.origin
  try {
    return new URL(url, new URL(apiBase, window.location.origin).origin).toString()
  } catch {
    return new URL(url, window.location.origin).toString()
  }
}

function normalizeLink(link: TrackingLink): TrackingLink {
  return {
    ...link,
    trackingUrl: normalizeTrackingUrl(link.trackingUrl),
  }
}

function normalizePage(page: PaginatedResponse<TrackingLink>): PaginatedResponse<TrackingLink> {
  return {
    ...page,
    results: page.results.map(normalizeLink),
  }
}

export async function fetchLinks(params?: {
  search?: string
  status?: string
  page?: number
}): Promise<PaginatedResponse<TrackingLink>> {
  const { data } = await apiClient.get<PaginatedResponse<TrackingLink>>('/links/', { params })
  return normalizePage(data)
}

export async function fetchLink(id: string): Promise<TrackingLink> {
  const { data } = await apiClient.get<TrackingLink>(`/links/${id}/`)
  return normalizeLink(data)
}

export async function createLink(input: LinkCreateInput): Promise<TrackingLink> {
  const { data } = await apiClient.post<TrackingLink>('/links/', input)
  return normalizeLink(data)
}

export async function updateLink(id: string, input: Partial<LinkCreateInput>): Promise<TrackingLink> {
  const { data } = await apiClient.patch<TrackingLink>(`/links/${id}/`, input)
  return normalizeLink(data)
}

export async function deleteLink(id: string): Promise<void> {
  await apiClient.delete(`/links/${id}/`)
}
