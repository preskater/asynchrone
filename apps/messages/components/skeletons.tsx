import { Skeleton } from "@workspace/ui/components/skeleton"

/** Route-level skeleton for the conversation screen. */
export function WorkspaceSkeleton() {
  return (
    <div className="flex min-h-0 flex-1 gap-3 overflow-hidden">
      <div className="hidden w-72 shrink-0 flex-col gap-2 rounded-xl p-3 ring-1 ring-foreground/10 md:flex">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-8 w-full" />
        {Array.from({ length: 8 }).map((_, index) => (
          <Skeleton key={index} className="h-12 w-full rounded-lg" />
        ))}
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-4 rounded-xl p-4 ring-1 ring-foreground/10">
        <div className="flex items-center gap-3">
          <Skeleton className="size-9 rounded-full" />
          <Skeleton className="h-5 w-40" />
        </div>
        <div className="flex flex-1 flex-col gap-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton
              key={index}
              className={index % 2 === 0 ? "h-16 w-3/5" : "ms-auto h-16 w-1/2"}
            />
          ))}
        </div>
        <Skeleton className="h-24 w-full rounded-lg" />
      </div>
    </div>
  )
}
