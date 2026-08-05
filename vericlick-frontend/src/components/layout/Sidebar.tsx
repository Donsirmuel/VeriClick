import { Link, useLocation, useNavigate } from 'react-router-dom'
import { HugeiconsIcon } from '@hugeicons/react'
import { useQuery } from '@tanstack/react-query'
import { DashboardSquare01Icon, LinkSquare02Icon, Globe02Icon, Settings01Icon, Logout01Icon, HelpCircleIcon, ChevronRightIcon, ShieldIcon, BlockedIcon, Wallet01Icon } from '@hugeicons/core-free-icons'
import { cn } from '@/lib/utils'
import { Logo } from '@/components/Logo'
import { BetaBadge } from '@/components/BetaBadge'
import { fetchWorkspace } from '@/api/workspace'

interface NavItemProps {
  to: string
  icon: any
  label: string
  active?: boolean
}

const NavItem = ({ to, icon: Icon, label, active }: NavItemProps) => (
  <Link 
    to={to} 
    className={cn(
      "flex items-center gap-3 px-4 py-3 rounded-xl transition-all group",
      active 
        ? "bg-white text-black shadow-lg" 
        : "text-neutral-400 hover:bg-neutral-800 hover:text-white"
    )}
  >
    <HugeiconsIcon icon={Icon} className={cn("w-5 h-5", active ? "text-black" : "text-neutral-400 group-hover:text-white")} />
    <span className="font-semibold text-sm">{label}</span>
    {active && <HugeiconsIcon icon={ChevronRightIcon} className="w-4 h-4 ml-auto" />}
  </Link>
)

export function Sidebar({ onClose: _onClose }: { onClose: () => void }) {
  const location = useLocation()
  const navigate = useNavigate()

  const { data: workspace } = useQuery({
    queryKey: ['workspace'],
    queryFn: fetchWorkspace,
  })

  const handleSignOut = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('refresh')
    navigate('/auth/login')
  }

  return (
    <aside className="w-72 h-full bg-sidebar flex flex-col p-6 border-r border-neutral-800">
      <div className="flex items-center gap-3 mb-12 px-2">
        <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center">
          <Logo variant="dark" className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight leading-none mb-1 flex items-center gap-2">VeriClick <BetaBadge /></h2>
          <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-widest">{workspace?.name ?? 'Workspace'}</p>
        </div>
      </div>

      <nav className="flex-1 space-y-2">
        <NavItem 
          to="/app/dashboard" 
          icon={DashboardSquare01Icon} 
          label="Dashboard" 
          active={location.pathname === '/app/dashboard'} 
        />
        <NavItem 
          to="/app/links" 
          icon={LinkSquare02Icon} 
          label="Links" 
          active={location.pathname === '/app/links'} 
        />
        <NavItem 
          to="/app/domains" 
          icon={Globe02Icon} 
          label="Domains" 
          active={location.pathname === '/app/domains'} 
        />
        <NavItem 
          to="/app/ip-rules" 
          icon={ShieldIcon} 
          label="IP Rules" 
          active={location.pathname === '/app/ip-rules'} 
        />
        <NavItem 
          to="/app/blocked-ips" 
          icon={BlockedIcon} 
          label="Blocked IPs" 
          active={location.pathname === '/app/blocked-ips'} 
        />
        <NavItem 
          to="/app/settings" 
          icon={Settings01Icon} 
          label="Settings" 
          active={location.pathname === '/app/settings'}
        />
        <NavItem 
          to="/app/billing" 
          icon={Wallet01Icon} 
          label="Billing & Plan" 
          active={location.pathname === '/app/billing'}
        />
      </nav>

      <div className="mt-auto space-y-2">
        {workspace?.betaFreeMode ? (
          <Link
            to="/pricing"
            className="block p-4 bg-neutral-800/50 rounded-2xl mb-6 border border-neutral-700/50 hover:border-neutral-600 transition-colors"
          >
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full bg-white animate-pulse-dot" />
              <span className="text-xs font-bold text-white uppercase tracking-wider">Free during beta</span>
            </div>
            <p className="text-[11px] text-neutral-400 leading-relaxed">
              VeriClick is free right now. No card, no limits — see the pricing page for details.
            </p>
          </Link>
        ) : (
          <Link
            to="/app/billing"
            className="block p-4 bg-neutral-800/50 rounded-2xl mb-6 border border-neutral-700/50 hover:border-neutral-600 transition-colors"
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-bold text-white uppercase tracking-wider">Current plan</span>
            </div>
            <div className="flex items-center justify-between text-sm font-bold text-white mb-1">
              <span>{workspace?.planName ?? 'No plan'}</span>
              {workspace?.domainLimit && (
                <span className={`text-[11px] font-bold ${
                  workspace.canAddDomain ? 'text-neutral-400' : 'text-warning'
                }`}>
                  {workspace.domainsUsed}/{workspace.domainLimit} domains
                </span>
              )}
            </div>
            <p className="text-[11px] text-neutral-400 leading-relaxed">
              {workspace?.domainLimit
                ? `${workspace.domainLimit} tracked domains on your plan.`
                : 'Pick a plan to start adding tracked domains.'}
            </p>
          </Link>
        )}

        <div className="text-[10px] text-neutral-600 font-mono px-4 py-1">v1.0.0</div>
        <Link to="/app/help" className="flex items-center gap-3 px-4 py-3 w-full text-neutral-400 hover:text-white transition-colors group">
          <HugeiconsIcon icon={HelpCircleIcon} className="w-5 h-5" />
          <span className="font-semibold text-sm">Help & Docs</span>
        </Link>
        <button onClick={handleSignOut} className="flex items-center gap-3 px-4 py-3 w-full text-neutral-400 hover:text-error transition-colors group">
          <HugeiconsIcon icon={Logout01Icon} className="w-5 h-5" />
          <span className="font-semibold text-sm">Sign Out</span>
        </button>
      </div>
    </aside>
  )
}
