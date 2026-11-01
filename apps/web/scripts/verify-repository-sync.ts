import "dotenv/config"

import { createHmac, randomUUID } from "node:crypto"
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http"

import type { RequestContext } from "@workspace/core/context"
import {
  RepositoryConnectionRepository,
  RepositoryIntegrationService,
  RepositoryWebhookHandler,
} from "@workspace/projects/integrations"
import { ProjectRepository } from "@workspace/projects/repository"
import { ProjectService } from "@workspace/projects/service"
import { recordUserAudit } from "../lib/audit/record"
import { notificationService } from "../lib/notifications"
import { prisma } from "../lib/prisma"

/**
 * Manual end-to-end check for the repository integration (issue #47).
 *
 * Runs against a throwaway organization in the configured database and an
 * in-process mock of the GitHub and GitLab REST APIs (no network needed).
 * Covers: connect/backfill both directions, task → issue edits, move to
 * review → draft PR, webhook verification, issue close/reopen → task status,
 * PR open/merge → task status, and disconnect. Run with:
 *
 *   npm run verify:repository-sync
 */

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`✗ ${message}`)
  console.log(`✓ ${message}`)
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Runs a promise expecting a coded rejection and asserts the error code. */
async function assertRejects(
  promise: Promise<unknown>,
  expectedCode: string,
  message: string
) {
  try {
    await promise
  } catch (error) {
    const code = (error as { code?: string } | null)?.code
    if (code !== expectedCode) {
      throw new Error(
        `✗ ${message} (expected ${expectedCode}, got ${code ?? "no code"}: ${String(error)})`
      )
    }
    console.log(`✓ ${message}`)
    return
  }
  throw new Error(`✗ ${message} (no error was thrown)`)
}

// ---------------------------------------------------------------------------
// Mock GitHub + GitLab API
// ---------------------------------------------------------------------------

interface MockIssue {
  number: number
  title: string
  body: string
  state: "open" | "closed"
  updatedAt: string
}

class MockRepositoryServer {
  readonly requests: string[] = []
  private readonly issues = new Map<number, MockIssue>()
  private issueSequence = 100
  pullSequence = 40
  private server = createServer((req, res) => {
    void this.handle(req, res)
  })

  private json(res: ServerResponse, status: number, data: unknown) {
    res.writeHead(status, { "content-type": "application/json" })
    res.end(JSON.stringify(data))
  }

  private async readBody(req: IncomingMessage) {
    const chunks: Buffer[] = []
    for await (const chunk of req) chunks.push(Buffer.from(chunk))
    return Buffer.concat(chunks).toString("utf8")
  }

  private issuePayload(issue: MockIssue) {
    return {
      number: issue.number,
      title: issue.title,
      body: issue.body,
      state: issue.state,
      html_url: `https://github.example/acme/widget/issues/${issue.number}`,
      updated_at: issue.updatedAt,
    }
  }

  seedIssue(title: string, body: string, state: "open" | "closed" = "open") {
    const issue: MockIssue = {
      number: (this.issueSequence += 1),
      title,
      body,
      state,
      updatedAt: new Date().toISOString(),
    }
    this.issues.set(issue.number, issue)
    return issue
  }

  getIssue(number: number) {
    return this.issues.get(number)
  }

  latestIssueNumber() {
    return this.issueSequence
  }

  private async handle(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? "/", "http://localhost")
    const body = await this.readBody(req)
    this.requests.push(`${req.method} ${url.pathname}${url.search}`)
    const path = decodeURIComponent(url.pathname)

    // Token simulation: `denied-token` has no repository access at all and
    // `flaky-token` can read but not create issues (server error).
    const presented = `${req.headers.authorization ?? ""} ${req.headers["private-token"] ?? ""}`
    if (presented.includes("denied-token")) {
      return this.json(res, 403, { message: "Forbidden" })
    }
    if (
      presented.includes("flaky-token") &&
      req.method === "POST" &&
      path.endsWith("/issues")
    ) {
      return this.json(res, 500, { message: "Server Error" })
    }

