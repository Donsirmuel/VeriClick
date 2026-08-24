export const CONTACT_EMAIL = 'support@vericlick.site'
export const COMPANY_NAME = 'MAILIONDEV TECHNOLOGY LTD'
export const COMPANY_URL = 'https://vericlick.cc'
export const PRODUCT_NAME = 'VeriClick'

export function contactMailto(subject = 'VeriClick support request', body?: string): string {
  const params = new URLSearchParams({ subject })
  if (body) params.set('body', body)
  return `mailto:${CONTACT_EMAIL}?${params.toString()}`
}
