import Link from "next/link"

import {
  SUPPORT_TICKET_STATUSES,
  type SupportTicketStatus,
} from "@workspace/contracts"
import { Badge } from "@workspace/ui/components/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { cn } from "@workspace/ui/lib/utils"

import { PageHeader } from "@/components/page-header"
import { formatDateTime, formatRelative } from "@/lib/platform/format"
import { requirePlatformContext } from "@/lib/platform/guard"
import { identityAdmin } from "@/lib/platform/identity"
import { readString, type SearchParams } from "@/lib/platform/params"
import { STATUS_VARIANT, ticketTarget } from "@/lib/platform/support"

export const metadata = { title: "Support" }

export default async function SupportPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  await requirePlatformContext()

  const raw = readString(await searchParams, "status")
  // Default to the queue that needs a human: open tickets.
  const status: SupportTicketStatus | undefined =
    raw === "all"
      ? undefined
      : SUPPORT_TICKET_STATUSES.includes(raw as SupportTicketStatus)
        ? (raw as SupportTicketStatus)
        : "open"

  const { items: tickets } = await identityAdmin().listSupportTickets({
    status,
    limit: 100,
  })

  const tabs = [...SUPPORT_TICKET_STATUSES, "all"] as const

  return (
    <div className="space-y-5">
      <PageHeader
        title="Support"
        description="Tickets filed from the in-app Contact support form. Latest 100. Policy and escalation: docs/operations/support.md."
      />

      <div className="flex flex-wrap gap-1">
        {tabs.map((tab) => (
          <Link
            key={tab}
            href={`/support?status=${tab}`}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground capitalize transition-colors hover:bg-muted hover:text-foreground",
              (status ?? "all") === tab && "bg-muted text-foreground"
            )}
          >
            {tab}
          </Link>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ticket</TableHead>
              <TableHead>Organization</TableHead>
              <TableHead>Target</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Assignee</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tickets.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground">
                  No ticket in this view.
                </TableCell>
              </TableRow>
            ) : (
              tickets.map((ticket) => (
                <TableRow key={ticket.id}>
                  <TableCell>
                    <Link
                      href={`/support/${ticket.id}`}
                      className="flex flex-col hover:underline"
                    >
                      <span className="font-medium">
                        #{ticket.number} {ticket.title}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {ticket.category} · {ticket.contactEmail}
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/organizations/${ticket.organizationId}`}
                      className="hover:underline"
                    >
                      {ticket.organizationName}
                    </Link>
                    <span className="block text-xs text-muted-foreground capitalize">
                      {ticket.plan}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs whitespace-nowrap">
                    {ticketTarget(ticket.plan, ticket.impact)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={STATUS_VARIANT[ticket.status]}>
                      {ticket.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {ticket.assigneeEmail ?? "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    <span title={formatDateTime(ticket.createdAt)}>
                      {formatRelative(ticket.createdAt)}
                    </span>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
