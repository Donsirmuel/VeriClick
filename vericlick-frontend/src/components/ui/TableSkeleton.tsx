import { cn } from '@/lib/utils'
import { Skeleton } from '@/components/ui/Skeleton'

interface TableSkeletonProps {
  rows?: number
  columns?: number
}

export function TableSkeleton({ rows = 6, columns = 5 }: TableSkeletonProps) {
  return (
    <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden" role="status" aria-label="Loading content">
      <div className="border-b border-neutral-200 bg-neutral-50/50 px-6 py-4">
        <div className="flex items-center gap-12">
          {Array.from({ length: columns }).map((_, i) => (
            <Skeleton key={i} className="h-3.5 w-24" />
          ))}
        </div>
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-12 px-6 py-5 border-b border-neutral-100">
          {Array.from({ length: columns }).map((_, j) => (
            <Skeleton
              key={j}
              className={cn('h-4', j === columns - 1 ? 'w-16 ml-auto' : j === 0 ? 'w-40' : 'w-24')}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
