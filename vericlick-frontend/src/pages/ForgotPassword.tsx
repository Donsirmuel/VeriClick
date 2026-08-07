import { Link } from 'react-router-dom'
import { HugeiconsIcon } from '@hugeicons/react'
import { Mail01Icon, ArrowRight01Icon } from '@hugeicons/core-free-icons'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { Logo } from '@/components/Logo'
import { forgotPassword } from '@/api/auth'
import { parseApiError } from '@/lib/errors'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await forgotPassword(email)
      setSent(true)
      toast.success('Reset link sent if this email is registered')
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
          <h1 className="text-3xl font-bold text-white mb-2">Reset your password</h1>
          <p className="text-neutral-400">Enter your email and we'll send you a reset link.</p>
        </div>

        <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-6 sm:p-8">
          {sent ? (
            <div className="text-center py-4">
              <div className="w-14 h-14 bg-white/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <HugeiconsIcon icon={Mail01Icon} className="w-6 h-6 text-white" />
              </div>
              <p className="text-white font-bold mb-2">Check your inbox</p>
              <p className="text-sm text-neutral-400 mb-6">
                If an account with <span className="text-white">{email}</span> exists, we've sent a password reset link.
              </p>
              <Link to="/auth/login" className="text-white hover:text-neutral-300 font-bold text-sm transition-colors">
                Back to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-300 ml-1">Email address</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-neutral-500 group-focus-within:text-white transition-colors">
                    <HugeiconsIcon icon={Mail01Icon} className="w-5 h-5" />
                  </div>
                  <input
                    type="email"
                    required
                    placeholder="name@company.com"
                    className="w-full bg-black border border-neutral-800 rounded-xl pl-12 pr-4 py-3 text-white focus:outline-none focus:border-white/50 focus:ring-1 focus:ring-white/10 transition-all placeholder:text-neutral-600"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-white hover:bg-neutral-200 text-black font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 transition-all group disabled:opacity-50"
              >
                {loading ? 'Sending...' : (
                  <>
                    Send reset link
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
