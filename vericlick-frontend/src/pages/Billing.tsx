import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { HugeiconsIcon } from '@hugeicons/react'
import { CheckmarkCircle02Icon, Globe02Icon, ShieldIcon, Tag01Icon } from '@hugeicons/core-free-icons'
import toast from 'react-hot-toast'
import { fetchPricing } from '@/api/pricing'
import { fetchWorkspace, upgradePlan } from '@/api/workspace'
import type { Plan } from '@/types'

export default function Billing() {
  const queryClient = useQueryClient()

  const { data: pricing } = useQuery({ queryKey: ['pricing'], queryFn: fetchPricing })
  const { data: workspace } = useQuery({ queryKey: ['workspace'], queryFn: fetchWorkspace })

  const upgradeMutation = useMutation({
    mutationFn: upgradePlan,
    onSuccess: (updated) => {
      queryClient.setQueryData(['workspace'], updated)
      queryClient.invalidateQueries({ queryKey: ['workspace'] })
      toast.success(`You're now on ${updated.planName ?? 'a paid plan'}.`)
    },
    onError: () => toast.error("Couldn't change your plan right now."),
  })

  const current = workspace?.plan ?? null
  const betaFree = pricing?.betaFreeMode ?? false
  const plans = pricing?.plans ?? []

  const isCurrent = (code: string) => current === code

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Billing &amp; Plan</h1>
        <p className="text-sm text-muted mt-1">
          Your plan controls how many tracked domains your workspace can register.
        </p>
      </div>

      {betaFree && (
        <div className="flex items-start gap-3 bg-neutral-50 border border-neutral-200 rounded-2xl p-5">
          <div className="w-9 h-9 bg-neutral-900 rounded-xl flex items-center justify-center shrink-0">
            <HugeiconsIcon icon={Tag01Icon} className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 mb-1">You're not charged during beta</h3>
            <p className="text-sm text-muted leading-relaxed">
              Every feature is free while beta mode is on, so domain limits aren't enforced.
              You can still choose a plan below to preview it — it takes effect when billing launches.
            </p>
          </div>
        </div>
      )}

      {/* Current status */}
      <div className="grid sm:grid-cols-3 gap-4">
        <div className="bg-white border border-neutral-200 rounded-2xl p-5">
          <div className="text-xs font-bold text-muted uppercase tracking-wider mb-1">Current plan</div>
          <div className="text-xl font-bold text-slate-900">
            {betaFree ? 'Free beta' : (workspace?.planName ?? 'No plan')}
          </div>
        </div>
        <div className="bg-white border border-neutral-200 rounded-2xl p-5">
          <div className="text-xs font-bold text-muted uppercase tracking-wider mb-1">Domains</div>
          <div className="text-xl font-bold text-slate-900">
            {workspace?.domainLimit
              ? `${workspace.domainsUsed} / ${workspace.domainLimit} used`
              : `${workspace?.domainsUsed ?? 0} / unlimited`}
          </div>
        </div>
        <div className="bg-white border border-neutral-200 rounded-2xl p-5">
          <div className="text-xs font-bold text-muted uppercase tracking-wider mb-1">Status</div>
          <div className="text-xl font-bold text-slate-900">
            {workspace?.canAddDomain || betaFree ? 'Active' : 'At limit'}
          </div>
        </div>
      </div>

      {/* Plans */}
      <div>
        <h2 className="text-lg font-bold text-slate-900 mb-4">Choose your plan</h2>
        <div className="grid md:grid-cols-3 gap-5">
          {plans.map((plan: Plan) => {
            const isCurrentPlan = isCurrent(plan.code)
            return (
              <div
                key={plan.code}
                className={`relative bg-white border rounded-2xl p-6 flex flex-col ${
                  isCurrentPlan ? 'border-black ring-1 ring-black' : 'border-neutral-200'
                }`}
              >
                {isCurrentPlan && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] font-bold uppercase tracking-wider text-white bg-black px-3 py-1 rounded-full">
                    Current plan
                  </span>
                )}
                <h3 className="text-lg font-bold text-slate-900 mb-2">{plan.name}</h3>
                <div className="text-3xl font-bold text-slate-900 mb-1">
                  ${plan.monthlyPrice}
                  <span className="text-sm text-muted font-normal">/month</span>
                </div>
                <div className="flex items-center gap-2 mb-5">
                  <HugeiconsIcon icon={Globe02Icon} className="w-4 h-4 text-muted" />
                  <span className="text-sm font-bold text-slate-700">
                    {plan.domainLimit} {plan.domainLimit === 1 ? 'domain' : 'domains'}
                  </span>
                </div>
                <ul className="space-y-2.5 mb-6 text-sm text-slate-600 flex-1">
                  <li className="flex items-start gap-2">
                    <HugeiconsIcon icon={ShieldIcon} className="w-4 h-4 text-muted shrink-0 mt-0.5" />
                    Full protection engine included
                  </li>
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <HugeiconsIcon icon={CheckmarkCircle02Icon} className="w-4 h-4 text-muted shrink-0 mt-0.5" />
                      {f}
                    </li>
                  ))}
                </ul>
                {isCurrentPlan ? (
                  <Link
                    to="/app/domains"
                    className="text-center bg-neutral-100 text-slate-900 px-4 py-3 rounded-xl text-sm font-bold transition-all"
                  >
                    Manage domains
                  </Link>
                ) : (
                  <button
                    onClick={() => upgradeMutation.mutate(plan.code)}
                    disabled={upgradeMutation.isPending}
                    className="bg-black hover:bg-neutral-800 disabled:bg-neutral-300 text-white px-4 py-3 rounded-xl text-sm font-bold transition-all"
                  >
                    {upgradeMutation.isPending ? 'Switching…' : betaFree ? 'Choose for launch' : `Switch to ${plan.name}`}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
