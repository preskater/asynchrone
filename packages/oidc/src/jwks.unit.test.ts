import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from "jose"
import { beforeAll, describe, expect, it } from "vitest"

import type { OidcConfig } from "./config"
import {
  claimOrganizationId,
  jwksUri,
  oidcIssuer,
  twoFactorRequiredByClaims,
  verifyAccessToken,
  verifyIdToken,
  verifyLogoutToken,
} from "./jwks"

const config: OidcConfig = {
  issuer: "https://copilot.asynchrone.space",
  clientId: "asynchrone-projects",
  clientSecret: "secret",
  redirectUri: "https://projects.copilot.asynchrone.space/api/auth/callback",
  resource: "urn:asynchrone:app:projects",
}

const issuer = "https://copilot.asynchrone.space/api/auth"

let privateKey: Awaited<ReturnType<typeof generateKeyPair>>["privateKey"]
let sign: (options?: {
  audience?: string
  issuer?: string
  expiresAt?: number
  payload?: Record<string, unknown>
}) => Promise<string>
let otherSign: () => Promise<string>
let keySet: ReturnType<typeof createLocalJWKSet>

beforeAll(async () => {
  const pair = await generateKeyPair("RS256")
  privateKey = pair.privateKey
  const jwk = await exportJWK(pair.publicKey)
  jwk.kid = "test-key"
  jwk.alg = "RS256"
  jwk.use = "sig"
  keySet = createLocalJWKSet({ keys: [jwk] })

  sign = async ({
    audience = config.resource,
    issuer: tokenIssuer = issuer,
    expiresAt,
    payload = {},
  } = {}) =>
    new SignJWT(payload)
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .setIssuer(tokenIssuer)
      .setAudience(audience)
      .setSubject("user_1")
      .setIssuedAt()
      .setExpirationTime(expiresAt ?? Math.floor(Date.now() / 1000) + 300)
      .sign(privateKey)

  const other = await generateKeyPair("RS256")
  otherSign = async () =>
    new SignJWT({})
      .setProtectedHeader({ alg: "RS256", kid: "other-key" })
      .setIssuer(issuer)
      .setAudience(config.resource)
      .setSubject("user_1")
      .setIssuedAt()
      .setExpirationTime(Math.floor(Date.now() / 1000) + 300)
      .sign(other.privateKey)
})

describe("oidcIssuer", () => {
  it("expects the mount path Better Auth uses as the token issuer", () => {
    // Better Auth publishes `${origin}/api/auth` as `issuer` in its discovery
    // document and signs every access, ID and logout token with it.
    expect(oidcIssuer(config)).toBe(issuer)
  })

  it("keeps local development origins working", () => {
    expect(oidcIssuer({ ...config, issuer: "http://localhost:3003" })).toBe(
      "http://localhost:3003/api/auth"
    )
  })

  it("rejects an issuer that carries a path", () => {
    expect(() =>
      oidcIssuer({ ...config, issuer: "https://copilot.example/api/auth" })
    ).toThrow()
  })
})

describe("jwksUri", () => {
  it("points at the mounted JWKS endpoint", () => {
    expect(jwksUri(config)).toBe(
      "https://copilot.asynchrone.space/api/auth/jwks"
    )
  })
})

describe("access token verification", () => {
  it("accepts a correctly signed token for this app's audience", async () => {
    const claims = await verifyAccessToken(config, await sign(), { keySet })
    expect(claims).toMatchObject({ sub: "user_1", aud: config.resource })
  })

  it("rejects a token minted for another app", async () => {
    await expect(
      verifyAccessToken(
        config,
        await sign({ audience: "urn:asynchrone:app:files" }),
        { keySet }
      )
    ).rejects.toThrow()
  })

  it("rejects a token from another issuer", async () => {
    await expect(
      verifyAccessToken(
        config,
        await sign({ issuer: "https://evil.example" }),
        {
          keySet,
        }
      )
    ).rejects.toThrow()
  })

  it("rejects a token signed by another key", async () => {
    await expect(
      verifyAccessToken(config, await otherSign(), { keySet })
    ).rejects.toThrow()
  })

  it("rejects an expired token outside the clock skew", async () => {
    const expired = Math.floor(Date.now() / 1000) - 120
    await expect(
      verifyAccessToken(config, await sign({ expiresAt: expired }), {
        keySet,
        clockToleranceSeconds: 60,
      })
    ).rejects.toThrow()
  })

  it("accepts a just-expired token inside the clock skew", async () => {
    const justExpired = Math.floor(Date.now() / 1000) - 30
    await expect(
      verifyAccessToken(config, await sign({ expiresAt: justExpired }), {
        keySet,
        clockToleranceSeconds: 60,
      })
    ).resolves.toMatchObject({ sub: "user_1" })
  })

  it("can disable the skew with clockToleranceSeconds: 0", async () => {
    const justExpired = Math.floor(Date.now() / 1000) - 30
    await expect(
      verifyAccessToken(config, await sign({ expiresAt: justExpired }), {
        keySet,
        clockToleranceSeconds: 0,
      })
    ).rejects.toThrow()
  })
})

describe("claim helpers", () => {
  it("reads either organization claim shape", () => {
    expect(claimOrganizationId({ sub: "u", org: "org_1" })).toBe("org_1")
    expect(claimOrganizationId({ sub: "u", organizationId: "org_2" })).toBe(
      "org_2"
    )
    expect(claimOrganizationId({ sub: "u" })).toBeNull()
  })

  it("flags a token issued under a 2FA policy", () => {
    expect(
      twoFactorRequiredByClaims({
        sub: "u",
        twoFactorRequired: true,
        twoFactorEnrolled: false,
      })
    ).toBe(true)
    expect(
      twoFactorRequiredByClaims({
        sub: "u",
        twoFactorRequired: true,
        twoFactorEnrolled: true,
      })
    ).toBe(false)
    expect(
      twoFactorRequiredByClaims({
        sub: "u",
        twoFactorRequired: true,
        twoFactorEnrolled: false,
        impersonated: true,
      })
    ).toBe(false)
    expect(twoFactorRequiredByClaims(null)).toBe(false)
  })
})

describe("ID and logout tokens", () => {
  it("verifies the ID token against the client audience", async () => {
    const token = await sign({ audience: config.clientId })
    await expect(
      verifyIdToken(config, token, { keySet })
    ).resolves.toMatchObject({ sub: "user_1" })
  })

  it("requires the back-channel logout event and sid", async () => {
    const token = await sign({
      audience: config.clientId,
      payload: {
        sid: "sid_1",
        events: { "http://schemas.openid.net/event/backchannel-logout": {} },
      },
    })
    await expect(
      verifyLogoutToken(config, token, { keySet })
    ).resolves.toMatchObject({ sid: "sid_1" })

    const withoutEvent = await sign({ audience: config.clientId })
    await expect(
      verifyLogoutToken(config, withoutEvent, { keySet })
    ).rejects.toThrow(/back-channel logout event/)
  })
})
