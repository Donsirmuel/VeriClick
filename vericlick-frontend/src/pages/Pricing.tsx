import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { HugeiconsIcon } from '@hugeicons/react'
import { CheckmarkCircle02Icon, ArrowRight01Icon, Mail01Icon, ZapIcon, ShieldIcon, Globe02Icon, Chart03Icon, LinkSquare02Icon, Tag01Icon } from '@hugeicons/core-free-icons'
import toast from 'react-hot-toast'
import { PublicNav } from '@/components/PublicNav'
import { PublicFooter } from '@/components/PublicFooter'
import { fetchPricing, validateDiscountCode } from '@/api/pricing'
import type { Plan } from '@/types'

const COMMON_FEATURES = [
  'Unlimited tracked links',
  'Bot detection and rate limiting on every click',
  'IP allow/deny rules with whitelisting',
  'Domain health checks (automatic, in-app)',
  'DNS TXT domain ownership verification',
  'Dashboard with traffic chart and activity feed',
]

const HIGHLIGHTS = [
  { icon: LinkSquare02Icon, title: 'Tracked links', desc: 'Short links for any destination, with a human/bot breakdown for every click.' },
  { icon: ShieldIcon, title: 'Click verification', desc: 'Every request is checked against IP rules, bot signatures, and rate limits before it reaches your page.' },
  { icon: Globe02Icon, title: 'Domain health + ownership', desc: 'Domains are health-checked automatically and ownership is proven with a DNS TXT record.' },
  { icon: Chart03Icon, title: 'Live dashboard', desc: 'Traffic chart, activity feed, domain health, and a blocked-IP review queue — all explained in plain language.' },
]

const FREE_FEATURES = [
  '1 verified domain',
  '1 tracked link on your own domain',
  'Full protection engine — bot detection, IP rules, rate limits',
  '7-day trial, no credit card required',
]

function FreeTierCard() {
  return (
    <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-8 bg-neutral-950 border border-dashed border-neutral-600 rounded-3xl p-6 sm:p-8 mb-8">
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-xl font-bold">Free trial</h3>
          <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-300 bg-neutral-800/70 px-2 py-0.5 rounded-full">7 days</span>
        </div>
        <div className="text-4xl font-bold mb-5">
          $0
          <span className="text-base text-neutral-500 font-normal">/month</span>
        </div>
        <ul className="grid sm:grid-cols-2 gap-x-6 gap-y-2.5 text-sm text-neutral-300">
          {FREE_FEATURES.map((f) => (
            <li key={f} className="flex items-start gap-2.5">
              <HugeiconsIcon icon={CheckmarkCircle02Icon} className="w-4 h-4 text-neutral-400 shrink-0 mt-0.5" />
              {f}
            </li>
          ))}
        </ul>
      </div>
      <div className="shrink-0 flex flex-col items-start lg:items-center gap-3">
        <Link
          to="/auth/register"
          className="inline-flex items-center justify-center gap-2 border border-neutral-600 hover:border-neutral-400 text-white px-6 py-3.5 rounded-xl text-sm font-bold transition-all"
        >
          Start free trial
          <HugeiconsIcon icon={ArrowRight01Icon} className="w-4 h-4" />
        </Link>
        <p className="text-xs text-neutral-500">1 domain, 1 link, full protection engine.</p>
      </div>
    </div>
  )
}

function PlanCard({ plan, popular }: { plan: Plan; popular?: boolean }) {
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
      <div className="text-4xl font-bold mb-1">
        ${plan.monthlyPrice}
        <span className="text-base text-neutral-500 font-normal">/month</span>
      </div>
      <div className="grid grid-cols-2 gap-2 mb-6">
        <div className="rounded-xl bg-neutral-800/50 border border-neutral-700/60 px-4 py-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 mb-1">Domains</div>
          <div className="flex items-center gap-1.5 text-sm font-bold text-white">
            <HugeiconsIcon icon={Globe02Icon} className="w-4 h-4" />
            {plan.domainLimit}
          </div>
        </div>
        <div className="rounded-xl bg-neutral-800/50 border border-neutral-700/60 px-4 py-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 mb-1">Links</div>
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
        <h3 className="text-sm font-bold">Domain &amp; link limits</h3>
      </div>
      <p className="text-xs text-neutral-400 mb-6">
        Your plan only sets how many domains you can track — links are never the thing that changes.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-neutral-800 text-neutral-400">
              <th className="text-left pb-3 pr-6 font-semibold">Limit</th>
              <th className="text-left pb-3 pr-6 font-semibold">Free trial</th>
              {plans.map((p) => (
                <th key={p.code} className="text-left pb-3 font-bold text-white">{p.name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-neutral-900">
              <td className="py-3 pr-6 text-neutral-400">Tracked domains</td>
              <td className="py-3 pr-6 text-neutral-300">1</td>
              {plans.map((p) => (
                <td key={p.code} className="py-3 font-bold text-white">{p.domainLimit}</td>
              ))}
            </tr>
            <tr>
              <td className="py-3 pr-6 text-neutral-400">Tracked links</td>
              <td className="py-3 pr-6 text-neutral-300">1</td>
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
            Start with a free 7-day trial — 1 domain and 1 link, no credit card required. Then pick
            the plan that fits your domain count; tracked links are unlimited on every paid plan.
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
            <FreeTierCard />
            <LimitsBand plans={plans} />
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {plans.map((plan) => (
                <PlanCard key={plan.code} plan={plan} popular={plan.code === 'plus'} />
              ))}
            </div>
          </>
          )}

          <p className="text-center text-sm text-neutral-500 mt-8">
            The only difference between plans is the number of domains — Basic 5, Plus 10, Pro 20.
            Tracked links are unlimited on every paid plan, and every tier runs the full protection engine.
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
          <h2 className="text-3xl md:text-5xl font-bold mb-4">Set up your first tracked link in minutes</h2>
          <p className="text-neutral-400 text-lg mb-8 max-w-xl mx-auto">
            Create your account, add your domain, and start protecting your links today.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link to="/auth/register" className="bg-white hover:bg-neutral-200 text-black px-8 py-4 rounded-xl text-lg font-bold transition-all">
              Get started free
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