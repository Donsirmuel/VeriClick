import { apiClient } from './client'
import type { PricingResponse, DiscountCodeValidation } from '@/types'

export async function fetchPricing(): Promise<PricingResponse> {
  const { data } = await apiClient.get<PricingResponse>('/pricing/')
  return data
}

export async function validateDiscountCode(code: string): Promise<DiscountCodeValidation> {
  const { data } = await apiClient.post<DiscountCodeValidation>('/discount-codes/validate/', { code })
  return data
}