import { beforeEach, describe, expect, it, vi } from "vitest"

const { recordAudit, findUser } = vi.hoisted(() => ({
  recordAudit: vi.fn(),
  findUser: vi.fn(),
}))

vi.mock("./record", () => ({ recordAudit }))
// The hook only reads the user table (for the target's email); no real client.
vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: findUser } } }))

import { recordAuthAuditEvent, type SessionLike } from "./auth-audit"

const session: SessionLike = {
  user: { id: "user_actor", name: "Ada", email: "ada@example.com" },
  session: { activeOrganizationId: "org_1" },
}

const resolveSession = vi.fn(async () => session)

function hook(
  path: string,
  returned: unknown,
  body: Record<string, unknown> = {}
) {
  return {
    path,
    body,
    headers: new Headers({
      "x-real-ip": "203.0.113.5",
      "user-agent": "Mozilla/5.0",
    }),
    context: { returned },
  }
}

function entries() {
  return recordAudit.mock.calls.map((call) => call[0])
}

beforeEach(() => {
  vi.clearAllMocks()
  findUser.mockResolvedValue({ email: "target@example.com" })
})

describe("auth hook auditing", () => {
  it("records a role change with the actor and the target", async () => {
    await recordAuthAuditEvent(
      hook("/organization/update-member-role", {
        userId: "user_target",
        role: "admin",
        organizationId: "org_1",
      }),
      resolveSession
    )

    expect(entries()).toEqual([
      expect.objectContaining({
        organizationId: "org_1",
        actorId: "user_actor",
        actorName: "Ada",
        actorEmail: "ada@example.com",
        action: "organization.member.role_changed",
        entityType: "member",
        entityId: "user_target",
        entityLabel: "target@example.com",
        after: { role: "admin" },
        ipAddress: "203.0.113.5",
        userAgent: "Mozilla/5.0",
      }),
    ])
  })

  it("records a removed member once", async () => {
    await recordAuthAuditEvent(
      hook(
        "/organization/remove-member",
        { member: { userId: "user_target", role: "member" } },
        { memberIdOrEmail: "user_target" }
      ),
      resolveSession
    )

    expect(entries()).toHaveLength(1)
    expect(entries()[0]).toMatchObject({
      action: "organization.member.removed",
      entityId: "user_target",
      entityLabel: "target@example.com",
      before: { role: "member" },
    })
  })

  it("uses the invitation email when the member is gone", async () => {
    findUser.mockResolvedValue(null)
    await recordAuthAuditEvent(
      hook(
        "/organization/remove-member",
        { member: { userId: "user_target", role: "member" } },
        { memberIdOrEmail: "left@example.com" }
      ),
      resolveSession
    )

    expect(entries()[0]).toMatchObject({ entityLabel: "left@example.com" })
  })

  it("records invitations", async () => {
    await recordAuthAuditEvent(
      hook("/organization/invite-member", {
        id: "inv_1",
        email: "new@example.com",
        role: "member",
        organizationId: "org_1",
      }),
      resolveSession
    )
    await recordAuthAuditEvent(
      hook("/organization/cancel-invitation", {
        id: "inv_2",
        email: "gone@example.com",
        role: "viewer",
        organizationId: "org_1",
      }),
      resolveSession
    )

    expect(entries()).toEqual([
      expect.objectContaining({
        action: "organization.invitation.created",
        entityType: "invitation",
        entityId: "inv_1",
        entityLabel: "new@example.com",
      }),
      expect.objectContaining({
        action: "organization.invitation.cancelled",
        entityId: "inv_2",
        entityLabel: "gone@example.com",
      }),
    ])
  })

  it("records accept and reject on the invitation organization", async () => {
    await recordAuthAuditEvent(
      hook("/organization/accept-invitation", {
        invitation: {
          id: "inv_3",
          email: "joiner@example.com",
          organizationId: "org_2",
        },
        member: { role: "member" },
      }),
      resolveSession
    )
    await recordAuthAuditEvent(
      hook("/organization/reject-invitation", {
        invitation: {
          id: "inv_4",
          email: "decliner@example.com",
          organizationId: "org_2",
        },
        member: null,
      }),
      resolveSession
    )

    expect(entries()).toEqual([
      expect.objectContaining({
        organizationId: "org_2",
        action: "organization.invitation.accepted",
        entityId: "inv_3",
        after: { email: "joiner@example.com", role: "member" },
      }),
      expect.objectContaining({
        action: "organization.invitation.rejected",
        entityId: "inv_4",
      }),
    ])
  })

  it("records a member leaving as themselves", async () => {
    await recordAuthAuditEvent(
      hook("/organization/leave", { userId: "user_actor", role: "member" }),
      resolveSession
    )

    expect(entries()[0]).toMatchObject({
      action: "organization.member.left",
      entityId: "user_actor",
      entityLabel: "ada@example.com",
    })
  })

  it("records a workspace rename, and skips an empty update", async () => {
    await recordAuthAuditEvent(
      hook(
        "/organization/update",
        { id: "org_1", name: "Renamed", slug: "renamed" },
        { data: { name: "Renamed" } }
      ),
      resolveSession
    )
    await recordAuthAuditEvent(
      hook("/organization/update", { id: "org_1" }, { data: {} }),
      resolveSession
    )

    expect(entries()).toHaveLength(1)
    expect(entries()[0]).toMatchObject({
      action: "organization.updated",
      entityType: "organization",
      entityId: "org_1",
      entityLabel: "Renamed",
    })
  })

  it("ignores other endpoints and requests without a session", async () => {
    await recordAuthAuditEvent(hook("/sign-in/email", {}), resolveSession)
    await recordAuthAuditEvent(
      hook("/organization/update-member-role", { userId: "user_target" }),
      async () => null
    )
    await recordAuthAuditEvent(
      hook("/organization/update-member-role", { userId: "user_target" })
    )

    expect(recordAudit).not.toHaveBeenCalled()
  })

  it("never breaks the request when the audit write fails", async () => {
    recordAudit.mockRejectedValueOnce(new Error("db down"))
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {})

    await expect(
      recordAuthAuditEvent(
        hook("/organization/update-member-role", {
          userId: "user_target",
          role: "admin",
          organizationId: "org_1",
        }),
        resolveSession
      )
    ).resolves.toBeUndefined()
    expect(consoleError).toHaveBeenCalled()

    consoleError.mockRestore()
  })
})
