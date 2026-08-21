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
import {
  BillingPeriodToggle, bestMonthlySavings, monthlySavings, periodLabel, priceFor, PERIOD_DAYS,
} from '@/components/shared/BillingPeriodToggle'
import type { BillingPeriod, Plan } from '@/types'

export default function Billing() {
  const queryClient = useQueryClient()
  // Which way the customer came back from Bachs, if they came back at all.
  const [returned, setReturned] = useState<'success' | 'cancelled' | null>(null)
  const [waitedTooLong, setWaitedTooLong] = useState(false)
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>('weekly')

  const { data: pricing } = useQuery({ queryKey: ['pricing'], queryFn: fetchPricing })
  const { data: workspace } = useQuery({ queryKey: ['workspace'], queryFn: fetchWorkspace })
  const { data: history } = useQuery({
    queryKey: ['billing-history'],
    queryFn: fetchBillingHistory,
    // Returning from checkout is a race: Bachs sends the customer back
    // immediately, but the plan is only granted when the signed webhook
    // arrives, and a crypto payment waits on network confirmations. Poll until
    // it lands rather than making the customer refresh and wonder.
    refetchInterval: (query) =>
      returned === 'success' && !query.state.data?.subscription?.active && !waitedTooLong
        ? 3000
        : false,
  })

  const checkoutMutation = useMutation({
    mutationFn: ({ planCode, billingPeriod }: {
      planCode: string
      billingPeriod: BillingPeriod
    }) => startCheckout(planCode, billingPeriod, ['crypto']),
    onSuccess: (session) => {
      toast.success('Opening secure checkout…')
      window.location.href = session.checkoutUrl
    },
    onError: (err) => toast.error(parseApiError(err) || "Couldn't start the checkout right now."),
  })

  // Coming back from Bachs. Both outcomes land here with a query param; the
  // param is stripped either way so a refresh does not replay the banner.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const outcome = params.get('billing')
    if (outcome === 'success' || outcome === 'cancelled') {
      setReturned(outcome)
      window.history.replaceState({}, '', window.location.pathname)
    }
    if (outcome === 'success') {
      queryClient.invalidateQueries({ queryKey: ['workspace'] })
      queryClient.invalidateQueries({ queryKey: ['billing-history'] })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Stop polling after a minute. Past that it is not "still processing", it is
  // something a person needs to look at, and saying so beats a spinner.
  useEffect(() => {
    if (returned !== 'success') return
    const timer = setTimeout(() => setWaitedTooLong(true), 60_000)
    return () => clearTimeout(timer)
  }, [returned])

  const current = workspace?.plan ?? null
  const plans = pricing?.plans ?? []
  const sub = history?.subscription

  const isCurrent = (code: string) => current === code

  const beginCheckout = (planCode: string) => {
    checkoutMutation.mutate({ planCode, billingPeriod })
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Billing &amp; Plan</h1>
        <p className="text-sm text-muted mt-1">
          Your plan controls how many domains you can protect. Pay once with crypto,
          renew manually when ready.
        </p>
      </div>

      {/* Returning from checkout said "Payment confirmed. Your new plan is
          active." purely because the URL had ?billing=success on it. The plan
          is granted by the signed webhook, which arrives separately and can be
          slow or fail — so the banner could tell someone their plan was live
          while it was not. It now reports what the account actually says. */}
      {returned === 'success' && sub?.active && (
        <div className="flex items-start gap-3 bg-green-50 border border-green-200 rounded-2xl p-5">
          <div className="w-9 h-9 bg-green-600 rounded-xl flex items-center justify-center shrink-0">
            <HugeiconsIcon icon={CheckmarkCircle02Icon} className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-green-900 mb-1">Payment confirmed</h3>
            <p className="text-sm text-green-700 leading-relaxed">
              Your <strong>{sub.planName}</strong> plan is active
              {sub.expiresAt ? ` until ${formatDate(sub.expiresAt)}` : ''}.{' '}
              <Link to="/app/shield" className="font-bold underline">Set up your anti-bot protection</Link>.
            </p>
          </div>
        </div>
      )}

      {returned === 'success' && !sub?.active && !waitedTooLong && (
        <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-2xl p-5">
          <div className="w-9 h-9 bg-blue-600 rounded-xl flex items-center justify-center shrink-0">
            <HugeiconsIcon icon={RefreshIcon} className="w-4 h-4 text-white animate-spin" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-blue-900 mb-1">Confirming your payment…</h3>
            <p className="text-sm text-blue-700 leading-relaxed">
              Your payment went through and we're waiting for it to be confirmed. This is
              usually quick, but crypto confirmations can take a few minutes. You can leave this page —
              your plan turns on by itself, and we'll email you a receipt.
            </p>
          </div>
        </div>
      )}

      {returned === 'success' && !sub?.active && waitedTooLong && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-300 rounded-2xl p-5">
          <div>
            <h3 className="text-sm font-bold text-amber-900 mb-1">Your payment is still being confirmed</h3>
            <p className="text-sm text-amber-800 leading-relaxed">
              This is taking longer than usual. If you've been charged, nothing is lost — the
              plan turns on as soon as the payment clears, and we'll email your receipt. If it
              hasn't turned on within an hour,{' '}
              <Link to="/contact" className="font-bold underline">let us know</Link> and we'll
              sort it out.
            </p>
          </div>
        </div>
      )}

      {returned === 'cancelled' && (
        <div className="flex items-start gap-3 bg-neutral-50 border border-neutral-300 rounded-2xl p-5">
          <div>
            <h3 className="text-sm font-bold text-slate-900 mb-1">Checkout cancelled</h3>
            <p className="text-sm text-slate-700 leading-relaxed">
              You haven't been charged. Pick a plan below whenever you're ready.
            </p>
          </div>
        </div>
      )}

      {/* No grace window: the period ends and access ends with it, so this
          banner has to state plainly what stopped and what is safe. */}
      {sub?.status === 'suspended' && (
        <div className="flex items-start gap-3 bg-red-50 border border-red-300 rounded-2xl p-5">
          <div>
            <h3 className="text-sm font-bold text-red-900 mb-1">
              Your plan ended{sub.expiresAt ? ` on ${formatDate(sub.expiresAt)}` : ''}
            </h3>
            <p className="text-sm text-red-800 leading-relaxed">
              Bot protection is paused and your redirect links have stopped forwarding visitors.
              Your visitors can still reach your site normally — nothing is broken for them.
              Nothing has been deleted either: your domains, links, settings and traffic history
              are all intact, and renewing below turns everything back on straight away.
            </p>
          </div>
        </div>
      )}

      {/* Current status */}
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white border border-neutral-200 rounded-2xl p-5">
          <div className="text-xs font-bold text-muted uppercase tracking-wider mb-1">Current plan</div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xl font-bold text-slate-900">
              {sub?.status === 'suspended' ? 'Suspended' : (workspace?.planName ?? 'No plan')}
            </span>
            {/* "Basic" alone does not say what was bought — the tier and the
                period are separate choices at the same price point. */}
            {workspace?.planName && sub?.status !== 'suspended' && (
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                {workspace.planBillingPeriod === 'monthly' ? 'Monthly' : 'Weekly'}
              </span>
            )}
          </div>
          {sub?.mode && (
            <div className="text-xs text-muted mt-1">
              {PERIOD_DAYS[workspace?.planBillingPeriod ?? 'weekly']}-day access · One-time payment
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
          {sub?.mode === 'period' && sub?.active && (
            <div className="text-xs text-muted mt-1">
              {sub.expiresAt ? `Renew by ${formatDate(sub.expiresAt)}` : ''}
            </div>
          )}
        </div>
        <div className="bg-white border border-neutral-200 rounded-2xl p-5">
          <div className="text-xs font-bold text-muted uppercase tracking-wider mb-1">Domains</div>
          <div className="text-xl font-bold text-slate-900">
            {workspace?.planName ? `${workspace.domainsUsed ?? 0} / ${workspace.domainLimit ?? 0}` : '—'}
          </div>
          <div className="text-xs text-muted mt-1">
            {workspace?.planName
              ? `${(workspace.domainLimit ?? 0) - (workspace.domainsUsed ?? 0)} remaining`
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
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              {sub?.active ? 'Renew or switch your plan' : 'Choose your plan'}
            </h2>
            <p className="text-sm text-muted mt-0.5">
              Every tier has the same features — pick by how many domains you protect.
            </p>
            {/* Switching used to overwrite the expiry date, so people avoided
                changing plans mid-period. It now adds, and saying so is what
                makes that safe to act on. */}
            {sub?.active && (
              <p className="text-sm text-muted mt-1">
                Days you have left are added to whatever you buy next — you never lose
                time by renewing early or changing tier.
              </p>
            )}
          </div>
          <BillingPeriodToggle
            value={billingPeriod}
            onChange={setBillingPeriod}
            savings={bestMonthlySavings(plans)}
            tone="light"
          />
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {plans.map((plan: Plan) => {
            const isCurrentPlan = isCurrent(plan.code)
            const price = priceFor(plan, billingPeriod)
            const saving = monthlySavings(plan)
            const weeklyEquivalent = Math.round(
              plan.weeklyPrice * (PERIOD_DAYS.monthly / PERIOD_DAYS.weekly),
            )
            // Monthly needs its own Bachs product; without one, checkout would
            // 400. Surface that here instead of failing after the click.
            const unavailable = billingPeriod === 'monthly' && !plan.monthlyAvailable
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
                <div className="flex flex-wrap items-baseline gap-x-2 mb-1">
                  <span className="text-3xl font-bold text-slate-900">${price}</span>
                  <span className="text-sm text-muted font-normal">/{periodLabel(billingPeriod)}</span>
                  {billingPeriod === 'monthly' && saving > 0 && (
                    <span className="text-sm text-muted line-through">${weeklyEquivalent}</span>
                  )}
                </div>
                <p className="text-xs text-muted mb-4">
                  {billingPeriod === 'monthly'
                    ? `${PERIOD_DAYS.monthly} days of access${saving > 0 ? ` — save ${saving}%` : ''}`
                    : `${PERIOD_DAYS.weekly} days of access`}
                </p>
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
                {/* Renewing early has to be reachable: there is no grace period
                    behind the expiry date, so waiting for it is not an option. */}
                <button
                  onClick={() => beginCheckout(plan.code)}
                  disabled={checkoutMutation.isPending || unavailable}
                  className="bg-black hover:bg-neutral-800 disabled:bg-neutral-300 disabled:cursor-not-allowed text-white px-4 py-3 rounded-xl text-sm font-bold transition-all"
                >
                  {unavailable
                    ? 'Monthly coming soon'
                    : checkoutMutation.isPending
                      ? 'Opening checkout…'
                      : isCurrentPlan
                        ? `Renew ${plan.name}`
                        : sub?.active
                          ? `Switch to ${plan.name}`
                          : `Choose ${plan.name}`}
                </button>
                {isCurrentPlan && (
                  <Link
                    to="/app/shield"
                    className="text-center text-sm font-bold text-slate-600 hover:text-slate-900 mt-2 py-1 transition-colors"
                  >
                    Configure anti-bot
                  </Link>
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
