export const ACTIVITY_STATUS_SENTINEL = "__STATUS__"

export interface ParsedActivityTarget {
  identifier: string
  status: string | null
}

export function parseActivityTarget(target: string): ParsedActivityTarget {
  const index = target.indexOf(ACTIVITY_STATUS_SENTINEL)
  if (index === -1) return { identifier: target, status: null }
  return {
    identifier: target.slice(0, index),
    status: target.slice(index + ACTIVITY_STATUS_SENTINEL.length),
  }
}
