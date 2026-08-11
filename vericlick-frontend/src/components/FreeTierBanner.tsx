import { Link } from 'react-router-dom'
import { HugeiconsIcon } from '@hugeicons/react'
import { Clock03Icon } from '@hugeicons/core-free-icons'
import type { Workspace } from '@/types'

interface FreeTierBannerProps {
  workspace?: Workspace | null
}

export function FreeTierBanner({ workspace }: FreeTierBannerProps) {
  if (!workspace || workspace.planName) return null

  const expired = workspace.trialActive === false
  const endsOn = workspace.trialExpiresAt
    ? new Date(workspace.trialExpiresAt).toLocaleDateString()
    : null

  return (
    <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border p-4 ${
      expired ? 'border-error/30 bg-error/10' : 'border-warning/30 bg-warning/10'
    }`}>
      <div className="flex items-start gap-3 min-w-0">
        <div className="mt-0.5 shrink-0">
          <HugeiconsIcon icon={Clock03Icon} className="w-5 h-5 text-slate-700" />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-slate-900">
            {expired ? 'Your free trial has ended' : "You're on the free trial"}
          </h3>
          <p className="text-sm text-slate-600 leading-relaxed mt-0.5">
            {expired ? (
              <>
                Upgrade to any plan to keep creating links and domains. Your existing tracked
                links keep working.
              </>
            ) : (
              <>
                The trial includes 1 domain and 1 link for 7 days
                {endsOn ? `, ending ${endsOn}` : ''}. Upgrade anytime to unlock unlimited links
                and more domains.
              </>
            )}
          </p>
        </div>
      </div>
      <Link
        to="/pricing"
        className="shrink-0 bg-black hover:bg-neutral-800 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-all shadow-sm"
      >
        Upgrade plan
      </Link>
    </div>
  )
}
