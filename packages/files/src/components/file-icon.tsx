"use client"

import { FILE_KIND_COLOR, FILE_KIND_ICON } from "../file-utils"
import type { FileKind } from "../types"
import { cn } from "@workspace/ui/lib/utils"

export function FileIcon({
  kind,
  className,
}: {
  kind: FileKind
  className?: string
}) {
  const Icon = FILE_KIND_ICON[kind]
  return <Icon className={cn("size-4", FILE_KIND_COLOR[kind], className)} />
}
