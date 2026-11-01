import { Skeleton } from "@workspace/ui/components/skeleton"

export function MarketingSkeleton() {
  return (
    <div className="min-h-[60svh]">
      <section className="border-b bg-muted/30 py-16 sm:py-20">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 px-6 text-center">
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-10 w-80 max-w-full" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
      </section>
      <div className="mx-auto grid w-full max-w-6xl gap-4 px-6 py-20 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-40 rounded-xl" />
        ))}
      </div>
    </div>
  )
}

export function ProseSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-6 py-16">
      <Skeleton className="h-5 w-24" />
      <Skeleton className="h-10 w-3/4" />
      <Skeleton className="h-4 w-full max-w-md" />
      <div className="mt-6 flex flex-col gap-3">
        {Array.from({ length: 8 }).map((_, index) => (
          <Skeleton key={index} className="h-4 w-full" />
        ))}
      </div>
    </div>
  )
}
