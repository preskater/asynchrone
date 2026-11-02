import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from "jose"
import { beforeAll, describe, expect, it } from "vitest"

import { SERVICE_SCOPES } from "./verify"
import {
  ServiceTokenVerifier,
  requireInternalService,
  type ServiceTokenClaims,
} from "./verify"

const issuer = "https://copilot.asynchrone.space"
const audience = "urn:asynchrone:app:projects"

let sign: (options?: {
  audience?: string
  scope?: string
  expires?: string
  issuer?: string
}) => Promise<string>
let verifier: ServiceTokenVerifier

beforeAll(async () => {
  const { publicKey, privateKey } = await generateKeyPair("RS256")
  const jwk = await exportJWK(publicKey)
  jwk.kid = "test-key"
  jwk.alg = "RS256"
  jwk.use = "sig"
  const keySet = createLocalJWKSet({ keys: [jwk] })

  sign = async ({
    audience: tokenAudience = audience,
    scope = SERVICE_SCOPES.identityRead,
    expires = "5m",
    issuer: tokenIssuer = issuer,
  } = {}) =>
    new SignJWT({ scope, client_id: "projects" })
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .setIssuer(tokenIssuer)
      .setAudience(tokenAudience)
      .setSubject("projects")
      .setIssuedAt()
      .setExpirationTime(expires)
      .sign(privateKey)

  verifier = new ServiceTokenVerifier({ issuer, audience, keySet })
})

describe("service token verifier", () => {
  it("accepts a token for its audience and scopes", async () => {
    const token = await sign()
    const claims = await verifier.verify(token, {
      requiredScopes: [SERVICE_SCOPES.identityRead],
    })
    expect(claims).toMatchObject({ sub: "projects", aud: audience })
  })

  it("accepts Better Auth's /api/auth issuer", async () => {
    const token = await sign({ issuer: `${issuer}/api/auth` })
    await expect(verifier.verify(token)).resolves.toMatchObject({
      iss: `${issuer}/api/auth`,
    })
  })

  it("rejects a token for another app", async () => {
    const token = await sign({ audience: "urn:asynchrone:app:files" })
    await expect(verifier.verify(token)).rejects.toMatchObject({
      code: "invalid_token",
      status: 401,
    })
  })

  it("rejects a missing scope", async () => {
    const token = await sign({ scope: SERVICE_SCOPES.identityRead })
    await expect(
      verifier.verify(token, { requiredScopes: [SERVICE_SCOPES.auditRead] })
    ).rejects.toMatchObject({ code: "insufficient_scope", status: 403 })
  })

  it("rejects an expired token", async () => {
    const token = await sign({ expires: "1s" })
    await new Promise((resolve) => setTimeout(resolve, 1_100))
    await expect(verifier.verify(token)).rejects.toMatchObject({
      code: "invalid_token",
    })
  })
})

describe("requireInternalService", () => {
  it("reads a Bearer token from the request", async () => {
    const token = await sign()
    const claims: ServiceTokenClaims = await requireInternalService(
      new Request("https://projects.copilot.asynchrone.space/internal/v1/x", {
        headers: { authorization: `Bearer ${token}` },
      }),
      verifier
    )
    expect(claims.sub).toBe("projects")
  })

  it("rejects a missing Bearer token", async () => {
    await expect(
      requireInternalService(
        new Request("https://projects.copilot.asynchrone.space/internal/v1/x"),
        verifier
      )
    ).rejects.toMatchObject({ code: "missing_token", status: 401 })
  })
})
