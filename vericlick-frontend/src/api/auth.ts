import { MOCK_MODE, apiClient } from './client'
import { mockFetch } from './mock'
import type { AuthUser } from '@/types'

interface LoginResponse {
  access: string
  refresh: string
}

export async function login(username: string, password: string): Promise<LoginResponse> {
  if (MOCK_MODE) {
    return mockFetch({ access: 'mock-token', refresh: 'mock-refresh' })
  }
  const { data } = await apiClient.post<LoginResponse>('/auth/login/', { username, password })
  return data
}

export async function register(username: string, email: string, password: string): Promise<AuthUser> {
  if (MOCK_MODE) {
    return mockFetch({ id: Date.now(), username, email })
  }
  const { data } = await apiClient.post<AuthUser>('/auth/register/', { username, email, password })
  return data
}

export async function refreshToken(refresh: string): Promise<{ access: string }> {
  const { data } = await apiClient.post<{ access: string }>('/auth/refresh/', { refresh })
  return data
}

export async function forgotPassword(email: string): Promise<{ token?: string; uid?: number }> {
  if (MOCK_MODE) {
    return mockFetch({ token: 'mock-reset-token', uid: 1 })
  }
  const { data } = await apiClient.post('/auth/password-reset/', { email })
  return data
}

export async function resetPassword(uid: number, token: string, password: string): Promise<{ status: string }> {
  if (MOCK_MODE) {
    return mockFetch({ status: 'ok' })
  }
  const { data } = await apiClient.post('/auth/password-reset/confirm/', { uid, token, password })
  return data
}

export async function fetchMe(): Promise<AuthUser> {
  if (MOCK_MODE) {
    return mockFetch({ id: 1, username: 'Operator', email: 'admin@vericlick.io' })
  }
  const { data } = await apiClient.get<AuthUser>('/auth/me/')
  return data
}

export async function googleLogin(idToken: string): Promise<LoginResponse> {
  if (MOCK_MODE) {
    return mockFetch({ access: 'mock-token', refresh: 'mock-refresh' })
  }
  const { data } = await apiClient.post<LoginResponse>('/auth/google/', { id_token: idToken })
  return data
}
