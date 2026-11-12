import { describe, expect, it } from "vitest"

import type { RequestContext } from "@workspace/core/context"

import type { ClientsRepository } from "./repository"
import { ClientImportExportService } from "./services/import-export"

const ctx: RequestContext = {
  userId: "user_owner",
  userName: "Ada",
  userEmail: "ada@example.com",
  organizationId: "org_1",
  roles: ["owner"],
}

function member(id: string, name: string) {
  return {
    userId: id,
    name,
    email: `${id}@example.com`,
    avatarUrl: undefined,
    role: "member",
    clientId: null,
  }
}

function client(overrides: Record<string, unknown> = {}) {
  return {
    id: "client_1",
    name: "Acme",
    status: "active",
    contactEmail: "hello@acme.test",
    industry: "Energy",
    website: null,
    phone: null,
    address: null,
    description: null,
    source: null,
    ownerId: "user_owner",
    isActive: true,
    customFields: {},
    deletedAt: null,
    createdAt: new Date("2026-01-02T10:00:00.000Z"),
    updatedAt: new Date("2026-01-02T10:00:00.000Z"),
    ...overrides,
  }
}

function service(
  rows: ReturnType<typeof client>[],
  members = [member("user_owner", "Ada")]
) {
  const repo = {
    listClients: async () => rows,
    listMembers: async () => members,
  } as unknown as ClientsRepository
  return new ClientImportExportService(repo)
}

describe("client CSV export", () => {
  it("exports active clients with a BOM, semicolon separators and the owner name", async () => {
    const result = await service([
      client(),
      client({ id: "client_2", name: "Archived", deletedAt: new Date() }),
    ]).exportClient(ctx, { entity: "clients" })

    expect(result.filename).toMatch(
      /^asynchrone-space-clients-\d{4}-\d{2}-\d{2}\.csv$/
    )
    expect(result.content.startsWith("\uFEFF")).toBe(true)
    expect(result.content).toContain(
      "Name;Status;Industry;Website;Phone;Address;Contact email;Source;Owner;Active;Created"
    )
    expect(result.content).toContain(
      "Acme;active;Energy;;;;hello@acme.test;;Ada;yes;2026-01-02"
    )
    expect(result.content).not.toContain("Archived")
  })

  it("escapes separators and quotes in free-text columns", async () => {
    const result = await service([
      client({ name: 'Acme "North"; Ltd', address: "1 Main St\r\nParis" }),
    ]).exportClient(ctx, { entity: "clients" })

    expect(result.content).toContain('"Acme ""North""; Ltd"')
    expect(result.content).toContain('"1 Main St\r\nParis"')
  })

  it("lets members export but rejects viewers", async () => {
    const memberCtx = { ...ctx, roles: ["member" as const] }
    await expect(
      service([client()]).exportClient(memberCtx, { entity: "clients" })
    ).resolves.toMatchObject({ filename: expect.any(String) })

    const viewerCtx = { ...ctx, roles: ["viewer" as const] }
    await expect(
      service([client()]).exportClient(viewerCtx, { entity: "clients" })
    ).rejects.toMatchObject({ code: "role_cannot_export_clients" })
  })
})
