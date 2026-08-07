import { Link, useNavigate } from 'react-router-dom'
import { HugeiconsIcon } from '@hugeicons/react'
import { Mail01Icon, LockIcon, ArrowRight01Icon, UserIcon, ViewIcon, ViewOffIcon } from '@hugeicons/core-free-icons'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { Logo } from '@/components/Logo'
import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton'
import { register, login } from '@/api/auth'
import { parseApiError } from '@/lib/errors'

export default function Register() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await register(name, email, password)
      const res = await login(email, password)
      localStorage.setItem('token', res.access)
      localStorage.setItem('refresh', res.refresh)
      navigate('/app/dashboard')
    } catch (err) {
      toast.error(parseApiError(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-black flex">
      <div className="hidden lg:flex flex-col justify-center px-16 relative">
        <div className="absolute inset-0 hero-grid-bg opacity-30 pointer-events-none" />
        <div className="scan-line pointer-events-none" />
        <div className="relative z-10">
          <div className="mb-12">
            <Link to="/" className="inline-block">
              <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-white/10 hover:scale-105 transition-transform">
                <Logo variant="dark" className="w-8 h-8" />
              </div>
            </Link>
            <h2 className="text-4xl font-bold mb-4 leading-tight text-white">
              Protect your traffic<br />in under 2 minutes.
            </h2>
            <p className="text-neutral-400 text-lg leading-relaxed max-w-md">
              Add a domain, prove you own it, create your first link — you'll be set up in minutes.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {[
              { value: 'Your rules', label: 'IP allow & deny lists' },
              { value: 'Your domain', label: 'DNS ownership proof' },
              { value: 'Explained', label: 'Every decision logged' },
              { value: 'In-app', label: 'Health checks built in' },
            ].map((stat) => (
              <div key={stat.label} className="bg-black/60 backdrop-blur-sm rounded-xl border border-neutral-800 p-4">
                <div className="text-lg font-bold text-white mb-1">{stat.value}</div>
                <div className="text-xs text-neutral-500">{stat.label}</div>
              </div>
            ))}
          </div>

          <div className="mt-8 flex items-center gap-6 text-sm text-neutral-500">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-white" />
              <span>No credit card required</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full bg-white" />
              <span>Free during beta</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md">
          <div className="text-center mb-10 lg:hidden">
            <Link to="/" className="inline-flex items-center gap-2.5 mb-6 group">
              <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center group-hover:scale-110 transition-transform">
                <Logo variant="dark" className="w-6 h-6" />
              </div>
              <span className="text-2xl font-bold tracking-tight text-white">VeriClick</span>
            </Link>
          </div>

          <div className="mb-8">
            <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-white transition-colors mb-6">
              <span aria-hidden>←</span> Back to home
            </Link>
            <h1 className="text-3xl font-bold text-white mb-2">Create your account</h1>
            <p className="text-neutral-400">Start protecting your traffic in minutes.</p>
          </div>

          <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-6 sm:p-8">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-300 ml-1">Username</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-neutral-500 group-focus-within:text-white transition-colors">
                    <HugeiconsIcon icon={UserIcon} className="w-5 h-5" />
                  </div>
                  <input
                    type="text"
                    required
                    placeholder="your-username"
                    className="w-full bg-black border border-neutral-800 rounded-xl pl-12 pr-4 py-3 text-white focus:outline-none focus:border-white/50 focus:ring-1 focus:ring-white/10 transition-all placeholder:text-neutral-600"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
              </div>

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

              <div className="space-y-2">
                <label className="text-sm font-medium text-neutral-300 ml-1">Password</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-neutral-500 group-focus-within:text-white transition-colors">
                    <HugeiconsIcon icon={LockIcon} className="w-5 h-5" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
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

              <div className="flex items-start gap-3 mt-1">
                <input type="checkbox" required className="mt-1 rounded border-neutral-700 bg-black text-white focus:ring-white/20" />
                <span className="text-xs text-neutral-500 leading-relaxed">
                  I agree to the{' '}
                  <Link to="/terms" className="text-white hover:text-neutral-300 transition-colors">Terms of Service</Link>
                  {' '}and{' '}
                  <Link to="/privacy" className="text-white hover:text-neutral-300 transition-colors">Privacy Policy</Link>
                </span>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-white hover:bg-neutral-200 text-black font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 transition-all group disabled:opacity-50"
              >
                {loading ? 'Creating account...' : (
                  <>
                    Create account
                    <HugeiconsIcon icon={ArrowRight01Icon} className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>
            </form>

            <div className="mt-6">
              <div className="relative mb-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-neutral-800" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-neutral-950 px-3 text-neutral-500">or continue with</span>
                </div>
              </div>
              <GoogleSignInButton />
            </div>

            <div className="mt-6 pt-6 border-t border-neutral-800 text-center">
              <p className="text-sm text-neutral-400">
                Already have an account?{' '}
                <Link to="/auth/login" className="text-white hover:text-neutral-300 font-bold transition-colors">Sign in</Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
