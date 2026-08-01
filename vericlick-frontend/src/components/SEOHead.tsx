import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

const NOINDEX_PATHS = ['/auth/', '/app/']

export function SEOHead() {
  const { pathname } = useLocation()

  useEffect(() => {
    if (shouldNoindex(pathname)) {
      addNoindex()
    } else {
      removeNoindex()
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
