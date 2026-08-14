import { apiClient } from './client'
import type {
  CountryRule, CountryRuleCreateInput, DevicePolicy,
  DevicePolicyUpdateInput, PaginatedResponse,
} from '@/types'

export async function fetchCountryRules(): Promise<PaginatedResponse<CountryRule>> {
  const { data } = await apiClient.get<PaginatedResponse<CountryRule>>('/country-rules/')
  return data
}

export async function createCountryRule(input: CountryRuleCreateInput): Promise<CountryRule> {
  const { data } = await apiClient.post<CountryRule>('/country-rules/', input)
  return data
}

export async function updateCountryRule(id: string, input: Partial<CountryRuleCreateInput>): Promise<CountryRule> {
  const { data } = await apiClient.patch<CountryRule>(`/country-rules/${id}/`, input)
  return data
}

export async function deleteCountryRule(id: string): Promise<void> {
  await apiClient.delete(`/country-rules/${id}/`)
}

export async function fetchDevicePolicy(): Promise<DevicePolicy> {
  const { data } = await apiClient.get<DevicePolicy>('/device-policy/')
  return data
}

export async function updateDevicePolicy(input: DevicePolicyUpdateInput): Promise<DevicePolicy> {
  const { data } = await apiClient.patch<DevicePolicy>('/device-policy/', input)
  return data
}
