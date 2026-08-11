import { Link } from 'react-router-dom'
import { Logo } from '@/components/Logo'
import { useAuth } from '@/hooks/useAuth'

interface PublicNavProps {
  featuresHref?: string
}

export function PublicNav({ featuresHref = '#features' }: PublicNavProps) {
  const { isLoggedIn } = useAuth()
  return (
    <nav className="flex items-center justify-between px-6 py-4 max-w-7xl mx-auto border-b border-neutral-800/50">
      <Link to="/" className="flex items-center gap-2.5">
        <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
          <Logo variant="dark" className="w-5 h-5 text-black" />
        </div>
        <span className="text-xl font-bold tracking-tight">VeriClick</span>
      </Link>
      <div className="hidden md:flex items-center gap-8 text-sm font-medium text-neutral-400">
        <Link to="/" className="hover:text-white transition-colors">Home</Link>
        <a href={featuresHref} className="hover:text-white transition-colors">Features</a>
        <Link to="/pricing" className="hover:text-white transition-colors">Pricing</Link>
        <Link to="/app/help" className="hover:text-white transition-colors">Help</Link>
      </div>
      <div className="flex items-center gap-3">
        {isLoggedIn ? (
          <Link to="/app/dashboard" className="bg-white hover:bg-neutral-200 text-black px-4 py-2 rounded-lg text-sm font-semibold transition-all">
            Dashboard
          </Link>
        ) : (
          <>
            <Link to="/auth/login" className="hidden sm:block text-sm font-medium text-neutral-400 hover:text-white transition-colors">Log in</Link>
            <Link to="/auth/register" className="bg-white hover:bg-neutral-200 text-black px-4 py-2 rounded-lg text-sm font-semibold transition-all">
              Get Started
            </Link>
          </>
        )}
      </div>
    </nav>
  )
}
