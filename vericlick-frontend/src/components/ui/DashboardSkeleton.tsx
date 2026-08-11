import { Skeleton } from '@/components/ui/Skeleton'

function StatCardSkeleton() {
  return (
    <div className="bg-white p-6 rounded-2xl border border-border shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <Skeleton className="w-10 h-10 rounded-xl" />
        <Skeleton className="h-5 w-14 rounded-full" />
      </div>
      <Skeleton className="h-4 w-28 mb-2" />
      <Skeleton className="h-7 w-20" />
    </div>
  )
}

function CardSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="bg-white p-6 rounded-2xl border border-border shadow-sm">
      <div className="flex items-center justify-between mb-6">
        <div className="flex-1">
          <Skeleton className="h-5 w-40 mb-2" />
          <Skeleton className="h-3.5 w-56" />
        </div>
        <Skeleton className="h-4 w-16" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: lines }).map((_, i) => (
          <div key={i} className="flex items-center justify-between">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-14" />
          </div>
        ))}
      </div>
    </div>
  )
}

export function DashboardSkeleton() {
  return (
    <div role="status" aria-label="Loading dashboard">
      <div className="flex items-center justify-between mb-8 gap-4">
        <div className="min-w-0 flex-1">
          <Skeleton className="h-7 w-48 max-w-full mb-2" />
          <Skeleton className="h-4 w-64 max-w-full" />
        </div>
        <Skeleton className="h-8 w-44 max-w-full rounded-lg shrink-0" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {Array.from({ length: 4 }).map((_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <div className="bg-white p-6 rounded-2xl border border-border shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <div>
                <Skeleton className="h-5 w-40 mb-2" />
                <Skeleton className="h-3.5 w-56" />
              </div>
              <Skeleton className="h-8 w-44 rounded-lg" />
            </div>
            <Skeleton className="h-[260px] w-full rounded-xl" />
          </div>
        </div>
        <div className="space-y-6">
          <CardSkeleton lines={3} />
          <CardSkeleton lines={4} />
        </div>
      </div>

      <div className="mt-6">
        <div className="bg-white p-6 rounded-2xl border border-border shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div>
              <Skeleton className="h-5 w-32 mb-2" />
              <Skeleton className="h-3.5 w-48" />
            </div>
            <Skeleton className="h-5 w-20 rounded-full" />
          </div>
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="w-10 h-10 rounded-lg shrink-0" />
                <div className="flex-1 min-w-0 space-y-2">
                  <Skeleton className="h-3.5 w-40 max-w-full" />
                  <Skeleton className="h-3 w-64 max-w-full" />
                </div>
                <Skeleton className="h-3.5 w-14 shrink-0" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
