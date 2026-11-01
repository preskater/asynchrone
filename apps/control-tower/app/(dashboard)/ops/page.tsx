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
import {
  formatDateTime,
  formatNumber,
  formatRelative,
  formatUsdMicros,
} from "@/lib/platform/format"
import { requirePlatformContext } from "@/lib/platform/guard"
import { identityAdmin } from "@/lib/platform/identity"

export const metadata = { title: "Operations" }

export default async function OperationsPage() {
  await requirePlatformContext()

  // Latency of this app's own database; every customer metric comes from
  // Copilot's identity admin API.
  const startedAt = Date.now()
  await prisma.$queryRaw`SELECT 1`
  const latency = Date.now() - startedAt

  const ops = await identityAdmin().ops()
  const newestKey = ops.signingKeys[0]
  const aiUsage = ops.aiUsage

  return (
    <div className="space-y-6">
      <PageHeader
        title="Operations"
        description="Live signals. No historical metrics are stored yet."
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Control-tower database latency"
          value={`${latency} ms`}
          hint={`Pool max ${process.env.DATABASE_POOL_MAX ?? "3"} per instance`}
        />
        <StatCard
          label="Active customer sessions"
          value={formatNumber(ops.sessions.active)}
          hint={`${formatNumber(ops.sessions.expired)} expired rows`}
        />
        <StatCard
          label="Pending invitations"
          value={formatNumber(ops.invitations.pending)}
        />
        <StatCard
          label="Signing keys"
          value={formatNumber(ops.signingKeys.length)}
          hint={
            newestKey?.expiresAt
              ? `newest expires ${formatRelative(newestKey.expiresAt)}`
              : "no key"
          }
        />
        <StatCard
          label={`AI spend (${aiUsage.windowDays} days)`}
          value={formatUsdMicros(aiUsage.costMicros)}
          hint={`${formatNumber(aiUsage.inputTokens + aiUsage.outputTokens)} tokens in ${formatNumber(aiUsage.runs)} runs`}
        />
        <StatCard
          label="MCP / OAuth clients"
          value={formatNumber(ops.oauthClients.total)}
          hint={`${formatNumber(ops.oauthClients.disabled)} disabled`}
        />
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-semibold">Signing keys</h2>
        <p className="text-xs text-muted-foreground">
          Signing keys of the customer app's OAuth server. Only public metadata
          is read here; the control tower never decrypts them.
        </p>
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Key</TableHead>
                <TableHead>Algorithm</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-end">Expires</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ops.signingKeys.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-muted-foreground">
                    No signing key stored.
                  </TableCell>
                </TableRow>
              ) : (
                ops.signingKeys.map((key) => (
                  <TableRow key={key.id}>
                    <TableCell className="font-mono text-xs">
                      {key.id}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{key.alg}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {formatDateTime(key.createdAt)}
                    </TableCell>
                    <TableCell className="text-end text-muted-foreground">
                      {formatDateTime(key.expiresAt)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </section>

      <p className="text-xs text-muted-foreground">
        Environment{" "}
        {process.env.DEPLOY_ENV ?? process.env.NODE_ENV ?? "unknown"}
        {process.env.GIT_COMMIT_SHA
          ? ` · commit ${process.env.GIT_COMMIT_SHA.slice(0, 7)}`
          : ""}
      </p>
    </div>
  )
}
