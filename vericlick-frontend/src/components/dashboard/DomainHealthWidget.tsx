import { Link } from 'react-router-dom'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowRight01Icon, CheckmarkCircle02Icon, Alert02Icon, CancelCircleIcon, Clock01Icon } from '@hugeicons/core-free-icons'
import { formatRelativeTime } from '@/lib/utils'

interface DomainHealthWidgetProps {
  healthy: number
  degraded: number
  blacklisted: number
  lastScan: string | null
}

export function DomainHealthWidget({ healthy, degraded, blacklisted, lastScan }: DomainHealthWidgetProps) {
  const total = healthy + degraded + blacklisted
  const healthyPct = Math.round((healthy / total) * 100)
  const degradedPct = Math.round((degraded / total) * 100)
  const blacklistedPct = 100 - healthyPct - degradedPct

  return (
    <div className="bg-white p-6 rounded-2xl border border-border shadow-sm">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-bold text-slate-900">Domain Health</h3>
          <p className="text-sm text-muted mt-1 flex items-center gap-1.5">
            <HugeiconsIcon icon={Clock01Icon} className="w-3.5 h-3.5" />
            Auto-checks every 15 min · last scan{' '}
            {lastScan ? formatRelativeTime(lastScan) : 'never'}
          </p>
        </div>
        <Link to="/app/domains" className="text-black hover:text-neutral-700 text-sm font-bold flex items-center gap-1">
          All Domains <HugeiconsIcon icon={ArrowRight01Icon} className="w-4 h-4" />
        </Link>
      </div>

      {/* Stacked bar */}
      <div className="h-4 rounded-full overflow-hidden flex bg-neutral-100 mb-6">
        <div className="bg-neutral-400 transition-all" style={{ width: `${healthyPct}%` }} />
        <div className="bg-neutral-300 transition-all" style={{ width: `${degradedPct}%` }} />
        <div className="bg-error transition-all" style={{ width: `${blacklistedPct}%` }} />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HugeiconsIcon icon={CheckmarkCircle02Icon} className="w-4 h-4 text-neutral-400" />
            <span className="text-sm font-medium text-slate-700">Healthy</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold text-slate-900">{healthy}</span>
            <span className="text-xs text-neutral-400 font-bold bg-neutral-100 px-2 py-0.5 rounded-full">{healthyPct}%</span>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HugeiconsIcon icon={Alert02Icon} className="w-4 h-4 text-neutral-400" />
            <span className="text-sm font-medium text-slate-700">Degraded</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold text-slate-900">{degraded}</span>
            <span className="text-xs text-neutral-400 font-bold bg-neutral-100 px-2 py-0.5 rounded-full">{degradedPct}%</span>
          </div>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HugeiconsIcon icon={CancelCircleIcon} className="w-4 h-4 text-error" />
            <span className="text-sm font-medium text-slate-700">Blacklisted</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold text-slate-900">{blacklisted}</span>
            <span className="text-xs text-error font-bold bg-error/10 px-2 py-0.5 rounded-full">{blacklistedPct}%</span>
          </div>
        </div>
      </div>
    </div>
  )
}
