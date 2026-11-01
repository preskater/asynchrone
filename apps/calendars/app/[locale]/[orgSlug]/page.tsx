import { redirect } from "next/navigation"

/** The workspace root on this host is the calendar. */
export default async function OrgHome({
  params,
}: {
  params: Promise<{ locale: string; orgSlug: string }>
}) {
  const { locale, orgSlug } = await params
  redirect(`/${locale}/${orgSlug}/calendars`)
}
