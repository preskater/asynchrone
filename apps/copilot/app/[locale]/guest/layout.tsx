import { GuestHeader } from "@/components/guests/guest-controls"
import { getGuestUser } from "@/lib/guests/session"

/**
 * The external-collaborator space (ADR 0041). It lives outside the workspace
 * routes on purpose: a guest has no `member` row, so every workspace gate
 * already refuses them, and these pages only read through the grant.
 */
export default async function GuestLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const user = await getGuestUser()
  return (
    <div className="flex min-h-svh flex-col bg-muted/30">
      <GuestHeader userName={user?.name ?? null} />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 md:px-6">
        {children}
      </main>
    </div>
  )
}
