import { expect, test } from "@playwright/test"

import { closeDatabase, deletionJobsForOrganization } from "./db"
import {
  E2E_COPILOT_OAUTH_CLIENT_ID,
  E2E_COPILOT_OAUTH_CLIENT_SECRET,
  E2E_COPILOT_URL,
  E2E_UNAVAILABLE_APP_URL,
} from "./env"
import {
  openCopilot,
  openProjects,
  runProbe,
  signUp,
  type E2EAccount,
} from "./fixtures"

/**
 * Failure injection across the fleet (#210).
 *
 * The browser cases prove the shell survives a broken peer; the probe cases
 * drive Copilot's own fan-out modules (search, audit, delegated domain calls,
 * the deletion saga) with one domain origin pointed at a port nothing listens
 * on. Every call runs the production code against the running apps and the
 * real identity database.
 */

test.afterAll(closeDatabase)

function probeEnvironment(): Record<string, string> {
  return {
    COPILOT_APP_URL: E2E_COPILOT_URL,
    BETTER_AUTH_URL: E2E_COPILOT_URL,
    COPILOT_OAUTH_CLIENT_ID: E2E_COPILOT_OAUTH_CLIENT_ID,
    COPILOT_OAUTH_CLIENT_SECRET: E2E_COPILOT_OAUTH_CLIENT_SECRET,
  }
}

function probeArgs(account: E2EAccount) {
  return {
    organizationId: account.organizationId,
    organizationSlug: account.organizationSlug,
    userId: account.userId,
    userName: account.name,
    userEmail: account.email,
    role: "owner",
  }
}

interface SearchProbe {
  query: string
  partial: boolean
  unavailableApps: string[]
  results: { app: string; id: string; title: string }[]
}

interface AuditProbe {
  createdClient: string
  localEntries: number
  partial: boolean
  unavailableApps: string[]
  exportEntries: number
  exportPartial: boolean
  exportUnavailableApps: string[]
}

interface DelegatedProbe {
  ok: boolean
  name?: string
  code?: string
  status?: number
  retryable?: boolean
}

interface DeletionProbe {
  first: { status: string; failedApps: string[] }
  second: { status: string; failedApps: string[] }
  identityRetainedAfterFailure: boolean
  identityDeletedAfterRetry: boolean
  deleteCalls: number
  organizationIds: string[]
}

test("a down app degrades search to a partial result instead of failing it", async ({
  page,
}) => {
  const account = await signUp(page)
  const env = probeEnvironment()

  // Projects is configured but unreachable; every other domain answers
  // in-process, so the shell still gets results and says the result is
  // partial.
  const withDown = runProbe<SearchProbe>(
    "search",
    { ...probeArgs(account), appUrls: { projects: E2E_UNAVAILABLE_APP_URL } },
    env
  )
  expect(withDown.partial).toBe(true)
  expect(withDown.unavailableApps).toEqual(["projects"])
  expect(withDown.results.length).toBeGreaterThan(0)
  expect(withDown.results.every((result) => result.app !== "projects")).toBe(
    true
  )
  expect(withDown.results.some((result) => result.app === "clients")).toBe(true)

  // Without a configured remote app nothing is missing: the fan-out is not
  // "partial" just because some domains are in-process.
  const withoutDown = runProbe<SearchProbe>(
    "search",
    { ...probeArgs(account), appUrls: {} },
    env
  )
  expect(withoutDown.partial).toBe(false)
  expect(withoutDown.unavailableApps).toEqual([])
  expect(withoutDown.results.length).toBeGreaterThan(0)
})

test("a down app is a typed error for the delegated gateway and never breaks the shell", async ({
  page,
}) => {
  const account = await signUp(page)
  const env = probeEnvironment()

  // The assistant, MCP tools and portal go through this gateway. A dead app
  // must surface a typed, retryable failure the caller can report.
  const delegated = runProbe<DelegatedProbe>(
    "delegated",
    { ...probeArgs(account), appUrls: { projects: E2E_UNAVAILABLE_APP_URL } },
    env
  )
  expect(delegated.ok).toBe(false)
  expect(delegated.name).toBe("DomainClientError")
  expect(delegated.code).toBe("domain_unavailable")
  expect(delegated.status).toBe(503)
  expect(delegated.retryable).toBe(true)

  // The organization-switch fan-out is best-effort: a down app is logged and
  // skipped, so the user's request still completes.
  const revoked = runProbe<{ resolved: boolean }>(
    "revoke",
    {
      ...probeArgs(account),
      appUrls: {
        projects: E2E_UNAVAILABLE_APP_URL,
        calendars: E2E_UNAVAILABLE_APP_URL,
      },
    },
    env
  )
  expect(revoked.resolved).toBe(true)

  // Both workspace shells still render with a peer down.
  await openCopilot(page, account.organizationSlug)
  await expect(
    page.getByRole("heading", { name: "Asynchrone Space assistant" })
  ).toBeVisible()
  await openProjects(page, account.organizationSlug)
  await expect(
    page.getByRole("heading", { name: "Projects", level: 2 })
  ).toBeVisible()
})

test("audit fan-out reports partial pages and a partial export", async ({
  page,
}) => {
  const account = await signUp(page)
  const env = probeEnvironment()

  const withDown = runProbe<AuditProbe>(
    "audit",
    { ...probeArgs(account), appUrls: { projects: E2E_UNAVAILABLE_APP_URL } },
    env
  )
  // Copilot's own rows are still returned; the missing app is reported.
  expect(withDown.localEntries).toBeGreaterThan(0)
  expect(withDown.partial).toBe(true)
  expect(withDown.unavailableApps).toEqual(["projects"])
  // An export never claims to be complete while an app is unreachable.
  expect(withDown.exportEntries).toBeGreaterThan(0)
  expect(withDown.exportPartial).toBe(true)
  expect(withDown.exportUnavailableApps).toEqual(["projects"])

  const withoutDown = runProbe<AuditProbe>(
    "audit",
    { ...probeArgs(account), appUrls: {} },
    env
  )
  expect(withoutDown.partial).toBe(false)
  expect(withoutDown.unavailableApps).toEqual([])
  expect(withoutDown.exportPartial).toBe(false)
})

test("the deletion saga retries at the failed app and deletes identity last", async ({
  page,
}) => {
  const account = await signUp(page)

  const result = runProbe<DeletionProbe>(
    "deletion-retry",
    probeArgs(account),
    probeEnvironment()
  )

  // First attempt: the only configured app answers 503, so the job is
  // partial and identity is untouched.
  expect(result.first.status).toBe("partial")
  expect(result.first.failedApps).toEqual(["files"])
  expect(result.identityRetainedAfterFailure).toBe(true)

  // Retry: it resumes at the failed app (not the completed ones), the app
  // reports success and identity is deleted only afterwards.
  expect(result.second.status).toBe("completed")
  expect(result.second.failedApps).toEqual([])
  expect(result.identityDeletedAfterRetry).toBe(true)
  expect(result.deleteCalls).toBe(2)
  expect(result.organizationIds).toEqual([
    account.organizationId,
    account.organizationId,
  ])

  // The persisted saga state agrees with the returned results.
  const jobs = await deletionJobsForOrganization(account.organizationId)
  expect(jobs).toHaveLength(1)
  expect(jobs[0]?.status).toBe("completed")
  expect(jobs[0]?.apps).toEqual([{ app: "files", status: "completed" }])
})
