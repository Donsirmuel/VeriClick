import { Link } from 'react-router-dom'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowRight01Icon } from '@hugeicons/core-free-icons'
import { Logo } from '@/components/Logo'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-6">
      <div className="absolute inset-0 hero-grid-bg opacity-20 pointer-events-none" />

      <div className="text-center relative z-10">
        <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mx-auto mb-8 shadow-lg shadow-white/10">
          <Logo variant="dark" className="w-9 h-9" />
        </div>

        <h1 className="text-8xl font-bold text-white mb-4 tracking-tighter">404</h1>
        <h2 className="text-2xl font-bold text-white mb-4">Page not found</h2>
        <p className="text-neutral-400 text-lg mb-10 max-w-md mx-auto">
          The page you're looking for doesn't exist or has been moved to a different location.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            to="/app/dashboard"
            className="bg-white hover:bg-neutral-200 text-black px-8 py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 transition-all group"
          >
            Go to Dashboard
            <HugeiconsIcon icon={ArrowRight01Icon} className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </Link>
          <Link
            to="/"
            className="border border-neutral-700 hover:border-neutral-500 text-white px-8 py-3.5 rounded-xl font-bold transition-all"
          >
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  )
}
