import { Building2, Timer, Users } from "lucide-react"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import { StatCard } from "@/components/stat-card"
import { formatDate, formatNumber, formatRelative } from "@/lib/platform/format"
import { requirePlatformContext } from "@/lib/platform/guard"
import { identityAdmin } from "@/lib/platform/identity"

export const metadata = { title: "Overview" }

export default async function OverviewPage() {
  await requirePlatformContext()

  // Customer read models come from Copilot's identity admin API; the control
  // tower never connects to another app's database (ADR 0032).
  const overview = await identityAdmin().overview()
  const recent = overview.newestOrganizations

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Overview</h1>
        <p className="text-sm text-muted-foreground">
          Platform-wide state across every organization.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          label="Organizations"
          value={formatNumber(overview.organizations)}
          icon={Building2}
        />
        <StatCard
          label="Users"
          value={formatNumber(overview.users)}
          icon={Users}
        />
        <StatCard
          label="Active sessions"
          value={formatNumber(overview.activeSessions)}
          hint="Unexpired customer sessions"
          icon={Timer}
        />
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Newest organizations</h2>
        </div>
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Organization</TableHead>
                <TableHead>Members</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-end">Last activity</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recent.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-muted-foreground">
                    No organizations yet.
                  </TableCell>
                </TableRow>
              ) : (
                recent.map((organization) => (
                  <TableRow key={organization.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{organization.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {organization.slug}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {formatNumber(organization.memberCount)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDate(organization.createdAt)}
                    </TableCell>
                    <TableCell className="text-end text-muted-foreground">
                      {formatRelative(organization.createdAt)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  )
}
