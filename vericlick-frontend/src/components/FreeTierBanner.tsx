import { Link } from 'react-router-dom'
import { HugeiconsIcon } from '@hugeicons/react'
import { Shield02Icon } from '@hugeicons/core-free-icons'
import type { Workspace } from '@/types'

interface PlanRequiredBannerProps {
  workspace?: Workspace | null
}

export function FreeTierBanner({ workspace }: PlanRequiredBannerProps) {
  if (!workspace || workspace.planStatus !== 'none') return null

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-primary/10 p-4">
      <div className="flex items-start gap-3 min-w-0">
        <div className="mt-0.5 shrink-0">
          <HugeiconsIcon icon={Shield02Icon} className="w-5 h-5 text-primary" />
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-slate-900">
            A plan is required
          </h3>
          <p className="text-sm text-slate-600 leading-relaxed mt-0.5">
            Select a plan to start installing the script, configuring protection, and setting up traffic rules.
          </p>
        </div>
      </div>
      <Link
        to="/pricing"
        className="shrink-0 bg-black hover:bg-neutral-800 text-white px-4 py-2.5 rounded-xl text-sm font-bold transition-all shadow-sm"
      >
        Choose a plan
      </Link>
    </div>
  )
}
