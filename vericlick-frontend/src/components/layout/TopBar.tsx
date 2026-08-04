import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { HugeiconsIcon } from '@hugeicons/react'
import { Menu01Icon, ChevronDownIcon, UserIcon, Settings01Icon, Logout01Icon } from '@hugeicons/core-free-icons'
import { useQuery } from '@tanstack/react-query'
import { fetchMe } from '@/api/auth'
import { fetchWorkspace } from '@/api/workspace'

export function TopBar({ onMenuToggle }: { onMenuToggle: () => void }) {
  const { data: user } = useQuery({
    queryKey: ['auth-me'],
    queryFn: fetchMe,
    staleTime: 60_000,
  })
  const { data: workspace } = useQuery({
    queryKey: ['workspace'],
    queryFn: fetchWorkspace,
    staleTime: 60_000,
  })
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSignOut = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('refresh')
    navigate('/auth/login')
  }

  return (
    <header className="h-16 bg-white border-b border-neutral-200 flex items-center justify-between px-4 md:px-8 shrink-0">
      <div className="flex items-center gap-4">
        <button 
          onClick={onMenuToggle}
          className="lg:hidden p-2 rounded-lg hover:bg-slate-100 transition-colors"
        >
          <HugeiconsIcon icon={Menu01Icon} className="w-5 h-5 text-muted" />
        </button>
        
        {/* Breadcrumb */}
        <div className="hidden md:flex items-center gap-2 text-sm">
          <span className="text-muted">Workspace</span>
          <span className="text-muted">/</span>
          <span className="font-medium text-slate-900">{workspace?.name ?? 'Workspace'}</span>
        </div>
      </div>

      <div className="flex items-center gap-2 md:gap-4">
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-3 pl-2 md:border-l md:border-neutral-200 md:pl-4 hover:bg-neutral-50 rounded-lg px-2 py-1 transition-colors group"
          >
            <div className="w-8 h-8 rounded-full bg-neutral-100 flex items-center justify-center text-black">
              <HugeiconsIcon icon={UserIcon} className="w-4 h-4" />
            </div>
            <div className="hidden md:block text-left">
              <div className="text-sm font-bold text-slate-900 leading-none">{user?.username ?? 'Operator'}</div>
              <div className="text-[11px] text-muted leading-none mt-1">{user?.email ?? 'user@vericlick.io'}</div>
            </div>
            <HugeiconsIcon icon={ChevronDownIcon} className="w-4 h-4 text-neutral-400 group-hover:text-black transition-colors" />
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-xl border border-neutral-200 shadow-xl py-2 z-50">
              <div className="px-4 py-2 border-b border-neutral-100">
                <div className="text-sm font-bold text-slate-900">{user?.username ?? 'Operator'}</div>
                <div className="text-xs text-muted">{user?.email ?? 'user@vericlick.io'}</div>
              </div>
              <button
                onClick={() => { navigate('/app/settings'); setDropdownOpen(false) }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-slate-700 hover:bg-neutral-50 transition-colors"
              >
                <HugeiconsIcon icon={Settings01Icon} className="w-4 h-4" />
                Settings
              </button>
              <button
                onClick={handleSignOut}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-error hover:bg-red-50 transition-colors"
              >
                <HugeiconsIcon icon={Logout01Icon} className="w-4 h-4" />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
