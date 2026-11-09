import Link from "next/link"
import { notFound } from "next/navigation"

import { IdentityAdminClientError } from "@workspace/contracts"
import { prisma } from "@workspace/db-control-tower"
import { Badge } from "@workspace/ui/components/badge"

import { PageHeader } from "@/components/page-header"
import { SupportTicketActions } from "@/components/support-ticket-actions"
import { formatDateTime, formatRelative } from "@/lib/platform/format"
import { requirePlatformContext } from "@/lib/platform/guard"
import { identityAdmin } from "@/lib/platform/identity"
import { STATUS_VARIANT, ticketTarget } from "@/lib/platform/support"

export const metadata = { title: "Support ticket" }

function text(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—"
  if (Array.isArray(value)) return value.length ? value.join("\n") : "—"
  return String(value)
}

function Fields({
  title,
  values,
}: {
  title: string
  values: [string, unknown][]
}) {
  return (
    <section className="space-y-2 rounded-xl border bg-card p-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[10rem_1fr]">
        {values.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="font-mono text-xs break-all whitespace-pre-wrap">
              {text(value)}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

export default async function SupportTicketPage({
  params,
}: {
  params: Promise<{ ticketId: string }>
}) {
  const context = await requirePlatformContext()
  const { ticketId } = await params

  const ticket = await identityAdmin()
    .getSupportTicket(ticketId)
    .catch((error: unknown) => {
      if (error instanceof IdentityAdminClientError && error.status === 404) {
        return null
      }
      throw error
    })
  if (!ticket) notFound()

  const history = await prisma.platformAuditEvent.findMany({
    where: { targetType: "support_ticket", targetId: ticketId },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { id: true, action: true, actorEmail: true, createdAt: true },
  })

  const details = Object.entries(ticket.details).filter(
    ([, value]) => value !== "" && value !== null && value !== "unknown"
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title={`#${ticket.number} ${ticket.title}`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant={STATUS_VARIANT[ticket.status]}>
              {ticket.status}
            </Badge>
            <span>{ticketTarget(ticket.plan, ticket.impact)}</span>
            <span>·</span>
            <span>{ticket.assigneeEmail ?? "Unassigned"}</span>
          </span>
        }
        actions={
          <SupportTicketActions
            ticketId={ticket.id}
            status={ticket.status}
            assignedToMe={ticket.assigneeEmail === context.userEmail}
          />
        }
      />

      <section className="space-y-2 rounded-xl border bg-card p-4">
        <h2 className="text-sm font-semibold">Report</h2>
        <p className="text-sm whitespace-pre-wrap">{ticket.description}</p>
      </section>

      {details.length > 0 ? <Fields title="Details" values={details} /> : null}

      <Fields
        title="Reporter"
        values={[
          ["Contact", ticket.contactEmail],
          ["May be contacted", ticket.allowContact ? "Yes" : "No"],
          ["Category / impact", `${ticket.category} / ${ticket.impact}`],
        ]}
      />

      <section className="flex flex-wrap gap-4 text-sm">
        <Link
          href={`/organizations/${ticket.organizationId}`}
          className="underline"
        >
          {ticket.organizationName} ({ticket.plan})
        </Link>
        <Link href={`/users/${ticket.userId}`} className="underline">
          {ticket.userName ?? ticket.userId} — sessions, ban, impersonation
        </Link>
      </section>

      <Fields title="Diagnostics" values={Object.entries(ticket.context)} />

      <Fields
        title="Lifecycle"
        values={[
          ["Created", formatDateTime(ticket.createdAt)],
          [
            "Acknowledged",
            ticket.acknowledgedAt
              ? formatDateTime(ticket.acknowledgedAt)
              : null,
          ],
          [
            "Resolved",
            ticket.resolvedAt ? formatDateTime(ticket.resolvedAt) : null,
          ],
          ...history.map(
            (event) =>
              [
                formatRelative(event.createdAt),
                `${event.action} by ${event.actorEmail}`,
              ] as [string, unknown]
          ),
        ]}
      />
    </div>
  )
}
