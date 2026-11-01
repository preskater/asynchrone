import { ClientsTabs } from "@workspace/clients/components/clients-tabs"

/**
 * The CRM tabs on the clients host.
 *
 * The server actions are provided once, at the `[orgSlug]` layout, through
 * `ClientActionsProvider`; this layout only adds the section navigation.
 */
export default async function ClientLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode
  params: Promise<{ orgSlug: string }>
}>) {
  const { orgSlug } = await params

  return (
    <div className="flex flex-1 flex-col gap-4 px-4 py-4 md:py-6 lg:px-6">
      <ClientsTabs orgSlug={orgSlug} />
      {children}
    </div>
  )
}
