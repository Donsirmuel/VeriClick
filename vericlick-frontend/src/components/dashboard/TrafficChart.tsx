import { useMemo } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell,
} from 'recharts'
import type { TrafficData, TimeRange } from '@/types'
import { formatNumber } from '@/lib/utils'
import { Skeleton } from '@/components/ui/Skeleton'

/**
 * Stacked bars rather than lines. The API only returns days that HAD traffic, so
 * a line silently joined across missing days and implied traffic that never
 * happened, and a single day rendered as one dot floating in an empty grid.
 * Bars over a gap-filled range read honestly at one point and at ninety.
 *
 * Colours are categorical slots 1 and 2 (blue / orange), validated for
 * colour-vision separation against this surface — not status red, which stays
 * reserved for genuine alert states elsewhere in the app.
 */
const HUMAN = '#2a78d6'
const BOT = '#eb6834'

const RANGE_DAYS: Record<TimeRange, number> = { '7d': 7, '30d': 30, '90d': 90 }
const RANGE_LABEL: Record<TimeRange, string> = { '7d': '7 days', '30d': '30 days', '90d': '90 days' }

interface TrafficChartProps {
  data: TrafficData[]
  range: TimeRange
  onRangeChange: (range: TimeRange) => void
  loading?: boolean
}

const DAY_MS = 86_400_000

/**
 * Every day in the range, zero-filled — a quiet day is data, not a gap.
 *
 * Built in UTC on purpose. The API groups by UTC day (Django TruncDate with
 * USE_TZ), so keys generated from LOCAL midnight would not match: in any zone
 * ahead of UTC, `new Date().setHours(0,0,0,0)` then `.toISOString()` lands on
 * the previous day, which both dropped today's bar and made every lookup miss.
 */
function fillRange(data: TrafficData[], days: number): TrafficData[] {
  const byDate = new Map(data.map((d) => [d.date, d]))
  const now = new Date()
  const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())

  const out: TrafficData[] = []
  for (let i = days - 1; i >= 0; i--) {
    const key = new Date(todayUTC - i * DAY_MS).toISOString().slice(0, 10)
    const hit = byDate.get(key)
    out.push({ date: key, human: hit?.human ?? 0, bot: hit?.bot ?? 0 })
  }
  return out
}

function shortDate(iso: string) {
  // Read back as UTC too, so the label names the same day the key does.
  const d = new Date(`${iso}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  const human = payload.find((p: any) => p.dataKey === 'human')?.value ?? 0
  const bot = payload.find((p: any) => p.dataKey === 'bot')?.value ?? 0
  const total = human + bot
  return (
    <div className="bg-white p-3 rounded-lg shadow-lg border border-border min-w-[160px]">
      <p className="text-xs font-bold text-slate-900 mb-2">{shortDate(label)}</p>
      {[
        { name: 'People', value: human, color: HUMAN },
        { name: 'Bots', value: bot, color: BOT },
      ].map((row) => (
        <div key={row.name} className="flex items-center gap-2 text-xs mb-1">
          <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: row.color }} />
          <span className="text-muted font-medium flex-1">{row.name}</span>
          <span className="font-bold text-slate-900">{formatNumber(row.value)}</span>
        </div>
      ))}
      <div className="flex items-center gap-2 text-xs pt-1.5 mt-1.5 border-t border-neutral-100">
        <span className="text-muted font-medium flex-1">Total</span>
        <span className="font-bold text-slate-900">{formatNumber(total)}</span>
      </div>
    </div>
  )
}

export function TrafficChart({ data, range, onRangeChange, loading = false }: TrafficChartProps) {
  const days = RANGE_DAYS[range]
  const series = useMemo(() => fillRange(data ?? [], days), [data, days])

  const { human, bot, total } = useMemo(() => {
    const h = series.reduce((n, d) => n + d.human, 0)
    const b = series.reduce((n, d) => n + d.bot, 0)
    return { human: h, bot: b, total: h + b }
  }, [series])

  // At 30 and 90 days every label would collide, so thin them to roughly six.
  const tickInterval = Math.max(0, Math.ceil(days / 6) - 1)

  return (
    <div className="bg-white p-6 rounded-2xl border border-border shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-6">
        <div>
          <h3 className="text-lg font-bold text-slate-900">Traffic overview</h3>
          <p className="text-sm text-muted mt-1">
            People vs bots across your protected sites and links
          </p>

          {/* Totals up front: the shape of the chart answers "when", these
              answer "how much" without reading the axis. */}
          {!loading && (
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mt-3">
              <span className="inline-flex items-baseline gap-1.5">
                <span className="w-2 h-2 rounded-full shrink-0 translate-y-[-1px]" style={{ backgroundColor: HUMAN }} />
                <span className="text-lg font-bold text-slate-900">{formatNumber(human)}</span>
                <span className="text-xs text-muted">people</span>
              </span>
              <span className="inline-flex items-baseline gap-1.5">
                <span className="w-2 h-2 rounded-full shrink-0 translate-y-[-1px]" style={{ backgroundColor: BOT }} />
                <span className="text-lg font-bold text-slate-900">{formatNumber(bot)}</span>
                <span className="text-xs text-muted">
                  bots{total > 0 ? ` (${Math.round((bot / total) * 100)}%)` : ''}
                </span>
              </span>
            </div>
          )}
        </div>

        <div className="flex self-start bg-neutral-100 rounded-lg p-1 gap-1 shrink-0">
          {(['7d', '30d', '90d'] as TimeRange[]).map((r) => (
            <button
              key={r}
              onClick={() => onRangeChange(r)}
              aria-pressed={range === r}
              className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${
                range === r ? 'bg-black text-white shadow-sm' : 'text-muted hover:text-slate-900'
              }`}
            >
              {RANGE_LABEL[r]}
            </button>
          ))}
        </div>
      </div>

      <div className="h-[320px]">
        {loading ? (
          <div className="space-y-3 py-2" role="status" aria-label="Loading chart">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-[220px] w-full rounded-xl" />
          </div>
        ) : total === 0 ? (
          // An empty grid with a lone axis reads as broken. Say what it means.
          <div className="h-full flex flex-col items-center justify-center text-center px-6">
            <p className="text-sm font-bold text-slate-900 mb-1">
              No traffic in the last {RANGE_LABEL[range]}
            </p>
            <p className="text-sm text-muted max-w-xs leading-relaxed">
              Visits to your protected sites and clicks on your redirect links will
              appear here as they happen.
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="18%">
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e5e5" />
              <XAxis
                dataKey="date"
                axisLine={false}
                tickLine={false}
                interval={tickInterval}
                tickFormatter={shortDate}
                tick={{ fontSize: 11, fill: '#737373' }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                // Visits are whole things — 0.25 of one is not a reading.
                allowDecimals={false}
                tick={{ fontSize: 11, fill: '#737373' }}
                tickFormatter={(v) => formatNumber(v)}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
              <Legend
                verticalAlign="top"
                height={32}
                iconType="circle"
                iconSize={8}
                wrapperStyle={{ fontSize: '12px', fontWeight: 600 }}
              />
              <Bar dataKey="human" name="People" stackId="t" fill={HUMAN} radius={[0, 0, 0, 0]} />
              <Bar dataKey="bot" name="Bots" stackId="t" fill={BOT} radius={[4, 4, 0, 0]}>
                {/* A 2px surface gap only reads where both segments exist. */}
                {series.map((d, i) => (
                  <Cell key={i} stroke={d.human > 0 && d.bot > 0 ? '#ffffff' : 'none'} strokeWidth={2} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
