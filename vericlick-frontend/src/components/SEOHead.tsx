import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

const NOINDEX_PATHS = ['/auth/', '/app/']

const SITE_URL = (import.meta.env.VITE_SITE_URL ?? 'https://vericlick.site').replace(/\/+$/, '')

const PAGE_META: Record<string, { title: string; description: string }> = {
  '/': {
    title: 'VeriClick — Protect Your Links From Bots & Suspicious Traffic',
    description:
      'VeriClick checks every click against your IP rules and bot detection before it reaches your page, and explains exactly why each request was flagged. Pick a plan that fits your needs.',
  },
  '/pricing': {
    title: 'Pricing — VeriClick',
    description:
      'Simple monthly plans for VeriClick link protection: Basic, Plus, and Pro. Pick a plan that fits your needs.',
  },
  '/contact': {
    title: 'Contact — VeriClick',
    description: 'Get in touch with the VeriClick team.',
  },
  '/privacy': {
    title: 'Privacy Policy — VeriClick',
    description: 'How VeriClick collects, uses, and protects your data.',
  },
  '/terms': {
    title: 'Terms of Service — VeriClick',
    description: 'The terms that govern your use of VeriClick.',
  },
}

export function SEOHead() {
  const { pathname } = useLocation()

  useEffect(() => {
    if (shouldNoindex(pathname)) {
      addNoindex()
    } else {
      removeNoindex()
    }

    const meta = PAGE_META[pathname]
    if (meta) {
      document.title = meta.title
      setMetaDescription(meta.description)
      setCanonical(`${SITE_URL}${pathname}`)
    }
  }, [pathname])

  return null
}

function shouldNoindex(path: string): boolean {
  return NOINDEX_PATHS.some(p => path.startsWith(p))
}

function addNoindex() {
  let meta = document.querySelector('meta[name="robots"]')
  if (!meta) {
    meta = document.createElement('meta')
    meta.setAttribute('name', 'robots')
    document.head.appendChild(meta)
  }
  meta.setAttribute('content', 'noindex, nofollow')
}

function removeNoindex() {
  const meta = document.querySelector('meta[name="robots"]')
  if (meta) {
    meta.remove()
  }
}

function setMetaDescription(content: string) {
  let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]')
  if (!meta) {
    meta = document.createElement('meta')
    meta.setAttribute('name', 'description')
    document.head.appendChild(meta)
  }
  meta.setAttribute('content', content)
}

function setCanonical(href: string) {
  let link = document.querySelector<HTMLLinkElement>('link[rel="canonical"]')
  if (!link) {
    link = document.createElement('link')
    link.setAttribute('rel', 'canonical')
    document.head.appendChild(link)
  }
  link.setAttribute('href', href)
}
