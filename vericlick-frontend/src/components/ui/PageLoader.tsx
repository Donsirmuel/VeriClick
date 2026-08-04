import { Skeleton } from '@/components/ui/Skeleton'

export function PageLoader() {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center px-6 py-12" role="status" aria-label="Loading VeriClick">
      <div className="w-full max-w-2xl space-y-8">
        <div className="flex justify-center">
          <Skeleton className="w-12 h-12 rounded-2xl" />
        </div>

        <div className="space-y-3 flex flex-col items-center">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96 max-w-full" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <Skeleton className="h-44 w-full rounded-2xl" />
          <Skeleton className="h-44 w-full rounded-2xl" />
        </div>

        <div className="flex justify-center gap-3">
          <Skeleton className="h-12 w-44 rounded-xl" />
          <Skeleton className="h-12 w-44 rounded-xl" />
        </div>
      </div>
    </div>
  )
}
