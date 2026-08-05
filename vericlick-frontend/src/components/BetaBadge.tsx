import { useSiteConfig } from '@/hooks/useSiteConfig'

interface BetaBadgeProps {
  light?: boolean
  className?: string
}

export function BetaBadge({ light = false, className = '' }: BetaBadgeProps) {
  const { data } = useSiteConfig()
  if (!data?.betaFreeMode) return null
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
        light
          ? 'bg-neutral-900 text-white border-neutral-900'
          : 'bg-white/15 text-white border-white/25'
      } ${className}`}
    >
      Beta
    </span>
  )
}