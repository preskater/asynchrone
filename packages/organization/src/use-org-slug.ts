"use client"

import { useParams } from "next/navigation"

export function useOrgSlug() {
  const params = useParams<{ orgSlug: string }>()
  return params.orgSlug
}
