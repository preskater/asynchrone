import "dotenv/config"

import { createServer } from "node:http"
import type { AddressInfo } from "node:net"

import {
  APPS,
  CUSTOMER_APP_KEYS,
  SERVICE_SCOPES,
  internalAudience,
} from "@workspace/contracts"
import type { RequestContext } from "@workspace/core/context"
import type { MemberRole } from "@workspace/contracts"
import { z } from "zod"

/**
 * Failure-injection probe for the cross-app e2e suite (#210).
 *
 * The fan-out (search, audit), the delegated domain gateway and the
 * cross-database deletion saga are Copilot modules. A workspace package may
 * not import an app, so the suite spawns this script with the origins the case
 * needs and reads one JSON line from stdout. Everything runs the real Copilot
 * code against the real identity database and the running apps; only the
 * "recovered app" in the deletion-retry case is a local origin so the probe can
 * fail it once and then let it answer (the domain apps mount the same route).
 *
 *   tsx apps/copilot/scripts/e2e-cross-app-probe.ts search '{"…"}'
 *
 * Commands: `search`, `audit`, `delegated`, `revoke`, `deletion-retry`.
 */

interface ProbeArgs {
  organizationId: string
  organizationSlug: string
  userId: string
  userName: string
  userEmail: string
  role: MemberRole
  query?: string
  /** Domain origins this case wants configured; every other app is cleared. */
  appUrls?: Record<string, string>
}

const [command, rawArgs] = process.argv.slice(2)
const args = JSON.parse(rawArgs ?? "{}") as ProbeArgs

// One process per case: start from "no domain app configured", then set the
// origins the case injects. `searchRemotes`/`auditRemotes`/`sagaRemotes` read
// these at call time, so this is the whole injection surface.
for (const key of CUSTOMER_APP_KEYS) {
  delete process.env[APPS[key].hostEnv]
}
for (const [key, url] of Object.entries(args.appUrls ?? {})) {
  const definition = APPS[key as keyof typeof APPS]
  if (!definition || !url) continue
  process.env[definition.hostEnv] = url
}

const ctx: RequestContext = {
  userId: args.userId,
  userName: args.userName,
  userEmail: args.userEmail,
  organizationId: args.organizationId,
  role: args.role,
}

function unavailableApps(
  entries: { app: string; code?: string }[] | undefined
): string[] {
  return (entries ?? []).map((entry) => entry.app)
}

async function createProbeProject(): Promise<{ id: string; name: string }> {
  const { callDomain, delegatedContext } = await import("@/lib/internal/domain")
  const name = `Probe project ${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 6)}`
  const project = await callDomain(
    "projects",
    "create-project",
    delegatedContext(ctx),
    { name },
    z.object({ id: z.string(), name: z.string() })
  )
  return { id: project.id, name: project.name }
}

/**
 * Global search over the in-process domains plus whatever HTTP remotes are
 * configured. A configured but unreachable app must degrade the result to
 * `partial`, never fail the whole query.
 */
async function search() {
  const { searchWorkspace } = await import("@/lib/search")
  const project = await createProbeProject()
  const output = await searchWorkspace(
    ctx,
    args.organizationSlug,
    project.name,
    { timeoutMs: 1_500 }
  )
  return {
    query: project.name,
    partial: output.partial,
    unavailableApps: unavailableApps(output.unavailableApps),
    results: output.results.map((result) => ({
      app: result.app,
      id: result.id,
      title: result.title,
    })),
  }
}

/**
 * The audit trail fan-out: the local rows plus one read per configured app,
 * then the same filter as an export. `auditLog` is an Enterprise entitlement,
 * so grant the throwaway organization that plan first.
 */
async function audit() {
  const { prisma } = await import("@/lib/prisma")
  await prisma.organization.update({
    where: { id: args.organizationId },
    data: { metadata: JSON.stringify({ plan: "enterprise" }) },
  })

  const { auditService } = await import("@/lib/audit")
  // A local Copilot row proves the page still contains the identity part of
  // the trail while a domain app is unreachable.
  await prisma.auditLog.create({
    data: {
      organizationId: args.organizationId,
      actorId: args.userId,
      actorEmail: args.userEmail,
      action: "organization.updated",
      entityType: "organization",
      entityId: args.organizationId,
    },
  })

  const page = await auditService.list(ctx, { limit: 10 })
  const exported = await auditService.export(ctx, {}, "json")

  return {
    localEntries: page.items.length,
    partial: page.partial ?? false,
    unavailableApps: unavailableApps(page.unavailableApps),
    exportEntries: exported.count,
    exportPartial: exported.partial ?? false,
    exportUnavailableApps: unavailableApps(exported.unavailableApps),
  }
}

