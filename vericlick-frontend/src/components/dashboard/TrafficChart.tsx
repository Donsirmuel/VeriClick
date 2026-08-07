import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import type { TrafficData, TimeRange } from '@/types'
import { formatNumber } from '@/lib/utils'
import { Skeleton } from '@/components/ui/Skeleton'

interface TrafficChartProps {
  data: TrafficData[]
  range: TimeRange
  onRangeChange: (range: TimeRange) => void
  loading?: boolean
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload || !payload.length) return null
  return (
    <div className="bg-white p-3 rounded-lg shadow-lg border border-border">
      <p className="text-xs font-bold text-slate-900 mb-2">{label}</p>
      {payload.map((entry: any, i: number) => (
        <div key={i} className="flex items-center gap-2 text-xs mb-1">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-muted font-medium">{entry.name}:</span>
          <span className="font-bold text-slate-900">{formatNumber(entry.value)}</span>
        </div>
      ))}
    </div>
  )
}

export function TrafficChart({ data, range, onRangeChange, loading = false }: TrafficChartProps) {
  return (
    <div className="bg-white p-6 rounded-2xl border border-border shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h3 className="text-lg font-bold text-slate-900">Traffic Overview</h3>
          <p className="text-sm text-muted mt-1">Human vs Bot traffic over time</p>
        </div>
        <div className="flex self-start sm:self-auto bg-neutral-100 rounded-lg p-1 gap-1">
          {(['7d', '30d', '90d'] as TimeRange[]).map((r) => (
            <button
              key={r}
              onClick={() => onRangeChange(r)}
              className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${
                range === r
                  ? 'bg-black text-white shadow-sm'
                  : 'text-muted hover:text-slate-900'
              }`}
            >
              {r === '7d' ? '7 Days' : r === '30d' ? '30 Days' : '90 Days'}
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
        ) : (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="colorHuman" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ffffff" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#ffffff" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorBot" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#EF4444" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#EF4444" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e5e5" />
            <XAxis 
              dataKey="date" 
              axisLine={false} 
              tickLine={false} 
              tick={{ fontSize: 11, fill: '#737373' }} 
            />
            <YAxis 
              axisLine={false} 
              tickLine={false} 
              tick={{ fontSize: 11, fill: '#737373' }}
              tickFormatter={(value) => formatNumber(value)}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend 
              verticalAlign="top" 
              height={36}
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize: '12px', fontWeight: 600 }}
            />
            <Area 
              type="monotone" 
              dataKey="human" 
              name="Human Traffic" 
              stroke="#ffffff" 
              strokeWidth={2}
              fill="url(#colorHuman)" 
            />
            <Area 
              type="monotone" 
              dataKey="bot" 
              name="Bot Traffic" 
              stroke="#EF4444" 
              strokeWidth={2}
              fill="url(#colorBot)" 
            />
          </AreaChart>
        </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
