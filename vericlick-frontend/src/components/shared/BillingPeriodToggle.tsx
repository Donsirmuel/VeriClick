import type { BillingPeriod, Plan } from '@/types'

/** Days of access each period buys — mirrors BILLING_PERIOD_DAYS on the server. */
export const PERIOD_DAYS: Record<BillingPeriod, number> = { weekly: 7, monthly: 30 }

export function periodLabel(period: BillingPeriod) {
  return period === 'monthly' ? 'month' : 'week'
}

export function priceFor(plan: Plan, period: BillingPeriod) {
  return period === 'monthly' ? plan.monthlyPrice : plan.weeklyPrice
}

/**
 * Percentage saved by buying 30 days as one monthly purchase instead of
 * repeating the weekly price across the same span. Returns 0 when monthly
 * isn't actually cheaper, so we never advertise a negative discount.
 */
export function monthlySavings(plan: Plan): number {
  if (!plan.weeklyPrice || !plan.monthlyPrice) return 0
  const weeklyEquivalent = plan.weeklyPrice * (PERIOD_DAYS.monthly / PERIOD_DAYS.weekly)
  if (weeklyEquivalent <= plan.monthlyPrice) return 0
  return Math.round((1 - plan.monthlyPrice / weeklyEquivalent) * 100)
}

/** The best monthly saving across all plans, for the toggle's badge. */
export function bestMonthlySavings(plans: Plan[]): number {
  return plans.reduce((best, p) => Math.max(best, monthlySavings(p)), 0)
}

type Tone = 'dark' | 'light'

const TONES: Record<Tone, { shell: string; active: string; idle: string; badge: string }> = {
  dark: {
    shell: 'border-neutral-800 bg-neutral-950',
    active: 'bg-white text-black shadow-sm',
    idle: 'text-neutral-400 hover:text-white',
    badge: 'bg-emerald-400/15 text-emerald-300 border-emerald-400/30',
  },
  light: {
    shell: 'border-neutral-200 bg-neutral-50',
    active: 'bg-white text-slate-900 shadow-sm',
    idle: 'text-muted hover:text-slate-700',
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
}

export function BillingPeriodToggle({
  value,
  onChange,
  savings = 0,
  tone = 'dark',
}: {
  value: BillingPeriod
  onChange: (p: BillingPeriod) => void
  savings?: number
  tone?: Tone
}) {
  const t = TONES[tone]
  const options: { key: BillingPeriod; label: string; sub: string }[] = [
    { key: 'weekly', label: 'Weekly', sub: '7 days' },
    { key: 'monthly', label: 'Monthly', sub: '30 days' },
  ]

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        role="radiogroup"
        aria-label="Billing period"
        className={`inline-flex w-full max-w-xs sm:w-auto rounded-2xl border p-1 ${t.shell}`}
      >
        {options.map((opt) => {
          const active = value === opt.key
          return (
            <button
              key={opt.key}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(opt.key)}
              className={`flex-1 sm:flex-none sm:min-w-[7.5rem] px-4 sm:px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${
                active ? t.active : t.idle
              }`}
            >
              <span className="block leading-tight">{opt.label}</span>
              <span className={`block text-[10px] font-medium leading-tight mt-0.5 ${active ? 'opacity-60' : 'opacity-70'}`}>
                {opt.sub}
              </span>
            </button>
          )
        })}
      </div>
      {savings > 0 && (
        <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full border ${t.badge}`}>
          Save up to {savings}% with monthly
        </span>
      )}
    </div>
  )
}
