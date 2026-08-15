import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Logo } from '@/components/Logo'
import { useAuth } from '@/hooks/useAuth'
import { HugeiconsIcon } from '@hugeicons/react'
import { Menu01Icon, Cancel01Icon } from '@hugeicons/core-free-icons'

interface PublicNavProps {
  featuresHref?: string
}

export function PublicNav({ featuresHref = '#features' }: PublicNavProps) {
  const { isLoggedIn } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)

  const links = (
    <>
      <Link to="/" onClick={() => setMenuOpen(false)} className="hover:text-white transition-colors">Home</Link>
      <a href={featuresHref} onClick={() => setMenuOpen(false)} className="hover:text-white transition-colors">Features</a>
      <Link to="/pricing" onClick={() => setMenuOpen(false)} className="hover:text-white transition-colors">Pricing</Link>
      <Link to="/help" onClick={() => setMenuOpen(false)} className="hover:text-white transition-colors">Help</Link>
    </>
  )

  return (
    <nav className="flex items-center justify-between px-6 py-4 max-w-7xl mx-auto border-b border-neutral-800/50">
      <Link to="/" className="flex items-center gap-2.5">
        <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center">
          <Logo variant="dark" className="w-5 h-5 text-black" />
        </div>
        <span className="text-xl font-bold tracking-tight">VeriClick</span>
      </Link>
      <div className="hidden md:flex items-center gap-8 text-sm font-medium text-neutral-400">
        {links}
      </div>
      <div className="hidden md:flex items-center gap-3">
        {isLoggedIn ? (
          <Link to="/app/dashboard" className="bg-white hover:bg-neutral-200 text-black px-4 py-2.5 rounded-lg text-sm font-semibold transition-all">
            Dashboard
          </Link>
        ) : (
          <>
            <Link to="/auth/login" className="text-sm font-medium text-neutral-400 hover:text-white transition-colors px-2 py-2.5">
              Log in
            </Link>
            <Link to="/auth/register" className="bg-white hover:bg-neutral-200 text-black px-4 py-2.5 rounded-lg text-sm font-semibold transition-all">
              Get Started
            </Link>
          </>
        )}
      </div>
      <button
        onClick={() => setMenuOpen(open => !open)}
        aria-label={menuOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={menuOpen}
        className="md:hidden p-2.5 rounded-lg hover:bg-neutral-800 transition-colors"
      >
        <HugeiconsIcon icon={menuOpen ? Cancel01Icon : Menu01Icon} className="w-5 h-5" />
      </button>

      {menuOpen && (
        <div className="absolute top-[69px] left-0 right-0 z-40 bg-neutral-950 border-b border-neutral-800/50 md:hidden">
          <div className="flex flex-col px-6 py-4 gap-4 text-sm font-medium text-neutral-400">
            {links}
            {isLoggedIn ? (
              <Link
                to="/app/dashboard"
                onClick={() => setMenuOpen(false)}
                className="bg-white hover:bg-neutral-200 text-black text-center font-bold rounded-lg px-4 py-3 transition-colors"
              >
                Dashboard
              </Link>
            ) : (
              <Link
                to="/auth/register"
                onClick={() => setMenuOpen(false)}
                className="bg-white hover:bg-neutral-200 text-black text-center font-bold rounded-lg px-4 py-3 transition-colors"
              >
                Get Started
              </Link>
            )}
          </div>
        </div>
      )}
    </nav>
  )
}
