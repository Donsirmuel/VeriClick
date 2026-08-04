export const CONTACT_EMAIL = 'samuel@donlabs.site'
export const COMPANY_NAME = 'DonLabs'
export const COMPANY_URL = 'https://donlabs.site'
export const PRODUCT_NAME = 'VeriClick'

export function contactMailto(subject = 'VeriClick support request'): string {
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}`
}
