import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { HugeiconsIcon } from '@hugeicons/react'
import { CheckmarkCircle02Icon, ArrowRight01Icon, Mail01Icon, ZapIcon, ShieldIcon, Globe02Icon, Chart03Icon, LinkSquare02Icon, Tag01Icon } from '@hugeicons/core-free-icons'
import toast from 'react-hot-toast'
import { PublicNav } from '@/components/PublicNav'
import { PublicFooter } from '@/components/PublicFooter'
import { fetchPricing, validateDiscountCode } from '@/api/pricing'
import {
  BillingPeriodToggle, bestMonthlySavings, monthlySavings, periodLabel, priceFor, PERIOD_DAYS,
} from '@/components/shared/BillingPeriodToggle'
import type { BillingPeriod, Plan } from '@/types'

const COMMON_FEATURES = [
  'Unlimited page protection',
  'Bot detection and rate limiting on every request',
  'IP allow/deny rules with whitelisting',
  'Real-time bot detection and site health monitoring',
  'Single script tag — no DNS records needed',
  'Dashboard with traffic chart and activity feed',
]

const HIGHLIGHTS = [
  { icon: ShieldIcon, title: 'Protected pages', desc: 'Paste a single script tag into your site and every page is covered — no per-link setup required.' },
  { icon: LinkSquare02Icon, title: 'Bot detection', desc: 'Every request is checked against IP rules, bot signatures, and rate limits before it reaches your page.' },
  { icon: Globe02Icon, title: 'Real-time monitoring', desc: 'Your site is monitored in real time for suspicious traffic patterns and malicious bots.' },
  { icon: Chart03Icon, title: 'Live dashboard', desc: 'Traffic chart, activity feed, site health, and a blocked-IP review queue — all explained in plain language.' },
]

function PlanCard({ plan, popular, period }: { plan: Plan; popular?: boolean; period: BillingPeriod }) {
  const price = priceFor(plan, period)
  const saving = monthlySavings(plan)
  // What the same 30 days would cost bought week by week — the anchor that
  // makes the monthly price legible as a saving.
  const weeklyEquivalent = Math.round(plan.weeklyPrice * (PERIOD_DAYS.monthly / PERIOD_DAYS.weekly))

  return (
    <div
      className={`relative flex flex-col bg-neutral-950 border rounded-3xl p-6 sm:p-8 ${
        popular ? 'border-white shadow-xl shadow-white/5' : 'border-neutral-800'
      }`}
    >
      {popular && (
        <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10px] font-bold uppercase tracking-wider text-black bg-white px-3 py-1 rounded-full">
          Most popular
        </span>
      )}
      <div className="flex items-center gap-2 mb-4">
        <h3 className="text-xl font-bold">{plan.name}</h3>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-2 mb-1">
        <span className="text-4xl font-bold">${price}</span>
        <span className="text-base text-neutral-500 font-normal">/{periodLabel(period)}</span>
        {period === 'monthly' && saving > 0 && (
          <span className="text-sm text-neutral-500 line-through">${weeklyEquivalent}</span>
        )}
      </div>
      <p className="text-xs text-neutral-500 mb-1 min-h-[1rem]">
        {period === 'monthly' && saving > 0
          ? `Save ${saving}% vs paying weekly`
          : 'One-time payment, renew when you choose'}
      </p>
      <div className="grid grid-cols-2 gap-2 mb-6">
        <div className="rounded-xl bg-neutral-800/50 border border-neutral-700/60 px-4 py-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 mb-1">Domains</div>
          <div className="flex items-center gap-1.5 text-sm font-bold text-white">
            <HugeiconsIcon icon={Globe02Icon} className="w-4 h-4" />
            {plan.domainLimit ?? '—'}
          </div>
        </div>
        <div className="rounded-xl bg-neutral-800/50 border border-neutral-700/60 px-4 py-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 mb-1">Pages</div>
          <div className="flex items-center gap-1.5 text-sm font-bold text-white">
            <HugeiconsIcon icon={LinkSquare02Icon} className="w-4 h-4" />
            Unlimited
          </div>
        </div>
      </div>

      <ul className="space-y-2.5 mb-8 text-sm text-neutral-300 flex-1">
        {COMMON_FEATURES.map((f) => (
          <li key={f} className="flex items-start gap-2.5">
            <HugeiconsIcon icon={CheckmarkCircle02Icon} className="w-4 h-4 text-neutral-400 shrink-0 mt-0.5" />
            {f}
          </li>
        ))}
        {plan.features.map((f) => (
          <li key={f} className="flex items-start gap-2.5">
            <HugeiconsIcon icon={CheckmarkCircle02Icon} className="w-4 h-4 text-neutral-400 shrink-0 mt-0.5" />
            <span className="text-white">{f}</span>
          </li>
        ))}
      </ul>

      <Link
        to="/auth/register"
        className={`inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl text-sm font-bold transition-all ${
          popular ? 'bg-white hover:bg-neutral-200 text-black' : 'border border-neutral-700 hover:border-neutral-500 text-white'
        }`}
      >
        Choose {plan.name}
        <HugeiconsIcon icon={ArrowRight01Icon} className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
      </Link>
    </div>
  )
}

