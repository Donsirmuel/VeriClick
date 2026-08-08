import { HugeiconsIcon } from '@hugeicons/react'
import type { IconSvgElement } from '@hugeicons/react'
import { cn } from '@/lib/utils'

interface StatCardProps {
  title: string
  value: string | number
  subValue?: string
  icon: IconSvgElement
  trend?: {
    value: number
    isPositive: boolean
  }
  color?: 'primary' | 'success' | 'error' | 'warning'
}

export function StatCard({ title, value, subValue, icon: Icon, trend, color = 'primary' }: StatCardProps) {
  const colorMap = {
    primary: 'text-black bg-neutral-100',
    success: 'text-neutral-500 bg-neutral-100',
    error: 'text-error bg-error/10',
    warning: 'text-neutral-400 bg-neutral-100',
  }

  return (
    <div className="bg-white p-6 rounded-2xl border border-border shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-4">
        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", colorMap[color])}>
          <HugeiconsIcon icon={Icon} className="w-5 h-5" />
        </div>
        {trend && (
          <div className={cn(
            "text-xs font-bold px-2 py-1 rounded-full",
            trend.isPositive ? "text-neutral-500 bg-neutral-100" : "text-error bg-error/10"
          )}>
            {trend.isPositive ? '+' : '-'}{Math.abs(trend.value)}%
          </div>
        )}
      </div>
      <div>
        <p className="text-sm font-medium text-muted mb-1">{title}</p>
        <h3 className="text-2xl font-bold text-slate-900 tracking-tight">{value}</h3>
        {subValue && <p className="text-xs text-muted mt-1">{subValue}</p>}
      </div>
    </div>
  )
}
