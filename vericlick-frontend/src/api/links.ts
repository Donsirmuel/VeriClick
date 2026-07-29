import { MOCK_MODE, apiClient } from './client'
import { mockLinks, createMockLink, mockFetch } from './mock'
import type { TrackingLink, LinkCreateInput, PaginatedResponse } from '@/types'

export async function fetchLinks(params?: {
  search?: string
  status?: string
  page?: number
}): Promise<PaginatedResponse<TrackingLink>> {
  if (MOCK_MODE) {
    return mockFetch({ count: mockLinks.length, next: null, previous: null, results: mockLinks })
  }
  const { data } = await apiClient.get<PaginatedResponse<TrackingLink>>('/links/', { params })
  return data
}

export async function fetchLink(id: string): Promise<TrackingLink> {
  if (MOCK_MODE) {
    const link = mockLinks.find(l => l.id === id)
    if (!link) throw new Error('Link not found')
    return mockFetch(link)
  }
  const { data } = await apiClient.get<TrackingLink>(`/links/${id}/`)
  return data
}

export async function createLink(input: LinkCreateInput): Promise<TrackingLink> {
  if (MOCK_MODE) {
    return mockFetch(createMockLink(input))
  }
  const { data } = await apiClient.post<TrackingLink>('/links/', input)
  return data
}

export async function updateLink(id: string, input: Partial<LinkCreateInput>): Promise<TrackingLink> {
  if (MOCK_MODE) {
    const existing = mockLinks.find(l => l.id === id)
    if (!existing) throw new Error('Link not found')
    return mockFetch({ ...existing, ...input } as TrackingLink)
  }
  const { data } = await apiClient.patch<TrackingLink>(`/links/${id}/`, input)
  return data
}

export async function deleteLink(id: string): Promise<void> {
  if (MOCK_MODE) {
    return
  }
  await apiClient.delete(`/links/${id}/`)
}
