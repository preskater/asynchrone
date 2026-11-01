import Link from "next/link"
import { notFound } from "next/navigation"

import { prisma } from "@workspace/db-control-tower"
import { Badge } from "@workspace/ui/components/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import { PageHeader } from "@/components/page-header"
import { StatCard } from "@/components/stat-card"
import { UserActions } from "@/components/user-actions"
import {
  formatDate,
  formatDateTime,
  formatNumber,
  formatRelative,
} from "@/lib/platform/format"
import { requirePlatformContext } from "@/lib/platform/guard"
import { identityAdmin } from "@/lib/platform/identity"
import { parsePlatformRoles } from "@/lib/platform/roles"

export const metadata = { title: "User" }

export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>
}) {
  const context = await requirePlatformContext()

  const { userId } = await params

  // Customer data comes from Copilot's identity admin API; platform audit rows
  // stay in this app's own database.
  const user = await identityAdmin().getUserDetail(userId)

  if (!user) notFound()

  const platformEvents = await prisma.platformAuditEvent.findMany({
    where: { targetType: "user", targetId: userId },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { id: true, action: true, actorEmail: true, createdAt: true },
  })

  const platformRoles = parsePlatformRoles(user.role)

  return (
    <div className="space-y-6">
      <PageHeader
        title={user.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span>{user.email}</span>
            <Badge variant={user.emailVerified ? "outline" : "secondary"}>
              {user.emailVerified ? "verified" : "pending"}
            </Badge>
            {user.banned ? <Badge variant="destructive">banned</Badge> : null}
            {platformRoles.map((role) => (
              <Badge key={role} variant="secondary">
                {role.replace("platform_", "")}
              </Badge>
            ))}
            <span className="font-mono text-xs">· {user.id}</span>
          </span>
        }
        actions={
          <UserActions
            userId={user.id}
            banned={user.banned}
            canImpersonate={context.role === "platform_admin"}
          />
        }
      />

      {user.banned ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <p className="font-medium text-destructive">Account banned</p>
          <p className="text-muted-foreground">
            {user.banReason ?? "No reason recorded."}
            {` · permanent`}
          </p>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Organizations"
          value={formatNumber(user.memberships.length)}
        />
        <StatCard
          label="Active sessions"
          value={formatNumber(user.sessions.length)}
        />
        <StatCard
          label="Linked accounts"
          value={formatNumber(user.accounts.length)}
        />
        <StatCard
          label="MCP clients"
          value={formatNumber(user.oauthClients.length)}
        />
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Memberships</h2>
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Organization</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Access</TableHead>
                <TableHead className="text-end">Joined</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {user.memberships.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-muted-foreground">
                    This account is not a member of any organization.
                  </TableCell>
                </TableRow>
              ) : (
                user.memberships.map((membership) => (
                  <TableRow key={membership.id}>
                    <TableCell>
                      <Link
                        href={`/organizations/${membership.organization.id}`}
                        className="flex flex-col hover:underline"
                      >
                        <span className="font-medium">
                          {membership.organization.name}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {membership.organization.slug}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {membership.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {membership.clientId ? (
                        <Badge variant="secondary">Portal</Badge>
                      ) : (
                        <span className="text-muted-foreground">Workspace</span>
                      )}
                    </TableCell>
                    <TableCell className="text-end text-muted-foreground">
                      {formatDate(membership.createdAt)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Active sessions</h2>
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Device</TableHead>
                <TableHead>IP</TableHead>
                <TableHead>Impersonated</TableHead>
                <TableHead className="text-end">Last used</TableHead>
                <TableHead className="text-end">Expires</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {user.sessions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground">
                    No active session.
                  </TableCell>
                </TableRow>
              ) : (
                user.sessions.map((session) => (
                  <TableRow key={session.id}>
                    <TableCell className="max-w-64">
                      <span className="line-clamp-1 text-muted-foreground">
                        {session.userAgent ?? "Unknown client"}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {session.ipAddress ?? "—"}
                    </TableCell>
                    <TableCell>
                      {session.impersonatedBy ? (
                        <Badge variant="destructive">yes</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-end text-muted-foreground">
                      <span title={formatDateTime(session.updatedAt)}>
                        {formatRelative(session.updatedAt)}
                      </span>
                    </TableCell>
                    <TableCell className="text-end text-muted-foreground">
                      {formatDateTime(session.expiresAt)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Linked accounts</h2>
          <div className="overflow-hidden rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Provider</TableHead>
                  <TableHead className="text-end">Linked</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {user.accounts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={2} className="text-muted-foreground">
                      No linked account.
                    </TableCell>
                  </TableRow>
                ) : (
                  user.accounts.map((account) => (
                    <TableRow key={account.providerId}>
                      <TableCell className="capitalize">
                        {account.providerId}
                      </TableCell>
                      <TableCell className="text-end text-muted-foreground">
                        {formatDate(account.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold">MCP / OAuth clients</h2>
          <div className="overflow-hidden rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-end">Created</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {user.oauthClients.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-muted-foreground">
                      No OAuth client registered by this user.
                    </TableCell>
                  </TableRow>
                ) : (
                  user.oauthClients.map((client) => (
                    <TableRow key={client.clientId}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium">
                            {client.name ?? client.clientId}
                          </span>
                          <span className="font-mono text-xs text-muted-foreground">
                            {client.clientId}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={client.disabled ? "destructive" : "outline"}
                        >
                          {client.disabled ? "disabled" : "active"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-end text-muted-foreground">
                        {client.createdAt ? formatDate(client.createdAt) : "—"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </section>
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">
          Platform actions on this account
        </h2>
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Action</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead className="text-end">When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {platformEvents.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-muted-foreground">
                    No platform action recorded.
                  </TableCell>
                </TableRow>
              ) : (
                platformEvents.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell className="font-medium">
                      {event.action}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {event.actorEmail}
                    </TableCell>
                    <TableCell className="text-end text-muted-foreground">
                      <span title={formatDateTime(event.createdAt)}>
                        {formatRelative(event.createdAt)}
                      </span>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      <p className="text-xs text-muted-foreground">
        Created {formatDateTime(user.createdAt)}
        {user.lastSeenAt
          ? ` · last seen ${formatDateTime(user.lastSeenAt)}`
          : ""}
      </p>
    </div>
  )
}
