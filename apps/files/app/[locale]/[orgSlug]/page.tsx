import { redirect } from "next/navigation"

/** The workspace root on this host is the files list. */
export default async function OrgHome({
  params,
}: {
  params: Promise<{ locale: string; orgSlug: string }>
}) {
  const { locale, orgSlug } = await params
  redirect(`/${locale}/${orgSlug}/files`)
}