/**
 * The delegated domain gateway the assistant, MCP tools and portal use. A down
 * app must surface a typed, retryable error instead of an unhandled throw.
 */
async function delegated() {
  const { domainClient, delegatedContext } =
    await import("@/lib/internal/domain")
  const client = domainClient("projects")
  if (!client) throw new Error("PROJECTS_APP_URL is required for this probe")

  try {
    const data = await client.call(
      "list-projects",
      delegatedContext(ctx),
      {},
      z.unknown()
    )
    return { ok: true, data }
  } catch (error) {
    const typed = error as {
      name?: string
      code?: string
      status?: number
      retryable?: boolean
      message?: string
    }
    return {
      ok: false,
      name: typed.name,
      code: typed.code,
      status: typed.status,
      retryable: typed.retryable,
      message: typed.message,
    }
  }
}

/**
 * The organization-switch fan-out. A down app is logged and skipped: the
 * caller (and therefore the user's request) must resolve.
 */
async function revoke() {
  const { revokeAppSessions } = await import("@/lib/internal/app-sessions")
  await revokeAppSessions(`probe-${Date.now()}`)
  return { resolved: true }
}

interface StubState {
  failing: boolean
  deleteCalls: number
  organizationIds: string[]
}

/**
 * Cross-database deletion saga retry.
 *
 * A domain app that answers `503` leaves the job `partial` and keeps identity;
 * the retry resumes at the failed app, completes it and only then deletes
 * identity. The stub speaks the same `DELETE /internal/v1/organizations/:id`
 * contract (`DeletionResultSchema`) as the real apps; the orchestrator, the
 * identity store, the typed saga client and the service token are the
 * production ones.
 */
async function deletionRetry() {
  const { deleteOrganizationAcrossApps } = await import("@/lib/sagas/service")
  const { prisma } = await import("@/lib/prisma")

  await prisma.organization.update({
    where: { id: args.organizationId },
    data: { deletionScheduledAt: new Date(Date.now() - 60_000) },
  })

  const state: StubState = {
    failing: true,
    deleteCalls: 0,
    organizationIds: [],
  }
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://stub.invalid")
    const json = (status: number, body: unknown) => {
      response.writeHead(status, { "Content-Type": "application/json" })
      response.end(JSON.stringify(body))
    }

    if (
      request.method === "DELETE" &&
      url.pathname.startsWith("/internal/v1/organizations/")
    ) {
      state.deleteCalls += 1
      const organizationId = decodeURIComponent(
        url.pathname.slice("/internal/v1/organizations/".length)
      )
      state.organizationIds.push(organizationId)
      if (state.failing) {
        json(503, {
          error: { code: "unavailable", message: "Simulated app outage" },
        })
        return
      }
      json(200, {
        data: {
          app: "files",
          organizationId,
          deleted: { fileNode: 0 },
          completedAt: new Date().toISOString(),
        },
      })
      return
    }

    json(404, { error: { code: "not_found", message: "Unknown stub route" } })
  })

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const { port } = server.address() as AddressInfo
  process.env.FILES_APP_URL = `http://127.0.0.1:${port}`

  try {
    const first = await deleteOrganizationAcrossApps(args.organizationId)
    const afterFirst = await prisma.organization.count({
      where: { id: args.organizationId },
    })

    state.failing = false
    const second = await deleteOrganizationAcrossApps(args.organizationId)
    const afterSecond = await prisma.organization.count({
      where: { id: args.organizationId },
    })

    return {
      first,
      second,
      identityRetainedAfterFailure: afterFirst > 0,
      identityDeletedAfterRetry: afterSecond === 0,
      deleteCalls: state.deleteCalls,
      organizationIds: state.organizationIds,
      audience: internalAudience("files"),
      scope: SERVICE_SCOPES.deleteWrite,
    }
  } finally {
    server.close()
  }
}

async function main(): Promise<unknown> {
  switch (command) {
    case "search":
      return search()
    case "audit":
      return audit()
    case "delegated":
      return delegated()
    case "revoke":
      return revoke()
    case "deletion-retry":
      return deletionRetry()
    default:
      throw new Error(`Unknown probe command: ${command}`)
  }
}

main()
  .then((result) => {
    process.stdout.write(`__PROBE__${JSON.stringify(result)}\n`)
  })
  .catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
