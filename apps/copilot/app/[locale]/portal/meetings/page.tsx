import { redirect } from "next/navigation"

import { PortalMeetings } from "@workspace/portal/components/portal-meetings"

import { getPortalContext } from "@/lib/portal/context"
import { portalService } from "@/lib/portal"

export default async function PortalMeetingsPage() {
  const ctx = await getPortalContext()
  if (!ctx) redirect("/onboarding")

  const data = await portalService.getMeetings(ctx)
  return <PortalMeetings data={data} />
}
