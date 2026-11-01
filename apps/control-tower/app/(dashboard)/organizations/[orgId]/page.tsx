import Link from "next/link"
import { notFound } from "next/navigation"

import { ExternalLink } from "lucide-react"

import { prisma } from "@workspace/db-control-tower"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import { PageHeader } from "@/components/page-header"
import { OAuthClientToggle } from "@/components/oauth-client-toggle"
import { PlanForm } from "@/components/plan-form"
import { StatCard } from "@/components/stat-card"
import {
  formatBytes,
  formatDate,
  formatDateTime,
  formatNumber,
  formatRelative,
  formatUsdMicros,
} from "@/lib/platform/format"
import { requirePlatformContext } from "@/lib/platform/guard"
import { identityAdmin } from "@/lib/platform/identity"
import {
  aiBudgetMicros,
  quotaBytes,
  trialSummary,
  usagePercent,
} from "@/lib/platform/plan"

export const metadata = { title: "Organization" }

function toDate(value: string | null): Date | null {
  return value ? new Date(value) : null
}

export default async function OrganizationDetailPage({
  params,
}: {
  params: Promise<{ orgId: string }>
}) {
  const context = await requirePlatformContext()

  const { orgId } = await params

  // Customer data comes from Copilot's identity admin API; platform audit rows
  // stay in this app's own database.
  const organization = await identityAdmin().getOrganizationDetail(orgId)

  if (!organization) notFound()

  const platformEvents = await prisma.platformAuditEvent.findMany({
    where: { organizationId: orgId },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      action: true,
      actorEmail: true,
      actorRole: true,
      targetType: true,
      targetId: true,
      createdAt: true,
    },
  })

  const plan = organization.plan
  const quota = quotaBytes(plan, organization.storageQuotaBytes)
  const trial = trialSummary(organization.trialEndsAt)
  const trialEnded =
    !trial && organization.trialStartedAt !== null && plan === "free"
  const aiBudget = aiBudgetMicros(plan, organization.seatCount)
  const aiSpent = organization.aiUsage.costMicros
  const aiTokens =
    organization.aiUsage.inputTokens + organization.aiUsage.outputTokens
  const subscription = organization.subscription

  return (
    <div className="space-y-6">
      <PageHeader
        title={organization.name}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs">{organization.slug}</span>
            <Badge
              variant={plan === "free" ? "outline" : "secondary"}
              className="capitalize"
            >
              {plan}
            </Badge>
            {trial ? (
              <Badge variant="outline">
                trial · {trial.daysLeft} {trial.daysLeft === 1 ? "day" : "days"}{" "}
                left
              </Badge>
            ) : trialEnded ? (
              <Badge variant="outline">trial ended</Badge>
            ) : null}
            {trial ? (
              <span className="text-xs text-muted-foreground">
                · ends {formatDate(trial.endsAt)}
              </span>
            ) : null}
            {organization.deletionScheduledAt ? (
              <Badge variant="destructive">
                deletion {formatDate(organization.deletionScheduledAt)}
              </Badge>
            ) : null}
            <span>· created {formatDate(organization.createdAt)}</span>
            <span className="font-mono text-xs">· {organization.id}</span>
          </span>
        }
        actions={
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={
              <Link
                href={`${(process.env.PLATFORM_APP_URL ?? "").replace(/\/$/, "")}/${organization.slug}`}
                target="_blank"
                rel="noreferrer"
              />
            }
          >
            Open in app
            <ExternalLink />
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          label="Seats"
          value={formatNumber(organization.seatCount)}
          hint={`${formatNumber(organization.memberCount)} members including the client portal`}
        />
        <StatCard
          label="Storage quota"
          value={formatBytes(quota)}
          hint={
            organization.storageQuotaBytes !== null
              ? "per-organization override"
              : "plan default"
          }
        />
        <StatCard
          label="AI spend this month"
          value={formatUsdMicros(aiSpent)}
          hint={`${usagePercent(aiSpent, aiBudget)}% of ${formatUsdMicros(aiBudget)} · ${formatNumber(aiTokens)} tokens in ${formatNumber(organization.aiUsage.runs)} runs · last month ${formatUsdMicros(organization.previousMonthAiCostMicros)}`}
        />
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Plan & quota</h2>
        <div className="rounded-xl border bg-card p-4">
          <PlanForm
            organizationId={organization.id}
            plan={plan}
            quotaBytes={
              organization.storageQuotaBytes === null
                ? null
                : Number(organization.storageQuotaBytes)
            }
            subscription={
              subscription
                ? {
                    ...subscription,
                    currentPeriodEnd: toDate(subscription.currentPeriodEnd),
                    trialEndsAt: toDate(subscription.trialEndsAt),
                    updatedAt: new Date(subscription.updatedAt),
                  }
                : null
            }
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Members</h2>
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Access</TableHead>
                <TableHead className="text-end">Joined</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {organization.members.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-muted-foreground">
                    No members.
                  </TableCell>
                </TableRow>
              ) : (
                organization.members.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell>
                      <Link
                        href={`/users/${member.user.id}`}
                        className="flex flex-col hover:underline"
                      >
                        <span className="font-medium">{member.user.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {member.user.email}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="capitalize">
                        {member.role}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {member.clientId ? (
                        <Badge variant="secondary">Portal</Badge>
                      ) : (
                        <span className="text-muted-foreground">Workspace</span>
                      )}
                    </TableCell>
                    <TableCell className="text-end text-muted-foreground">
                      {formatDate(member.createdAt)}
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
                <TableHead className="text-end">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {organization.oauthClients.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-muted-foreground">
                    No OAuth client registered for this organization.
                  </TableCell>
                </TableRow>
              ) : (
                organization.oauthClients.map((client) => (
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
                    <TableCell className="text-end">
                      <OAuthClientToggle
                        clientId={client.clientId}
                        disabled={client.disabled}
                        canManage={context.role === "platform_admin"}
                      />
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
          <h2 className="text-sm font-semibold">Recent organization audit</h2>
          <div className="overflow-hidden rounded-xl border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Action</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead className="text-end">When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {organization.recentAudit.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={3} className="text-muted-foreground">
                      No audit entries.
                    </TableCell>
                  </TableRow>
                ) : (
                  organization.recentAudit.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="font-medium">
                        {entry.action}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {entry.entityType}
                      </TableCell>
                      <TableCell className="text-end text-muted-foreground">
                        {formatRelative(entry.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-semibold">Platform actions</h2>
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
      </div>
    </div>
  )
}
