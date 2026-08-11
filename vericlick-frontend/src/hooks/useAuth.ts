import { useEffect, useState } from 'react'

function hasToken(): boolean {
  return Boolean(localStorage.getItem('token'))
}

// Notify any mounted useAuth consumers that the auth state changed
// (login, sign out, token refresh failure). Same-tab complement to the
// cross-tab `storage` event.
export function notifyAuthChanged() {
  window.dispatchEvent(new Event('vericlick:auth'))
}

// Reactive "is the user signed in" flag. Backed by localStorage (the same
// source the API client and route guards use), and refreshed whenever the
// storage changes — so the landing page nav and CTAs switch between
// "Log in / Get Started" and "Dashboard" without a reload.
export function useAuth() {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(hasToken)

  useEffect(() => {
    const update = () => setIsLoggedIn(hasToken())
    window.addEventListener('storage', update)
    window.addEventListener('vericlick:auth', update)
    return () => {
      window.removeEventListener('storage', update)
      window.removeEventListener('vericlick:auth', update)
    }
  }, [])

  return { isLoggedIn }
}
