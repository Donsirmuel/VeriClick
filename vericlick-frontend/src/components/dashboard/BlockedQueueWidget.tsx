import { Link } from 'react-router-dom'
import { HugeiconsIcon } from '@hugeicons/react'
import { RoboticIcon, ArrowRight01Icon, InformationCircleIcon, SmartPhone01Icon, ComputerIcon } from '@hugeicons/core-free-icons'
import { formatRelativeTime } from '@/lib/utils'
import { CountryFlag } from '@/components/shared/CountryFlag'
import type { ActivityEntry, DeviceClass } from '@/types'

function deviceIcon(cls: DeviceClass) {
  if (cls === 'mobile' || cls === 'tablet') return SmartPhone01Icon
  return ComputerIcon
}

export function BlockedQueueWidget({ activity }: { activity: ActivityEntry[] }) {
  const blocked = activity.filter((e) => e.isBot || e.decision === 'blocked').slice(0, 5)

  return (
    <div className="bg-white p-6 rounded-2xl border border-border shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h3 className="text-lg font-bold text-slate-900">Recently Blocked</h3>
          <p className="text-sm text-muted mt-1">Suspicious traffic stopped automatically</p>
        </div>
        <div className="w-9 h-9 rounded-lg bg-error/10 flex items-center justify-center shrink-0">
          <HugeiconsIcon icon={RoboticIcon} className="w-5 h-5 text-error" />
        </div>
      </div>

      <div className="p-3 rounded-xl bg-slate-50 border border-border mb-4 flex items-start gap-2">
        <HugeiconsIcon icon={InformationCircleIcon} className="w-4 h-4 text-muted shrink-0 mt-0.5" />
        <p className="text-xs text-muted leading-relaxed">
          Blocked traffic never reaches your real page — it lands on your page for blocked
          visitors or VeriClick's built-in protected page instead.
        </p>
      </div>

      <div className="space-y-3">
        {blocked.length === 0 && (
          <p className="text-sm text-muted py-6 text-center">No suspicious traffic in the recent feed.</p>
        )}
        {blocked.map((entry) => {
          const DeviceIcon = deviceIcon(entry.deviceClass as DeviceClass)
          return (
            <div key={entry.id} className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-error/10 flex items-center justify-center shrink-0">
                <HugeiconsIcon icon={DeviceIcon} className="w-4 h-4 text-error" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-slate-900">{entry.ip}</span>
                  <span className="text-[10px] text-muted">{formatRelativeTime(entry.time)}</span>
                </div>
                <p className="text-xs text-slate-600 truncate mt-0.5">
                  {entry.reasonLabel}
                  {entry.countryCode && (
                    <span className="inline-flex items-center gap-1 ml-2 align-middle">
                      <CountryFlag code={entry.countryCode} />
                      {entry.country}
                    </span>
                  )}
                </p>
              </div>
            </div>
          )
        })}
      </div>

      <Link
        to="/app/blocked-ips"
        className="w-full mt-6 py-3 text-sm font-bold text-black hover:bg-neutral-100 rounded-xl border border-neutral-200 transition-all flex items-center justify-center gap-1.5"
      >
        View Blocked IPs <HugeiconsIcon icon={ArrowRight01Icon} className="w-4 h-4" />
      </Link>
    </div>
  )
}
