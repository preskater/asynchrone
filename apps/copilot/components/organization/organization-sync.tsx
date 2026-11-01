"use client"

import * as React from "react"
import { useRouter } from "@workspace/i18n/navigation"

import { authClient } from "@/lib/auth-client"

export function OrganizationSync({
  needsSync,
  organizationId,
}: {
  needsSync: boolean
  organizationId: string
}) {
  const router = useRouter()
  const [started, setStarted] = React.useState(false)

  React.useEffect(() => {
    if (!needsSync || started) return
    setStarted(true)
    authClient.organization
      .setActive({ organizationId })
      .then(({ error }) => {
        if (!error) router.refresh()
      })
  }, [needsSync, started, organizationId, router])

  return null
}
