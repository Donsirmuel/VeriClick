import { Link } from 'react-router-dom'
import { formatRelativeTime } from '@/lib/utils'
import type { ActivityEntry, DeviceClass } from '@/types'
import { HugeiconsIcon } from '@hugeicons/react'
import { ComputerIcon, SmartPhone01Icon, RoboticIcon, MapPinIcon, BrowserIcon } from '@hugeicons/core-free-icons'
import { CountryFlag } from '@/components/shared/CountryFlag'

function deviceIcon(cls: DeviceClass) {
  if (cls === 'mobile' || cls === 'tablet') return SmartPhone01Icon
  if (cls === 'bot') return RoboticIcon
  return ComputerIcon
}

export function ActivityFeed({ activity }: { activity: ActivityEntry[] }) {
  return (
    <div className="bg-white p-6 rounded-2xl border border-border shadow-sm">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-bold text-slate-900">Live Activity</h3>
          <p className="text-sm text-muted mt-1">Real-time traffic interception log</p>
        </div>
        <div className="flex items-center gap-2 px-2 py-1 rounded-full bg-white/10 text-white text-[10px] font-bold uppercase tracking-wider animate-pulse">
          <div className="w-1.5 h-1.5 rounded-full bg-white" />
          Live Feed
        </div>
      </div>

      <div className="space-y-4">
        {activity.map((entry) => {
          const DeviceIcon = deviceIcon(entry.deviceClass as DeviceClass)
          const blocked = entry.decision === 'blocked'
          return (
            <div key={entry.id} className="flex items-center gap-4 p-3 rounded-xl hover:bg-slate-50 transition-colors border border-transparent hover:border-border">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                blocked ? 'bg-error/10 text-error' : 'bg-neutral-100 text-black'
              }`}>
                <HugeiconsIcon icon={DeviceIcon} className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-sm font-bold text-slate-900">{entry.ip}</span>
                  <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider ${
                    blocked ? 'bg-error text-white' : 'bg-success/10 text-success'
                  }`}>
                    {blocked ? 'Blocked' : 'Allowed'}
                  </span>
                  <span className="text-xs text-slate-500">{entry.deviceClass}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-muted flex-wrap">
                  <div className="flex items-center gap-1.5">
                    {entry.countryCode && <CountryFlag code={entry.countryCode} />}
                    <HugeiconsIcon icon={MapPinIcon} className="w-3 h-3" />
                    {[entry.city, entry.region, entry.country].filter(Boolean).join(', ') || 'Unknown location'}
                  </div>
                  <span>•</span>
                  <div className="flex items-center gap-1">
                    <HugeiconsIcon icon={BrowserIcon} className="w-3 h-3" />
                    {[entry.browser, entry.osFamily].filter(Boolean).join(' · ') || entry.device}
                  </div>
                  <span>•</span>
                  <span className="font-mono">{entry.slug}</span>
                </div>
                {entry.reasonLabel && (
                  <p className="text-xs text-slate-600 mt-1">{entry.reasonLabel}</p>
                )}
              </div>
              <div className="text-right shrink-0">
                <div className="text-xs font-medium text-slate-900">{formatRelativeTime(entry.time)}</div>
              </div>
            </div>
          )
        })}
      </div>

      <Link
        to="/app/blocked-ips"
        className="w-full mt-6 py-3 text-sm font-bold text-black hover:bg-neutral-100 rounded-xl border border-neutral-200 transition-all block text-center"
      >
        View All Activity
      </Link>
    </div>
  )
}