    // --- GitHub (baseUrl http://host:port -> /api/v3) -------------------
    const gh = "/api/v3"
    if (path === `${gh}/repos/acme/widget` && req.method === "GET") {
      return this.json(res, 200, {
        full_name: "acme/widget",
        html_url: "https://github.example/acme/widget",
        default_branch: "main",
      })
    }
    if (path === `${gh}/repos/acme/widget/issues` && req.method === "GET") {
      return this.json(
        res,
        200,
        [...this.issues.values()].map((i) => this.issuePayload(i))
      )
    }
    if (path === `${gh}/repos/acme/widget/issues` && req.method === "POST") {
      const input = JSON.parse(body) as { title: string; body: string }
      const issue = this.seedIssue(input.title, input.body)
      return this.json(res, 201, this.issuePayload(issue))
    }
    const ghIssue = path.match(
      /^\/api\/v3\/repos\/acme\/widget\/issues\/(\d+)$/
    )
    if (ghIssue && req.method === "PATCH") {
      const issue = this.issues.get(Number(ghIssue[1]))
      if (!issue) return this.json(res, 404, { message: "Not Found" })
      const input = JSON.parse(body) as {
        title?: string
        body?: string
        state?: "open" | "closed"
      }
      if (input.title !== undefined) issue.title = input.title
      if (input.body !== undefined) issue.body = input.body
      if (input.state !== undefined) issue.state = input.state
      issue.updatedAt = new Date().toISOString()
      return this.json(res, 200, this.issuePayload(issue))
    }
    if (
      path === `${gh}/repos/acme/widget/git/ref/heads/main` &&
      req.method === "GET"
    ) {
      return this.json(res, 200, { object: { sha: "base-sha" } })
    }
    if (path === `${gh}/repos/acme/widget/git/refs` && req.method === "POST") {
      return this.json(res, 201, { ref: JSON.parse(body).ref })
    }
    if (
      path.startsWith(`${gh}/repos/acme/widget/contents/`) &&
      req.method === "PUT"
    ) {
      return this.json(res, 201, { content: { sha: "blob-sha" } })
    }
    if (path === `${gh}/repos/acme/widget/pulls` && req.method === "POST") {
      const input = JSON.parse(body) as {
        title: string
        body: string
        head: string
      }
      this.pullSequence += 1
      return this.json(res, 201, {
        number: this.pullSequence,
        title: input.title,
        body: input.body,
        html_url: `https://github.example/acme/widget/pull/${this.pullSequence}`,
        state: "open",
        merged_at: null,
        head: { ref: input.head },
        base: { ref: "main" },
      })
    }

    // --- GitLab (baseUrl http://host:port -> /api/v4) -------------------
    const gl = "/api/v4/projects/acme/gitlab-widget"
    if (path === gl && req.method === "GET") {
      return this.json(res, 200, {
        path_with_namespace: "acme/gitlab-widget",
        web_url: "https://gitlab.example/acme/gitlab-widget",
        default_branch: "main",
      })
    }
    if (path === `${gl}/issues` && req.method === "GET") {
      return this.json(
        res,
        200,
        [...this.issues.values()].map((issue) => ({
          iid: issue.number,
          title: issue.title,
          description: issue.body,
          state: issue.state === "closed" ? "closed" : "opened",
          web_url: `https://gitlab.example/acme/gitlab-widget/-/issues/${issue.number}`,
          updated_at: issue.updatedAt,
        }))
      )
    }
    if (path === `${gl}/issues` && req.method === "POST") {
      const input = JSON.parse(body) as { title: string; description: string }
      const issue = this.seedIssue(input.title, input.description)
      return this.json(res, 201, {
        iid: issue.number,
        title: issue.title,
        description: issue.body,
        state: "opened",
        web_url: `https://gitlab.example/acme/gitlab-widget/-/issues/${issue.number}`,
        updated_at: issue.updatedAt,
      })
    }
    if (path === `${gl}/repository/branches` && req.method === "POST") {
      return this.json(res, 201, { name: JSON.parse(body).branch })
    }
    if (path === `${gl}/repository/commits` && req.method === "POST") {
      return this.json(res, 201, { id: "commit-sha" })
    }
    if (path === `${gl}/merge_requests` && req.method === "POST") {
      const input = JSON.parse(body) as {
        title: string
        description: string
        source_branch: string
        target_branch: string
      }
      this.pullSequence += 1
      return this.json(res, 201, {
        iid: this.pullSequence,
        title: input.title,
        description: input.description,
        web_url: `https://gitlab.example/acme/gitlab-widget/-/merge_requests/${this.pullSequence}`,
        state: "opened",
        source_branch: input.source_branch,
        target_branch: input.target_branch,
      })
    }

