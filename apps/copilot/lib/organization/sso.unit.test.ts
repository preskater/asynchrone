import { beforeEach, describe, expect, it, vi } from "vitest"

const prisma = vi.hoisted(() => ({
  ssoProvider: { findUnique: vi.fn() },
  organization: {
    findUnique: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    update: vi.fn(),
  },
  verification: { findFirst: vi.fn() },
  $transaction: vi.fn(),
}))
const api = vi.hoisted(() => ({
  registerSSOProvider: vi.fn(),
  updateSSOProvider: vi.fn(),
  deleteSSOProvider: vi.fn(),
  requestDomainVerification: vi.fn(),
  verifyDomain: vi.fn(),
}))
const requireEntitlement = vi.hoisted(() => vi.fn())
const recordUserAudit = vi.hoisted(() => vi.fn())

vi.mock("next/headers", () => ({ headers: async () => new Headers() }))
vi.mock("@/lib/prisma", () => ({ prisma }))
vi.mock("@/lib/auth", () => ({ auth: { api } }))
vi.mock("@/lib/core/auth-context", () => ({
  requirePermission: (ctx: { roles: string[] }) => {
    if (!ctx.roles.includes("admin")) throw new Error("forbidden")
  },
}))
vi.mock("@/lib/organization/entitlements", () => ({ requireEntitlement }))
vi.mock("@/lib/audit/record", () => ({ recordUserAudit }))
vi.mock("@workspace/contracts/server", () => ({
  appOrigin: () => "https://copilot.example.com",
}))
vi.mock("@workspace/auth/sso", async (original) => ({
  ...(await original<typeof import("@workspace/auth/sso")>()),
  discoverIdentityProvider: vi.fn(async (issuer: string) => ({
    issuer,
    discoveryEndpoint: `${issuer}/.well-known/openid-configuration`,
    authorizationEndpoint: `${issuer}/authorize`,
    tokenEndpoint: `${issuer}/token`,
    jwksEndpoint: `${issuer}/jwks`,
  })),
}))

import {
  getSsoSettings,
  providerIdFor,
  saveSsoProvider,
  setSsoEnforced,
  ssoProviderInputSchema,
} from "./sso"

const admin = {
  organizationId: "org_1",
  userId: "u1",
  userName: "Ada",
  userEmail: "ada@corp.com",
  roles: ["admin"],
} as never
const member = { ...(admin as object), roles: ["member"] } as never

const oidc = {
  kind: "oidc" as const,
  domain: "corp.com",
  issuer: "https://login.corp.com",
  clientId: "client",
  clientSecret: "secret",
}

beforeEach(() => {
  vi.clearAllMocks()
  prisma.organization.findUniqueOrThrow.mockResolvedValue({
    name: "Corp",
    ssoEnforced: false,
  })
  prisma.$transaction.mockImplementation(async (run) => run(prisma))
})

describe("ssoProviderInputSchema", () => {
  it("normalizes the domain and rejects anything that is not one", () => {
    expect(
      ssoProviderInputSchema.parse({ ...oidc, domain: " Corp.COM " }).domain
    ).toBe("corp.com")
    expect(
      ssoProviderInputSchema.safeParse({ ...oidc, domain: "corp.com,evil.com" })
        .success
    ).toBe(false)
    expect(
      ssoProviderInputSchema.safeParse({ ...oidc, domain: "localhost" }).success
    ).toBe(false)
  })
})

describe("getSsoSettings", () => {
  it("hides the settings from members without the capability", async () => {
    await expect(getSsoSettings(member)).resolves.toBeNull()
  })

  it("never returns the client secret and shows the pending TXT record", async () => {
    prisma.ssoProvider.findUnique.mockResolvedValue({
      domain: "corp.com",
      domainVerified: false,
      issuer: "https://login.corp.com",
      oidcConfig: JSON.stringify({
        clientId: "client",
        clientSecret: "s3cr3t",
      }),
      samlConfig: null,
    })
    prisma.organization.findUnique.mockResolvedValue({ ssoEnforced: false })
    prisma.verification.findFirst.mockResolvedValue({ value: "token" })

    const settings = await getSsoSettings(admin)

    expect(JSON.stringify(settings)).not.toContain("s3cr3t")
    expect(settings?.verification).toEqual({
      name: `_asynchrone-space-verification-${providerIdFor("org_1")}.corp.com`,
      value: "token",
    })
  })
})

describe("saveSsoProvider", () => {
  it("checks the entitlement before touching the provider", async () => {
    requireEntitlement.mockRejectedValueOnce(new Error("upgrade"))
    await expect(saveSsoProvider(admin, oidc)).rejects.toThrow("upgrade")
    expect(api.registerSSOProvider).not.toHaveBeenCalled()
  })

  it("registers an OIDC provider with discovered endpoints and audits it", async () => {
    prisma.ssoProvider.findUnique.mockResolvedValue(null)

    await saveSsoProvider(admin, oidc)

    expect(api.registerSSOProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          providerId: providerIdFor("org_1"),
          organizationId: "org_1",
          domain: "corp.com",
          oidcConfig: expect.objectContaining({
            clientSecret: "secret",
            tokenEndpoint: "https://login.corp.com/token",
            skipDiscovery: true,
          }),
        }),
      })
    )
    expect(recordUserAudit).toHaveBeenCalledWith(
      admin,
      expect.objectContaining({ action: "organization.sso.provider_updated" })
    )
  })

  it("keeps the stored secret on update and drops SSO-only on a new domain", async () => {
    prisma.ssoProvider.findUnique.mockResolvedValue({
      domain: "old.com",
      oidcConfig: JSON.stringify({ clientSecret: "kept" }),
      samlConfig: null,
    })

    await saveSsoProvider(admin, { ...oidc, clientSecret: "" })

    expect(api.updateSSOProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({
          oidcConfig: expect.objectContaining({ clientSecret: "kept" }),
        }),
      })
    )
    expect(prisma.organization.update).toHaveBeenCalledWith({
      where: { id: "org_1" },
      data: { ssoEnforced: false },
    })
  })
})

describe("setSsoEnforced", () => {
  it("refuses SSO-only until the domain is verified", async () => {
    prisma.ssoProvider.findUnique.mockResolvedValue({ domainVerified: false })
    await expect(setSsoEnforced(admin, true)).rejects.toMatchObject({
      code: "sso_domain_unverified",
    })
    expect(prisma.organization.update).not.toHaveBeenCalled()
  })

  it("always lets an admin turn it off, without the entitlement", async () => {
    prisma.organization.findUniqueOrThrow.mockResolvedValue({
      name: "Corp",
      ssoEnforced: true,
    })
    await setSsoEnforced(admin, false)
    expect(requireEntitlement).not.toHaveBeenCalled()
    expect(prisma.organization.update).toHaveBeenCalledWith({
      where: { id: "org_1" },
      data: { ssoEnforced: false },
    })
  })

  it("is refused to members without the capability", async () => {
    await expect(setSsoEnforced(member, false)).rejects.toThrow("forbidden")
  })
})
