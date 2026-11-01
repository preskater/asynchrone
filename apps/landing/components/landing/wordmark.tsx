import { CommandIcon } from "lucide-react"

import { cn } from "@workspace/ui/lib/utils"

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2", className)}>
      <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <CommandIcon className="size-4" />
      </span>
      <span className="font-heading text-lg font-semibold tracking-tight">
        Asynchrone Space
      </span>
    </span>
  )
}