function LimitsBand({ plans }: { plans: Plan[] }) {
  return (
    <div className="mb-8 bg-neutral-950 border border-neutral-800 rounded-3xl p-6 sm:p-8">
      <div className="flex items-center gap-2 mb-1">
        <HugeiconsIcon icon={Globe02Icon} className="w-4 h-4 text-neutral-300" />
        <h3 className="text-sm font-bold">Plan features</h3>
      </div>
      <p className="text-xs text-neutral-400 mb-6">
        Your plan sets how many sites you can protect — protected pages are always unlimited.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-neutral-800 text-neutral-400">
              <th className="text-left pb-3 pr-6 font-semibold">Limit</th>
              {plans.map((p) => (
                <th key={p.code} className="text-left pb-3 font-bold text-white">{p.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-neutral-900">
              <td className="py-3 pr-6 text-neutral-400">Domains</td>
              {plans.map((p) => (
                <td key={p.code} className="py-3 font-bold text-white">{p.domainLimit}</td>
              ))}
            </tr>
            <tr>
              <td className="py-3 pr-6 text-neutral-400">Protected pages</td>
              {plans.map((p) => (
                <td key={p.code} className="py-3 font-bold text-white">Unlimited</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function Pricing() {
  const { data: pricing, isLoading, isError, refetch } = useQuery({ queryKey: ['pricing'], queryFn: fetchPricing })
  const plans = pricing?.plans ?? []

  const [period, setPeriod] = useState<BillingPeriod>('weekly')
  const [discountCode, setDiscountCode] = useState('')
  const [checking, setChecking] = useState(false)
  const [applied, setApplied] = useState<{ code: string; percent: number } | null>(null)

  const handleApplyDiscount = async () => {
    const code = discountCode.trim()
    if (!code) {
      toast.error('Enter a discount code first')
      return
    }
    setChecking(true)
    try {
      const res = await validateDiscountCode(code)
      setApplied({ code: res.code ?? code, percent: res.discountPercent ?? 0 })
      toast.success(`${res.discountPercent}% off applied`)
    } catch {
      setApplied(null)
      toast.error('That discount code is not valid')
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="bg-black text-white selection:bg-white selection:text-black">
      <PublicNav featuresHref="/#features" />

      {/* Hero */}
      <section className="relative px-6 overflow-hidden">
        <div className="absolute inset-0 hero-grid-bg opacity-30" />
        <div className="max-w-4xl mx-auto text-center py-24 relative z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-neutral-700/50 bg-neutral-900/60 text-xs font-bold text-neutral-300 uppercase tracking-wider mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse-dot" />
            Pricing
          </div>
          <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6 leading-tight">
            Simple plans.<br />Clear pricing.
          </h1>
          <p className="text-lg text-neutral-400 max-w-2xl mx-auto mb-4 leading-relaxed">
            Pick the plan that fits your needs. Pay once for a week or a month of
            access, then renew whenever you choose. No subscription.
          </p>
        </div>
      </section>

      {/* Paid plans */}
      <section className="px-6 pb-16">
        <div className="max-w-6xl mx-auto">
          {isLoading && (
            <p className="text-center text-sm text-neutral-500 py-16">Loading plans…</p>
          )}
          {isError && (
            <div className="mb-10 bg-red-950/30 border border-red-800/50 rounded-2xl p-6 text-center">
              <h3 className="text-sm font-bold mb-1">Couldn't load pricing</h3>
              <p className="text-sm text-neutral-400 mb-4">The live status and plans couldn't be fetched right now.</p>
              <button onClick={() => refetch()} className="bg-white hover:bg-neutral-200 text-black px-4 py-2 rounded-xl text-sm font-bold transition-all">
                Try again
              </button>
            </div>
          )}
          {!isLoading && !isError && (
          <>
            <LimitsBand plans={plans} />
            <div className="flex justify-center mb-8">
              <BillingPeriodToggle
                value={period}
                onChange={setPeriod}
                savings={bestMonthlySavings(plans)}
                tone="dark"
              />
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {plans.map((plan) => (
                <PlanCard key={plan.code} plan={plan} popular={plan.code === 'plus'} period={period} />
              ))}
            </div>
          </>
          )}

          {/* Checkout is crypto-only by choice, both here and in Bachs. The
              two questions people actually have were the ones going
              unanswered: does it auto-renew, and what happens on the last day. */}
          <p className="text-center text-sm text-neutral-500 mt-8 max-w-2xl mx-auto leading-relaxed">
            Every plan includes unlimited protected pages and the same full feature set —
            tiers differ only by how many domains you can protect. Pay once with crypto for
            {period === 'monthly' ? ' 30 days' : ' 7 days'} of access.
          </p>
          <p className="text-center text-sm text-neutral-500 mt-3 max-w-2xl mx-auto leading-relaxed">
            No subscription and no automatic renewal — nothing is ever charged again unless
            you choose to buy another period. We email you before your access ends, and any
            days you have left are added on top when you renew.
          </p>
        </div>
      </section>

      {/* Discount code */}
      <section className="px-6 pb-20">
        <div className="max-w-lg mx-auto">
          <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-6">
            <div className="flex items-center gap-2 mb-1">
              <HugeiconsIcon icon={Tag01Icon} className="w-4 h-4 text-neutral-300" />
              <h3 className="text-sm font-bold">Have a discount code?</h3>
            </div>
            <p className="text-xs text-neutral-400 mb-4">Enter a code to check whether it's valid.</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={discountCode}
                onChange={(e) => {
                  setDiscountCode(e.target.value)
                  setApplied(null)
                }}
                placeholder="e.g. LAUNCH20"
                className="flex-1 bg-black border border-neutral-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-neutral-500 transition-colors placeholder:text-neutral-600"
              />
              <button
                onClick={handleApplyDiscount}
                disabled={checking}
                className="bg-white hover:bg-neutral-200 text-black px-5 py-3 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
              >
                {checking ? 'Checking...' : 'Apply'}
              </button>
            </div>
            {applied && (
              <p className="text-xs text-success mt-3">
                {applied.code} is valid — {applied.percent}% off.
              </p>
            )}
          </div>
        </div>
      </section>

      {/* What you get */}
      <section className="px-6 pb-24">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold mb-4">Every plan includes</h2>
            <p className="text-neutral-400 max-w-2xl mx-auto">The full VeriClick protection engine, on every tier.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {HIGHLIGHTS.map((f) => (
              <div key={f.title} className="bg-neutral-950 border border-neutral-800/80 p-6 rounded-2xl">
                <div className="w-10 h-10 bg-neutral-800/70 rounded-xl flex items-center justify-center mb-4">
                  <HugeiconsIcon icon={f.icon} className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold mb-2">{f.title}</h3>
                <p className="text-sm text-neutral-400 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-6 pb-28">
        <div className="max-w-4xl mx-auto text-center bg-neutral-950 border border-neutral-800 rounded-3xl p-10 md:p-16 relative overflow-hidden">
          <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-white/1 rounded-full blur-[100px] pointer-events-none" />
          <HugeiconsIcon icon={ZapIcon} className="w-8 h-8 mx-auto mb-6" />
          <h2 className="text-3xl md:text-5xl font-bold mb-4">Protect your site in minutes</h2>
          <p className="text-neutral-400 text-lg mb-8 max-w-xl mx-auto">
            Create your account, add the script, and start protecting your site today.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link to="/auth/register" className="bg-white hover:bg-neutral-200 text-black px-8 py-4 rounded-xl text-lg font-bold transition-all">
              Get started
            </Link>
            <Link to="/contact" className="inline-flex items-center gap-2 border border-neutral-700 hover:border-neutral-500 px-8 py-4 rounded-xl text-lg font-bold transition-colors">
              <HugeiconsIcon icon={Mail01Icon} className="w-5 h-5" />
              Contact us
            </Link>
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  )
}