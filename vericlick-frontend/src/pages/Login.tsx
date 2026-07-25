import { Link, useNavigate } from 'react-router-dom'
import { HugeiconsIcon } from '@hugeicons/react'
import { Mail01Icon, LockIcon, ArrowRight01Icon, ViewIcon, ViewOffIcon } from '@hugeicons/core-free-icons'
import { useState } from 'react'
import { Logo } from '@/components/Logo'

function AuthHeroTerminal() {
  return (
    <div className="hidden lg:flex flex-col justify-center px-16 relative">
      <div className="absolute inset-0 hero-grid-bg opacity-30 pointer-events-none" />
      <div className="scan-line pointer-events-none" />
      <div className="relative z-10">
        <div className="mb-12">
          <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center mb-6 shadow-lg shadow-white/10">
            <Logo variant="dark" className="w-8 h-8" />
          </div>
          <h2 className="text-4xl font-bold mb-4 leading-tight text-white">
            Verify every click.<br />Block every bot.
          </h2>
          <p className="text-neutral-400 text-lg leading-relaxed max-w-md">
            Real-time traffic interception protecting 850+ domains with sub-50ms verification.
          </p>
        </div>

        <div className="bg-black/60 backdrop-blur-sm rounded-2xl border border-neutral-800 p-6 font-mono text-xs">
          <div className="flex items-center gap-2 mb-4 pb-3 border-b border-neutral-800/60">
            <div className="w-2.5 h-2.5 rounded-full bg-neutral-600" />
            <div className="w-2.5 h-2.5 rounded-full bg-neutral-600" />
            <div className="w-2.5 h-2.5 rounded-full bg-neutral-600" />
            <span className="text-[9px] text-neutral-500 ml-1">vericlick-relay</span>
          </div>
          <div className="space-y-1.5 text-neutral-500">
            <div style={{ animation: 'fade-in-up 0.3s ease-out forwards' }}>{'>'} Connecting to relay...</div>
            <div style={{ animation: 'fade-in-up 0.3s ease-out 0.3s forwards', opacity: 0 }}>{'>'} Fingerprint acquired</div>
            <div style={{ animation: 'fade-in-up 0.3s ease-out 0.6s forwards', opacity: 0 }}>{'>'} Scoring 15 fraud signals</div>
            <div className="text-white font-bold" style={{ animation: 'fade-in-up 0.3s ease-out 0.9s forwards', opacity: 0 }}>{'>'} Verdict: <span className="text-error">BOT</span> blocked in 34ms</div>
          </div>
        </div>

        <div className="flex items-center gap-8 mt-8 text-sm text-neutral-500">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-white" />
            <span>99.2% accuracy</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-white" />
            <span>&lt;50ms latency</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-white" />
            <span>SOC 2 compliant</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    localStorage.setItem('token', 'mock-token')
    navigate('/app/dashboard')
  }

  return (
    <div className="min-h-screen bg-black flex">
      <AuthHeroTerminal />

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

          <div className="mb-10">
            <h1 className="text-3xl font-bold text-white mb-2">Welcome back</h1>
            <p className="text-neutral-400">Sign in to your workspace to manage your traffic.</p>
          </div>

          <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-8">
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

              <div className="space-y-2">
                <div className="flex items-center justify-between ml-1">
                  <label className="text-sm font-medium text-neutral-300">Password</label>
                  <a href="#" className="text-xs text-white hover:text-neutral-300 font-medium transition-colors">Forgot password?</a>
                </div>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-neutral-500 group-focus-within:text-white transition-colors">
                    <HugeiconsIcon icon={LockIcon} className="w-5 h-5" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="Enter your password"
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
                className="w-full bg-white hover:bg-neutral-200 text-black font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 transition-all group mt-2"
              >
                Sign in to Dashboard
                <HugeiconsIcon icon={ArrowRight01Icon} className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
            </form>

            <div className="mt-6 pt-6 border-t border-neutral-800 text-center">
              <p className="text-sm text-neutral-400">
                Don't have an account?{' '}
                <Link to="/auth/register" className="text-white hover:text-neutral-300 font-bold transition-colors">Create account</Link>
              </p>
            </div>
          </div>

          <div className="mt-8 flex items-center justify-center gap-6 text-xs text-neutral-500">
            <a href="#" className="hover:text-white transition-colors">Security Policy</a>
            <a href="#" className="hover:text-white transition-colors">System Status</a>
            <a href="#" className="hover:text-white transition-colors">Terms</a>
          </div>
        </div>
      </div>
    </div>
  )
}
