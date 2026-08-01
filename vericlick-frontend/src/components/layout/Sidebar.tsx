import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { HugeiconsIcon } from '@hugeicons/react'
import { DashboardSquare01Icon, LinkSquare02Icon, Globe02Icon, Settings01Icon, Logout01Icon, HelpCircleIcon, ChevronRightIcon, ShieldIcon, Cancel01Icon, BlockedIcon } from '@hugeicons/core-free-icons'
import { cn } from '@/lib/utils'
import { Logo } from '@/components/Logo'

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
  const [showHelp, setShowHelp] = useState(false)

  const handleSignOut = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('refresh')
    navigate('/auth/login')
  }

  return (
    <>
    <aside className="w-72 h-full bg-sidebar flex flex-col p-6 border-r border-neutral-800">
      <div className="flex items-center gap-3 mb-12 px-2">
        <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center">
          <Logo variant="dark" className="w-6 h-6" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-white tracking-tight leading-none mb-1">VeriClick</h2>
          <p className="text-[10px] text-neutral-400 font-bold uppercase tracking-widest">Workspace Pro</p>
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
      </nav>

      <div className="mt-auto space-y-2">
        <div className="p-4 bg-neutral-800/50 rounded-2xl mb-6 border border-neutral-700/50">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-2 h-2 rounded-full bg-white" />
            <span className="text-xs font-bold text-white uppercase tracking-wider">System Status</span>
          </div>
          <p className="text-[11px] text-neutral-400 leading-relaxed">
            All nodes operational. Interception latency at 42ms.
          </p>
        </div>

        <div className="text-[10px] text-neutral-600 font-mono px-4 py-1">v1.0.0</div>
        <button onClick={() => setShowHelp(true)} className="flex items-center gap-3 px-4 py-3 w-full text-neutral-400 hover:text-white transition-colors group">
          <HugeiconsIcon icon={HelpCircleIcon} className="w-5 h-5" />
          <span className="font-semibold text-sm">Help & Docs</span>
        </button>
        <button onClick={handleSignOut} className="flex items-center gap-3 px-4 py-3 w-full text-neutral-400 hover:text-error transition-colors group">
          <HugeiconsIcon icon={Logout01Icon} className="w-5 h-5" />
          <span className="font-semibold text-sm">Sign Out</span>
        </button>
      </div>
    </aside>

    {showHelp && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={() => setShowHelp(false)}>
        <div className="bg-white rounded-2xl max-w-lg w-full max-h-[80vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
          <div className="flex items-center justify-between p-6 border-b border-neutral-100">
            <h2 className="text-lg font-bold text-slate-900">Quick Guide</h2>
            <button onClick={() => setShowHelp(false)} className="p-1.5 rounded-lg hover:bg-neutral-100 transition-colors">
              <HugeiconsIcon icon={Cancel01Icon} className="w-5 h-5 text-muted" />
            </button>
          </div>
          <div className="p-6 space-y-6 text-sm text-slate-700 leading-relaxed">
            <div>
              <h3 className="font-bold text-slate-900 mb-1">Domains</h3>
              <p>A domain is the web address your links live on (like <span className="font-mono text-xs bg-neutral-100 px-1 rounded">your.domain</span>). Add your domain first, then create links under it.</p>
            </div>
            <div>
              <h3 className="font-bold text-slate-900 mb-1">Links</h3>
              <p>Each link has a short code called a <strong>slug</strong> (e.g. <span className="font-mono text-xs bg-neutral-100 px-1 rounded">summer23</span>). When someone visits <span className="font-mono text-xs bg-neutral-100 px-1 rounded">your.domain/r/summer23</span>, VeriClick checks if they are a bot or a real person before redirecting them to your destination URL.</p>
            </div>
            <div>
              <h3 className="font-bold text-slate-900 mb-1">IP Rules</h3>
              <p>An IP address is a computer's unique identifier on the internet. IP Rules let you allow or block specific IP addresses from reaching your links. Use this to block known bad actors or allow only trusted traffic.</p>
            </div>
            <div>
              <h3 className="font-bold text-slate-900 mb-1">Dashboard</h3>
              <p>Shows your traffic stats, recent activity, and how many bots have been detected and blocked.</p>
            </div>
            <div>
              <h3 className="font-bold text-slate-900 mb-1">Getting Started</h3>
              <ol className="list-decimal pl-4 space-y-1">
                <li>Go to <strong>Domains</strong> and add your domain</li>
                <li>Go to <strong>Links</strong> and create your first link</li>
                <li>Share the short URL — VeriClick handles the rest</li>
                <li>Check the <strong>Dashboard</strong> to see traffic and blocked bots</li>
              </ol>
            </div>
          </div>
        </div>
      </div>
    )}
  </>
  )
}
