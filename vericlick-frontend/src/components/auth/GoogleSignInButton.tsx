import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import toast from 'react-hot-toast'
import { googleLogin } from '@/api/auth'

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: {
            client_id: string
            callback: (response: { credential: string }) => void
          }) => void
          renderButton: (element: HTMLElement, config: Record<string, unknown>) => void
        }
      }
    }
  }
}

let gsiScriptPromise: Promise<boolean> | null = null

function loadGsiScript(): Promise<boolean> {
  if (gsiScriptPromise) return gsiScriptPromise
  if (typeof window !== 'undefined' && window.google?.accounts?.id) {
    gsiScriptPromise = Promise.resolve(true)
    return gsiScriptPromise
  }
  gsiScriptPromise = new Promise((resolve) => {
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.defer = true
    script.onload = () => resolve(true)
    script.onerror = () => resolve(false)
    document.head.appendChild(script)
  })
  return gsiScriptPromise
}

let initializedClientId: string | null = null

type CredentialHandler = (credential: string) => void
let credentialHandler: CredentialHandler | null = null

function ensureInitialized(clientId: string) {
  if (!window.google || initializedClientId === clientId) return
  window.google.accounts.id.initialize({
    client_id: clientId,
    callback: (response: { credential: string }) => {
      credentialHandler?.(response.credential)
    },
  })
  initializedClientId = clientId
}

function GoogleSvg() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden>
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  )
}

export function GoogleSignInButton() {
  const buttonRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)

  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID

  useEffect(() => {
    if (!clientId) return

    const handler: CredentialHandler = (credential) => {
      setLoading(true)
      googleLogin(credential)
        .then((res) => {
          localStorage.setItem('token', res.access)
          localStorage.setItem('refresh', res.refresh)
          toast.success('Signed in with Google')
          navigate('/app/dashboard')
        })
        .catch(() => toast.error('Google sign-in failed'))
        .finally(() => setLoading(false))
    }
    credentialHandler = handler

    let mounted = true
    let observer: ResizeObserver | null = null

    const renderButton = () => {
      const el = buttonRef.current
      if (!mounted || !el || !window.google) return
      ensureInitialized(clientId)
      const width = Math.round(Math.min(Math.max(el.clientWidth, 100), 400))
      window.google.accounts.id.renderButton(el, {
        theme: 'outline',
        size: 'large',
        width,
        text: 'signin_with',
        shape: 'rectangular',
        logo_alignment: 'center',
      })
    }

    loadGsiScript().then((ok) => {
      if (!ok || !mounted) return
      renderButton()
      if (typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver(renderButton)
        if (buttonRef.current) observer.observe(buttonRef.current)
      }
    })

    return () => {
      mounted = false
      observer?.disconnect()
      if (credentialHandler === handler) credentialHandler = null
    }
  }, [clientId, navigate])

  return (
    <div className="relative">
      {loading && (
        <div className="absolute inset-0 bg-white/60 rounded-xl z-10 flex items-center justify-center">
          <span className="text-sm text-black font-medium">Connecting...</span>
        </div>
      )}
      {clientId ? (
        <div ref={buttonRef} className="w-full flex justify-center" />
      ) : (
        <button
          type="button"
          onClick={() => toast.error('Google sign-in is not configured. Set VITE_GOOGLE_CLIENT_ID in .env')}
          className="w-full flex items-center justify-center gap-3 bg-white hover:bg-neutral-100 text-neutral-700 font-medium py-3 px-4 rounded-xl border border-neutral-300 transition-colors"
        >
          <GoogleSvg />
          Sign in with Google
        </button>
      )}
    </div>
  )
}