    return this.json(res, 404, { message: `No mock route for ${path}` })
  }

  listen() {
    return new Promise<number>((resolve) => {
      this.server.listen(0, "127.0.0.1", () => {
        const address = this.server.address()
        if (!address || typeof address === "string") throw new Error("no port")
        resolve(address.port)
      })
    })
  }

  close() {
    return new Promise<void>((resolve) => this.server.close(() => resolve()))
  }

  hasRequest(method: string, pathFragment: string) {
    return this.requests.some(
      (entry) => entry.startsWith(`${method} `) && entry.includes(pathFragment)
    )
  }
}

// ---------------------------------------------------------------------------
// Verification flow
// ---------------------------------------------------------------------------

async function main() {
  const mock = new MockRepositoryServer()
  const port = await mock.listen()
  const baseUrl = `http://127.0.0.1:${port}`
  const suffix = randomUUID().slice(0, 8)
  const orgId = `org_verify_${suffix}`
  const userId = `user_verify_${suffix}`

  try {
    const user = await prisma.user.create({
      data: {
        id: userId,
        name: "Verify Bot",
        email: `verify-${suffix}@example.com`,
        emailVerified: true,
      },
    })
    const organization = await prisma.organization.create({
      data: {
        id: orgId,
        name: "Verify Org",
        slug: `verify-${suffix}`,
        createdAt: new Date(),
      },
    })
    await prisma.member.create({
      data: {
        id: `member_verify_${suffix}`,
        organizationId: orgId,
        userId: user.id,
        role: "owner",
        createdAt: new Date(),
      },
    })
    const project = await prisma.project.create({
      data: { organizationId: orgId, name: "Verify Project" },
    })
    const localTask = await prisma.task.create({
      data: {
        organizationId: orgId,
        projectId: project.id,
        identifier: "VRF-1",
        title: "Existing local task",
        description: "Should be reported to the repository",
        order: 0,
      },
    })
    // Seeded outside the service, so seed its identifier counter too.
    await prisma.taskIdentifierCounter.create({
      data: { organizationId: orgId, prefix: "VRF", value: 1 },
    })

    const ctx: RequestContext = {
      userId: user.id,
      userName: user.name,
      userEmail: user.email,
      organizationId: orgId,
      role: "owner",
    }
    const connectionRepo = new RepositoryConnectionRepository(prisma)
    const service = new RepositoryIntegrationService(connectionRepo, prisma, {
      appBaseUrl: process.env.BETTER_AUTH_URL ?? "",
    })
    const webhookHandler = new RepositoryWebhookHandler(connectionRepo, prisma)
    const projectService = new ProjectService(
      new ProjectRepository(prisma),
      prisma,
      {
        audit: recordUserAudit,
        notify: (args) => notificationService.notify(args),
        repository: service,
      }
    )

    // 1. Token gating: connecting requires the admin's own token, and the
    // token must actually grant access to the repository.
    await assertRejects(
      service.connect(ctx, {
        projectId: project.id,
        provider: "github",
        owner: "acme",
        repo: "widget",
        baseUrl,
      }),
      "repository_user_token_missing",
      "connect without a profile token is rejected"
    )
    await service.setUserToken(ctx, {
      provider: "github",
      token: "denied-token",
    })
    await assertRejects(
      service.connect(ctx, {
        projectId: project.id,
        provider: "github",
        owner: "acme",
        repo: "widget",
        baseUrl,
      }),
      "repository_access_denied",
      "connect with a token that cannot access the repo is rejected"
    )

    // 2. Connect with a working token: imports issues, reports local tasks.
    const remoteA = mock.seedIssue("Imported issue A", "A body")
    const remoteB = mock.seedIssue("Imported issue B", "")
    await service.setUserToken(ctx, {
      provider: "github",
      token: "ghp_verify_token",
    })
    const connectResult = await service.connect(ctx, {
      projectId: project.id,
      provider: "github",
      owner: "acme",
      repo: "widget",
      baseUrl,
    })
    assert(
      connectResult.summary.issuesImported === 2,
      "connect imports 2 issues"
    )
    assert(
      connectResult.summary.tasksPushed === 1,
      "connect reports 1 local task"
    )

    const tasksAfterConnect = await prisma.task.findMany({
      where: { projectId: project.id },
      orderBy: { order: "asc" },
    })
    assert(tasksAfterConnect.length === 3, "project now has 3 tasks")
    const importedA = tasksAfterConnect.find(
      (task) => task.externalIssueNumber === remoteA.number
    )
    const importedB = tasksAfterConnect.find(
      (task) => task.externalIssueNumber === remoteB.number
    )
    assert(!!importedA && !!importedB, "imported issues are linked to tasks")
    assert(importedA?.title === "Imported issue A", "issue title carried over")
    const pushed = tasksAfterConnect.find((task) => task.id === localTask.id)
    assert(
      pushed?.externalIssueNumber === mock.latestIssueNumber(),
      "local task was reported as a new issue"
    )

    const storedToken = await prisma.userRepositoryToken.findUnique({
      where: {
        userId_provider: { userId: user.id, provider: "github" },
      },
    })
    assert(
      !!storedToken && storedToken.accessToken !== "ghp_verify_token",
      "user token is encrypted at rest"
    )

    // 3. Creation gating: no token / no repo access / provider failure all
    // block the task and leave nothing behind.
    const taskCountBefore = await prisma.task.count({
      where: { projectId: project.id },
    })
    await service.removeUserToken(ctx, "github")
    await assertRejects(
      projectService.createTask(ctx, {
        projectId: project.id,
        title: "No token",
      }),
      "repository_user_token_missing",
      "creating a task without a profile token is rejected"
    )
    await service.setUserToken(ctx, {
      provider: "github",
      token: "denied-token",
    })
    await assertRejects(
      projectService.createTask(ctx, {
        projectId: project.id,
        title: "Denied",
      }),
      "repository_access_denied",
      "creating a task without repo access is rejected"
    )
    await service.setUserToken(ctx, {
      provider: "github",
      token: "flaky-token",
    })
    await assertRejects(
      projectService.createTask(ctx, { projectId: project.id, title: "Flaky" }),
      "repository_issue_create_failed",
      "a provider failure blocks the task creation"
    )
    const taskCountAfter = await prisma.task.count({
      where: { projectId: project.id },
    })
    assert(
      taskCountBefore === taskCountAfter,
      "blocked creations do not leave a task behind"
    )
    await service.setUserToken(ctx, {
      provider: "github",
      token: "ghp_verify_token",
    })

    // 4. Editing a task pushes the change to its issue (debounced).
    await projectService.updateTask(ctx, importedA.id, {
      title: "Renamed locally",
      description: "Updated description",
    })
    await sleep(2600)
    assert(
      mock.getIssue(remoteA.number)?.title === "Renamed locally",
      "task edit reached the issue title"
    )
    assert(
      mock.getIssue(remoteA.number)?.body === "Updated description",
      "task edit reached the issue body"
    )

    // 5. Moving to review creates a draft PR from an asynchrone-space/ branch.
    await projectService.moveTask(ctx, importedA.id, { status: "review" })
    await sleep(100)
    const reviewed = await prisma.task.findUniqueOrThrow({
      where: { id: importedA.id },
    })
    assert(reviewed.status === "review", "task moved to review")
    assert(
      reviewed.externalPrNumber === mock.pullSequence,
      "review move created a pull request"
    )
    assert(
      mock.hasRequest(
        "PUT",
        `/contents/.asynchrone-space/${reviewed.identifier}.md`
      ) || mock.hasRequest("PUT", "/contents/"),
      "PR branch has a marker commit"
    )
    assert(mock.hasRequest("POST", `/pulls`), "pull request was opened")

    // 6. A closed issue marks the task done (verified webhook).
    const closedPayload = JSON.stringify({
      action: "closed",
      repository: { full_name: "acme/widget" },
      issue: {
        number: remoteB.number,
        title: remoteB.title,
        body: remoteB.body,
        state: "closed",
        html_url: "https://github.example/acme/widget/issues/102",
        updated_at: new Date(Date.now() + 5000).toISOString(),
      },
    })
    const signature = createHmac(
      "sha256",
      connectResult.connection.webhookSecret
    )
      .update(closedPayload)
      .digest("hex")
    const closeResult = await webhookHandler.handle({
      connectionId: connectResult.connection.id,
      headers: new Headers({
        "x-github-event": "issues",
        "x-hub-signature-256": `sha256=${signature}`,
      }),
      rawBody: closedPayload,
    })
    assert(closeResult.status === 200, "signed webhook accepted")
    const afterClose = await prisma.task.findUniqueOrThrow({
      where: { id: importedB.id },
    })
    assert(afterClose.status === "done", "closed issue marked the task done")

    // 7. An invalid signature is rejected.
    const rejected = await webhookHandler.handle({
      connectionId: connectResult.connection.id,
      headers: new Headers({
        "x-github-event": "issues",
        "x-hub-signature-256": "sha256=deadbeef",
      }),
      rawBody: closedPayload,
    })
    assert(rejected.status === 401, "invalid signature rejected")

    // 8. A PR opened against an issue moves the task to review.
    const prPayload = JSON.stringify({
      action: "opened",
      repository: { full_name: "acme/widget" },
      pull_request: {
        number: 77,
        title: `Fix #${remoteB.number}`,
        body: "",
        html_url: "https://github.example/acme/widget/pull/77",
        state: "open",
        merged: false,
        head: { ref: "fix-issue" },
        base: { ref: "main" },
      },
    })
    const prSignature = createHmac(
      "sha256",
      connectResult.connection.webhookSecret
    )
      .update(prPayload)
      .digest("hex")
    const prResult = await webhookHandler.handle({
      connectionId: connectResult.connection.id,
      headers: new Headers({
        "x-github-event": "pull_request",
        "x-hub-signature-256": `sha256=${prSignature}`,
      }),
      rawBody: prPayload,
    })
    assert(prResult.status === 200, "pull_request webhook accepted")
    const afterPr = await prisma.task.findUniqueOrThrow({
      where: { id: importedB.id },
    })
    assert(
      afterPr.status === "review" && afterPr.externalPrNumber === 77,
      "opened PR moved the task to review and linked it"
    )

    // 9. Merging the PR completes the task; reopening the issue reopens it.
    const mergedPayload = JSON.stringify({
      action: "closed",
      repository: { full_name: "acme/widget" },
      pull_request: {
        number: 77,
        title: `Fix #${remoteB.number}`,
        body: "",
        html_url: "https://github.example/acme/widget/pull/77",
        state: "closed",
        merged: true,
        head: { ref: "fix-issue" },
        base: { ref: "main" },
      },
    })
    const mergedSignature = createHmac(
      "sha256",
      connectResult.connection.webhookSecret
    )
      .update(mergedPayload)
      .digest("hex")
    await webhookHandler.handle({
      connectionId: connectResult.connection.id,
      headers: new Headers({
        "x-github-event": "pull_request",
        "x-hub-signature-256": `sha256=${mergedSignature}`,
      }),
      rawBody: mergedPayload,
    })
    const afterMerge = await prisma.task.findUniqueOrThrow({
      where: { id: importedB.id },
    })
    assert(afterMerge.status === "done", "merged PR completed the task")

    const reopenedPayload = JSON.stringify({
      action: "reopened",
      repository: { full_name: "acme/widget" },
      issue: {
        number: remoteB.number,
        title: remoteB.title,
        body: remoteB.body,
        state: "open",
        html_url: "https://github.example/acme/widget/issues/102",
        updated_at: new Date(Date.now() + 10000).toISOString(),
      },
    })
    const reopenedSignature = createHmac(
      "sha256",
      connectResult.connection.webhookSecret
    )
      .update(reopenedPayload)
      .digest("hex")
    await webhookHandler.handle({
      connectionId: connectResult.connection.id,
      headers: new Headers({
        "x-github-event": "issues",
        "x-hub-signature-256": `sha256=${reopenedSignature}`,
      }),
      rawBody: reopenedPayload,
    })
    const afterReopen = await prisma.task.findUniqueOrThrow({
      where: { id: importedB.id },
    })
    assert(
      afterReopen.status === "todo",
      "reopened issue moved the task back to todo"
    )

    // 10. New tasks are reported immediately (no debounce).
    const created = await projectService.createTask(ctx, {
      projectId: project.id,
      title: "Created locally",
    })
    const createdRow = await prisma.task.findUniqueOrThrow({
      where: { id: created.id },
    })
    assert(
      createdRow.externalIssueNumber !== null,
      "new task was reported as an issue"
    )

    // 10b. Tasks created without issue creation stay local: no issue, no
    // backfill, and moving one to review creates no pull request either —
    // even without a profile token.
    const issueSequenceBefore = mock.latestIssueNumber()
    await service.removeUserToken(ctx, "github")
    const localOnly = await projectService.createTask(ctx, {
      projectId: project.id,
      title: "Local only",
      createIssue: false,
    })
    const localOnlyRow = await prisma.task.findUniqueOrThrow({
      where: { id: localOnly.id },
    })
    assert(
      localOnlyRow.createIssue === false &&
        localOnlyRow.externalIssueNumber === null,
      "an opted-out task is created without an issue (and without a token)"
    )
    assert(
      mock.latestIssueNumber() === issueSequenceBefore,
      "opted-out task creation made no provider call"
    )
    await projectService.moveTask(ctx, localOnly.id, { status: "review" })
    const localOnlyMoved = await prisma.task.findUniqueOrThrow({
      where: { id: localOnly.id },
    })
    assert(
      localOnlyMoved.status === "review" &&
        localOnlyMoved.externalIssueNumber === null &&
        localOnlyMoved.externalPrNumber === null,
      "moving an opted-out task to review creates no issue or pull request"
    )
    await service.setUserToken(ctx, {
      provider: "github",
      token: "ghp_verify_token",
    })
    await service.sync(ctx, project.id)
    const localOnlySynced = await prisma.task.findUniqueOrThrow({
      where: { id: localOnly.id },
    })
    assert(
      localOnlySynced.externalIssueNumber === null,
      "sync does not backfill opted-out tasks"
    )

    // 11. GitLab: connect, MR webhook with token verification
    // (covers the second provider adapter end to end).
    const gitlabProject = await prisma.project.create({
      data: { organizationId: orgId, name: "Gitlab Verify" },
    })
    const gitlabIssue = mock.seedIssue("GitLab native issue", "body")
    await service.setUserToken(ctx, {
      provider: "gitlab",
      token: "glpat-verify-token",
    })
    const gitlabConnect = await service.connect(ctx, {
      projectId: gitlabProject.id,
      provider: "gitlab",
      owner: "acme",
      repo: "gitlab-widget",
      baseUrl,
    })
    assert(
      gitlabConnect.summary.issuesImported >= 1,
      "GitLab connect imports issues"
    )
    const gitlabTasks = await prisma.task.findMany({
      where: { projectId: gitlabProject.id },
    })
    const gitlabTask = gitlabTasks.find(
      (task) => task.externalIssueNumber === gitlabIssue.number
    )
    assert(!!gitlabTask, "GitLab issue imported as a task")

    const mrPayload = JSON.stringify({
      object_kind: "merge_request",
      project: { path_with_namespace: "acme/gitlab-widget" },
      object_attributes: {
        iid: 5,
        title: "Draft: verify",
        description: `Part of #${gitlabIssue.number}`,
        state: "opened",
        action: "open",
        url: "https://gitlab.example/acme/gitlab-widget/-/merge_requests/5",
        source_branch: "verify-branch",
        target_branch: "main",
      },
    })
    const badToken = await webhookHandler.handle({
      connectionId: gitlabConnect.connection.id,
      headers: new Headers({
        "x-gitlab-event": "Merge Request Hook",
        "x-gitlab-token": "wrong",
      }),
      rawBody: mrPayload,
    })
    assert(badToken.status === 401, "GitLab webhook token mismatch rejected")
    const mrResult = await webhookHandler.handle({
      connectionId: gitlabConnect.connection.id,
      headers: new Headers({
        "x-gitlab-event": "Merge Request Hook",
        "x-gitlab-token": gitlabConnect.connection.webhookSecret,
      }),
      rawBody: mrPayload,
    })
    assert(mrResult.status === 200, "GitLab webhook accepted with token")
    const gitlabAfterMr = await prisma.task.findUniqueOrThrow({
      where: { id: gitlabTask.id },
    })
    assert(
      gitlabAfterMr.status === "review" && gitlabAfterMr.externalPrNumber === 5,
      "GitLab MR moved the task to review"
    )

    // 12. Disconnect stops syncing but keeps historical links.
    await service.disconnect(ctx, project.id)
    const disconnected = await service.getConnection(ctx, project.id)
    assert(disconnected === null, "disconnect removes the connection")
    const keptLink = await prisma.task.findUniqueOrThrow({
      where: { id: importedA.id },
    })
    assert(
      keptLink.externalIssueNumber === remoteA.number,
      "task links survive disconnect"
    )

    console.log("\nAll repository sync checks passed.")
  } finally {
    await prisma.organization.delete({ where: { id: orgId } }).catch(() => {})
    await prisma.user.delete({ where: { id: userId } }).catch(() => {})
    await mock.close()
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
