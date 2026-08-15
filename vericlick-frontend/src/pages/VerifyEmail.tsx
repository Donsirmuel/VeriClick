import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { HugeiconsIcon } from '@hugeicons/react'
import { Cancel01Icon } from '@hugeicons/core-free-icons'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Logo } from '@/components/Logo'
import { verifyEmail } from '@/api/auth'
import { parseApiError } from '@/lib/errors'
import { notifyAuthChanged } from '@/hooks/useAuth'

export default function VerifyEmail() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const uid = searchParams.get('uid')
  const token = searchParams.get('token')
  const [state, setState] = useState<'loading' | 'success' | 'error'>('loading')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!uid || !token) {
      setState('error')
      setError('This verification link is incomplete. Please sign up again or request a new link.')
      return
    }
    let cancelled = false
    ;(async () => {
      try {
        const res = await verifyEmail(uid, token)
        if (cancelled) return
        localStorage.setItem('token', res.access)
        localStorage.setItem('refresh', res.refresh)
        notifyAuthChanged()
        toast.success('Email verified — welcome to VeriClick!')
        navigate('/app/dashboard', { replace: true })
      } catch (err) {
        if (cancelled) return
        setState('error')
        setError(parseApiError(err))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [uid, token, navigate])

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <Link to="/" className="inline-flex items-center gap-2.5 mb-8 group">
            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
              <Logo variant="dark" className="w-6 h-6" />
            </div>
            <span className="text-2xl font-bold tracking-tight text-white">VeriClick</span>
          </Link>
        </div>

        <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-6 sm:p-8">
          {state === 'loading' && (
            <div className="text-center py-8">
              <div className="w-12 h-12 border-2 border-neutral-700 border-t-white rounded-full animate-spin mx-auto mb-6" />
              <h1 className="text-xl font-bold text-white mb-2">Verifying your email</h1>
              <p className="text-neutral-400 text-sm">Almost there...</p>
            </div>
          )}

          {state === 'error' && (
            <div className="text-center py-4">
              <div className="w-14 h-14 bg-red-950/40 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <HugeiconsIcon icon={Cancel01Icon} className="w-8 h-8 text-red-400" />
              </div>
              <h1 className="text-xl font-bold text-white mb-3">We couldn't verify your email</h1>
              <p className="text-neutral-400 text-sm leading-relaxed mb-8">{error}</p>
              <Link
                to="/auth/login"
                className="w-full bg-white hover:bg-neutral-200 text-black font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 transition-all"
              >
                Go to sign in
              </Link>
              <div className="mt-5 text-center">
                <Link to="/auth/register" className="text-sm text-neutral-500 hover:text-white transition-colors">
                  Create a new account
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
