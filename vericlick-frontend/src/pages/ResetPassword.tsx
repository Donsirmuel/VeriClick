import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { HugeiconsIcon } from '@hugeicons/react'
import { LockIcon, ArrowRight01Icon, ViewIcon, ViewOffIcon } from '@hugeicons/core-free-icons'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { Logo } from '@/components/Logo'
import { resetPassword } from '@/api/auth'
import { parseApiError } from '@/lib/errors'

export default function ResetPassword() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const uid = searchParams.get('uid')
  const token = searchParams.get('token')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!uid || !token) {
      toast.error('Invalid reset link')
      return
    }
    setLoading(true)
    try {
      await resetPassword(Number(uid), token, password)
      toast.success('Password reset successfully')
      navigate('/auth/login')
    } catch (err) {
      toast.error(parseApiError(err))
    } finally {
      setLoading(false)
    }
  }

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
          <h1 className="text-3xl font-bold text-white mb-2">Set new password</h1>
          <p className="text-neutral-400">Must be at least 8 characters.</p>
        </div>

        <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-8">
          {!uid || !token ? (
            <div className="text-center py-4">
              <p className="text-error font-bold mb-4">Invalid or expired reset link.</p>
              <Link to="/auth/forgot-password" className="text-white hover:text-neutral-300 font-bold text-sm transition-colors">
                Request a new reset link
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-300 ml-1">New password</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-neutral-500 group-focus-within:text-white transition-colors">
                    <HugeiconsIcon icon={LockIcon} className="w-5 h-5" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={8}
                    placeholder="Min 8 characters"
                    className="w-full bg-black border border-neutral-800 rounded-xl pl-12 pr-12 py-3 text-white focus:outline-none focus:border-white/50 focus:ring-1 focus:ring-white/10 transition-all placeholder:text-neutral-600"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-4 flex items-center text-neutral-500 hover:text-white transition-colors"
                  >
                    <HugeiconsIcon icon={showPassword ? ViewOffIcon : ViewIcon} className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-white hover:bg-neutral-200 text-black font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 transition-all group disabled:opacity-50"
              >
                {loading ? 'Resetting...' : (
                  <>
                    Reset password
                    <HugeiconsIcon icon={ArrowRight01Icon} className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>
            </form>
          )}
        </div>

        <div className="mt-6 text-center">
          <Link to="/auth/login" className="text-sm text-neutral-400 hover:text-white transition-colors">
            Back to sign in
          </Link>
        </div>
      </div>
    </div>
  )
}
