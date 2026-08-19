import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { HugeiconsIcon } from '@hugeicons/react'
import { CheckmarkCircle02Icon, CreditCardIcon, Globe02Icon, LinkSquare02Icon, RefreshIcon, ShieldIcon } from '@hugeicons/core-free-icons'
import toast from 'react-hot-toast'
import { fetchPricing } from '@/api/pricing'
import { fetchWorkspace, fetchBillingHistory, startCheckout } from '@/api/workspace'
import { parseApiError } from '@/lib/errors'
import { formatDate, formatCurrency } from '@/lib/utils'
import type { BillingMode, Plan } from '@/types'

function ModeToggle({ value, onChange }: { value: BillingMode; onChange: (m: BillingMode) => void }) {
  return (
    <div className="inline-flex rounded-xl border border-neutral-200 bg-neutral-50 p-1">
      <button
        type="button"
        onClick={() => onChange('period')}
        className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors ${
          value === 'period' ? 'bg-white text-slate-900 shadow-sm' : 'text-muted hover:text-slate-700'
        }`}
      >
        One-time 7 days
      </button>
    </div>
  )
}

export default function Billing() {
  const queryClient = useQueryClient()
  const [justPaid, setJustPaid] = useState(false)
  const [billingMode, setBillingMode] = useState<BillingMode>('period')

  const { data: pricing } = useQuery({ queryKey: ['pricing'], queryFn: fetchPricing })
  const { data: workspace } = useQuery({ queryKey: ['workspace'], queryFn: fetchWorkspace })
  const { data: history } = useQuery({ queryKey: ['billing-history'], queryFn: fetchBillingHistory })

  const checkoutMutation = useMutation({
    mutationFn: ({ planCode, billingMode, paymentMethods }: {
      planCode: string
      billingMode: BillingMode
      paymentMethods: PaymentMethod[]
    }) => startCheckout(planCode, billingMode, paymentMethods),
    onSuccess: (session) => {
      toast.success('Opening secure checkout…')
      window.location.href = session.checkoutUrl
    },
    onError: (err) => toast.error(parseApiError(err) || "Couldn't start the checkout right now."),
  })

  // Coming back from Bachs: after a successful payment the success URL gets
  // ?billing=success appended, so refresh the workspace (the webhook will have
  // granted the plan) and show a confirmation banner.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('billing') === 'success') {
      setJustPaid(true)
      queryClient.invalidateQueries({ queryKey: ['workspace'] })
      queryClient.invalidateQueries({ queryKey: ['billing-history'] })
      window.history.replaceState({}, '', window.location.pathname)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const current = workspace?.plan ?? null
  const plans = pricing?.plans ?? []
  const sub = history?.subscription

  const isCurrent = (code: string) => current === code

  const handleModeChange = (mode: BillingMode) => {
    setBillingMode(mode)
  }

  const beginCheckout = (planCode: string) => {
    checkoutMutation.mutate({ planCode, billingMode, paymentMethods: ['crypto'] })
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Billing &amp; Plan</h1>
        <p className="text-sm text-muted mt-1">
          Your plan controls how many domains you can protect. Pay once with crypto for 7-day access, renew manually when ready.
        </p>
      </div>

      {justPaid && (
        <div className="flex items-start gap-3 bg-green-50 border border-green-200 rounded-2xl p-5">
          <div className="w-9 h-9 bg-green-600 rounded-xl flex items-center justify-center shrink-0">
            <HugeiconsIcon icon={CheckmarkCircle02Icon} className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-green-900 mb-1">Payment confirmed</h3>
            <p className="text-sm text-green-700 leading-relaxed">
              Your new plan is active. Configure your anti-bot settings.
            </p>
          </div>
        </div>
      )}

      {sub?.status === 'grace' && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-300 rounded-2xl p-5">
          <div>
            <h3 className="text-sm font-bold text-amber-900 mb-1">Your plan ended — grace period active</h3>
            <p className="text-sm text-amber-800 leading-relaxed">
              Your <strong>{sub.planName}</strong> period ended on {formatDate(sub.expiresAt)}. Everything
              keeps working during your 7-day grace period. Renew by {formatDate(sub.graceExpiresAt)} to keep
              full analytics and anti-bot protection — after that your site is still protected but no traffic is
              recorded or filtered until you renew.
            </p>
          </div>
        </div>
      )}

      {sub?.status === 'suspended' && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-300 rounded-2xl p-5">
          <div>
            <h3 className="text-sm font-bold text-red-900 mb-1">Your plan is suspended</h3>
            <p className="text-sm text-red-800 leading-relaxed">
              Your site is still protected — your audience is
              unaffected — but VeriClick is no longer recording traffic or applying any filtering or
              anti-bot protection. Renew below to restore full analytics and protection. Your settings and data
              are all intact.
            </p>
          </div>
        </div>
      )}

      {/* Current status */}
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white border border-neutral-200 rounded-2xl p-5">
          <div className="text-xs font-bold text-muted uppercase tracking-wider mb-1">Current plan</div>
          <div className="text-xl font-bold text-slate-900">
            {sub?.status === 'suspended' ? 'Suspended' : (workspace?.planName ?? 'No plan')}
          </div>
          {sub?.mode && (
            <div className="text-xs text-muted mt-1">
              7-day access · One-time payment
            </div>
          )}
          {sub?.status === 'grace' && (
            <div className="text-xs font-bold text-amber-700 mt-1">
              Grace period — renew by {formatDate(sub.graceExpiresAt)}
            </div>
          )}
        </div>
        <div className="bg-white border border-neutral-200 rounded-2xl p-5">
          <div className="text-xs font-bold text-muted uppercase tracking-wider mb-1">
            {sub?.status === 'suspended'
              ? 'Status'
              : sub?.mode === 'period'
                ? 'Expires'
                : sub?.active
                  ? 'Next renewal'
                  : 'Status'}
          </div>
          <div className="text-xl font-bold text-slate-900">
            {sub?.status === 'suspended'
              ? 'Suspended'
              : sub?.mode === 'period'
                ? formatDate(sub.expiresAt)
                : sub?.active && sub.nextRenewalAt
                  ? formatDate(sub.nextRenewalAt)
                  : sub?.active
                    ? 'Active'
                    : '—'}
          </div>
          {sub?.status === 'grace' && (
            <div className="text-xs text-muted mt-1">
              Grace until {formatDate(sub.graceExpiresAt)}
            </div>
          )}
          {sub?.mode === 'period' && sub?.active && (
            <div className="text-xs text-muted mt-1">
              {sub.expiresAt ? `Renew by ${formatDate(sub.expiresAt)}` : ''}
            </div>
          )}
        </div>
        <div className="bg-white border border-neutral-200 rounded-2xl p-5">
          <div className="text-xs font-bold text-muted uppercase tracking-wider mb-1">Domains</div>
          <div className="text-xl font-bold text-slate-900">
            {workspace?.planName ? `${workspace.domainsUsed ?? 0} / ${workspace.domainLimit ?? 3}` : '—'}
          </div>
          <div className="text-xs text-muted mt-1">
            {workspace?.planName
              ? `${(workspace.domainLimit ?? 3) - (workspace.domainsUsed ?? 0)} remaining`
              : 'Pick a plan to register domains'}
          </div>
        </div>
        <div className="bg-white border border-neutral-200 rounded-2xl p-5">
          <div className="text-xs font-bold text-muted uppercase tracking-wider mb-1">Protected pages</div>
          <div className="text-xl font-bold text-slate-900">Unlimited</div>
          <div className="text-xs text-muted mt-1">Pages are never capped on paid plans</div>
        </div>
      </div>

      {/* Plans */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="text-lg font-bold text-slate-900">Choose your plan</h2>
          <ModeToggle value={billingMode} onChange={handleModeChange} />
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
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
                  <span className="text-sm text-muted font-normal">/week</span>
                </div>
                <div className="grid grid-cols-2 gap-2 mb-5">
                  <div className="rounded-xl bg-neutral-50 border border-neutral-200 px-3 py-2.5">
                    <div className="text-[10px] font-bold text-muted uppercase tracking-wider mb-1">Domains</div>
                    <div className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
                      <HugeiconsIcon icon={Globe02Icon} className="w-4 h-4 text-muted" />
                      {plan.domainLimit ?? '—'}
                    </div>
                  </div>
                  <div className="rounded-xl bg-neutral-50 border border-neutral-200 px-3 py-2.5">
                    <div className="text-[10px] font-bold text-muted uppercase tracking-wider mb-1">Pages</div>
                    <div className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
                      <HugeiconsIcon icon={LinkSquare02Icon} className="w-4 h-4 text-muted" />
                      Unlimited
                    </div>
                  </div>
                </div>
                <ul className="space-y-2.5 mb-6 text-sm text-slate-600 flex-1">
                  <li className="flex items-start gap-2">
                    <HugeiconsIcon icon={ShieldIcon} className="w-4 h-4 text-muted shrink-0 mt-0.5" />
                    Full anti-bot engine included
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
                    to="/app/shield"
                    className="text-center bg-neutral-100 text-slate-900 px-4 py-3 rounded-xl text-sm font-bold transition-all"
                  >
                    Configure anti-bot
                  </Link>
                ) : (
                  <button
                    onClick={() => beginCheckout(plan.code)}
                    disabled={checkoutMutation.isPending}
                    className="bg-black hover:bg-neutral-800 disabled:bg-neutral-300 text-white px-4 py-3 rounded-xl text-sm font-bold transition-all"
                  >
                    {checkoutMutation.isPending ? 'Opening checkout…' : `Choose ${plan.name}`}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Payment history */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <HugeiconsIcon icon={CreditCardIcon} className="w-4 h-4 text-muted" />
          <h2 className="text-lg font-bold text-slate-900">Payment history</h2>
          <button
            onClick={() => queryClient.invalidateQueries({ queryKey: ['billing-history'] })}
            className="ml-auto p-2 rounded-lg hover:bg-neutral-100 transition-colors"
            title="Refresh payment history"
          >
            <HugeiconsIcon icon={RefreshIcon} className="w-4 h-4 text-muted" />
          </button>
        </div>
        {history && history.events.length > 0 ? (
          <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-[640px] w-full">
                <thead>
                  <tr className="border-b border-neutral-200 bg-neutral-50/50">
                    <th className="text-left px-6 py-4 text-xs font-bold text-muted uppercase tracking-wider">Date</th>
                    <th className="text-left px-6 py-4 text-xs font-bold text-muted uppercase tracking-wider">Event</th>
                    <th className="text-left px-6 py-4 text-xs font-bold text-muted uppercase tracking-wider">Plan</th>
                    <th className="text-right px-6 py-4 text-xs font-bold text-muted uppercase tracking-wider">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {history.events.map((event) => (
                    <tr key={event.id} className="border-b border-neutral-100 hover:bg-neutral-50/50 transition-colors">
                      <td className="px-6 py-4 text-sm text-slate-700 whitespace-nowrap">{formatDate(event.occurredAt)}</td>
                      <td className="px-6 py-4 text-sm font-bold text-slate-900">{event.label}</td>
                      <td className="px-6 py-4 text-sm text-slate-700">{event.planName ?? '—'}</td>
                      <td className="px-6 py-4 text-sm text-right font-bold text-slate-900">
                        {event.amount != null ? formatCurrency(event.amount, event.currency) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="bg-white border border-neutral-200 rounded-2xl p-6 text-sm text-muted">
            No payments yet. Choose a plan to start protecting your site — unlimited pages on every plan.
          </div>
        )}
      </div>
    </div>
  )
}
