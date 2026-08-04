import { cn } from '@/lib/utils'

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn('relative overflow-hidden rounded-lg bg-neutral-200/80 skeleton-shimmer', className)}
    />
  )
}
