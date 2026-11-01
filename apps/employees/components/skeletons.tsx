import { Skeleton } from "@workspace/ui/components/skeleton"

function SkeletonHeader() {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton className="h-6 w-40" />
      <Skeleton className="h-4 w-64" />
    </div>
  )
}

export function GridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="flex flex-1 flex-col gap-4 px-4 py-4 md:py-6 lg:px-6">
      <div className="flex items-center justify-between gap-3">
        <SkeletonHeader />
        <Skeleton className="h-8 w-32 rounded-lg" />
      </div>
      <div className="@container/main grid gap-4 pt-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: count }).map((_, index) => (
          <Skeleton key={index} className="h-40 rounded-xl" />
        ))}
      </div>
    </div>
  )
}

export function WorkspaceSkeleton() {
  return (
    <div className="flex flex-1 flex-col gap-4 px-4 py-4 md:py-6 lg:px-6">
      <div className="flex items-center gap-3">
        <Skeleton className="size-9 rounded-lg" />
        <SkeletonHeader />
      </div>
      <div className="grid gap-4 pt-2 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-28 rounded-xl" />
        ))}
      </div>
    </div>
  )
}
