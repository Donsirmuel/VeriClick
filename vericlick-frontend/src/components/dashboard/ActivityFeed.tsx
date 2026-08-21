import { Link } from 'react-router-dom'
import { formatRelativeTime } from '@/lib/utils'
import type { ActivityEntry } from '@/types'
import { HugeiconsIcon } from '@hugeicons/react'
import { Shield02Icon, Globe02Icon, ArrowLeft01Icon, ArrowRight01Icon } from '@hugeicons/core-free-icons'

interface ActivityFeedProps {
  activity: ActivityEntry[]
  page: number
  totalPages: number
  total: number
  /** The window is saturated — this is the most recent N events, not all of them. */
  windowFull: boolean
  windowSize: number
  onPageChange: (page: number) => void
}

export function ActivityFeed({
  activity, page, totalPages, total, windowFull, windowSize, onPageChange,
}: ActivityFeedProps) {
  const hasPages = totalPages > 1

  return (
    <div className="bg-white p-6 rounded-2xl border border-border shadow-sm">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-bold text-slate-900">Live Activity</h3>
          {/* Say what the list actually is. "Live Activity" over a paged list
              otherwise implies you can scroll back to the beginning of time. */}
          <p className="text-sm text-muted mt-1">
            {total === 0
              ? 'Visits and clicks appear here as they happen'
              : windowFull
                ? `The most recent ${windowSize} visits and clicks`
                : `${total} recent ${total === 1 ? 'visit or click' : 'visits and clicks'}`}
          </p>
        </div>
        <div className="flex items-center gap-2 px-2 py-1 rounded-full bg-white/10 text-white text-[10px] font-bold uppercase tracking-wider animate-pulse">
          <div className="w-1.5 h-1.5 rounded-full bg-white" />
          Live Feed
        </div>
      </div>

      {activity.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-sm font-bold text-slate-900 mb-1">Nothing here yet</p>
          <p className="text-sm text-muted max-w-sm mx-auto leading-relaxed">
            Every visitor to a protected site and every click on a redirect link shows up
            here within a minute, with what VeriClick decided about them.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {activity.map((entry) => {
            const blocked = entry.verdict === 'blocked'
            return (
              <div key={entry.id} className="flex items-center gap-4 p-3 rounded-xl hover:bg-slate-50 transition-colors border border-transparent hover:border-border">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                  blocked ? 'bg-error/10 text-error' : 'bg-neutral-100 text-black'
                }`}>
                  <HugeiconsIcon icon={blocked ? Shield02Icon : Globe02Icon} className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-sm font-bold text-slate-900">{entry.ip}</span>
                    <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                      blocked ? 'bg-error text-white' : 'bg-success/10 text-success'
                    }`}>
                      {blocked ? 'Blocked' : 'Allowed'}
                    </span>
                    {entry.isBot && (
                      <span className="px-1.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-warning/10 text-warning">
                        Bot
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted flex-wrap">
                    <span className="font-mono truncate max-w-[200px]" title={entry.pageUrl}>{entry.pageUrl}</span>
                  </div>
                  {entry.reasonLabel && (
                    <p className="text-xs text-slate-600 mt-1">{entry.reasonLabel}</p>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <div className="text-xs font-medium text-slate-900">{formatRelativeTime(entry.createdAt)}</div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {hasPages && (
        <nav
          aria-label="Activity pages"
          className="flex items-center justify-between gap-3 mt-6 pt-4 border-t border-neutral-100"
        >
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-slate-700 border border-neutral-200 hover:bg-neutral-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <HugeiconsIcon icon={ArrowLeft01Icon} className="w-3.5 h-3.5" />
            Newer
          </button>
          <span className="text-xs font-medium text-muted" aria-live="polite">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold text-slate-700 border border-neutral-200 hover:bg-neutral-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Older
            <HugeiconsIcon icon={ArrowRight01Icon} className="w-3.5 h-3.5" />
          </button>
        </nav>
      )}

      <Link
        to="/app/blocked-ips"
        className="w-full mt-6 py-3 text-sm font-bold text-black hover:bg-neutral-100 rounded-xl border border-neutral-200 transition-all block text-center"
      >
        Manage blocked IPs
      </Link>
    </div>
  )
}
