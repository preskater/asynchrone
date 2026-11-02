import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from "jose"
import { beforeAll, describe, expect, it } from "vitest"

import type { ServiceTokenVerifier } from "@workspace/service-auth"

const COPILOT_ORIGIN = "https://copilot.example"

process.env.PROJECTS_APP_URL = "https://projects.example"
process.env.COPILOT_APP_URL = COPILOT_ORIGIN
process.env.PROJECTS_OAUTH_CLIENT_ID = "asynchrone-projects"
process.env.PROJECTS_OAUTH_CLIENT_SECRET = "projects-secret-value"
process.env.DATABASE_URL = "postgresql://user:pass@localhost:5432/test"

let verifier: ServiceTokenVerifier
let sign: (audience: string) => Promise<string>

beforeAll(async () => {
  const { publicKey, privateKey } = await generateKeyPair("RS256")
  const jwk = await exportJWK(publicKey)
  jwk.kid = "test-key"
  jwk.alg = "RS256"
  jwk.use = "sig"

  const { appServiceVerifier } = await import("./service")
  const keySet = createLocalJWKSet({ keys: [jwk] })
  verifier = appServiceVerifier({ keySet })

  sign = async (audience) =>
    new SignJWT({
      scope: "internal:domain:write",
      client_id: "asynchrone-copilot",
    })
      .setProtectedHeader({ alg: "RS256", kid: "test-key" })
      .setIssuer(`${COPILOT_ORIGIN}/api/auth`)
      .setAudience(audience)
      .setSubject("asynchrone-copilot")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(privateKey)
})

describe("projects internal service auth", () => {
  it("accepts a token minted for projects", async () => {
    await expect(
      verifier.verify(await sign("urn:asynchrone:app:projects"), {
        requiredScopes: ["internal:domain:write"],
      })
    ).resolves.toMatchObject({ aud: "urn:asynchrone:app:projects" })
  })

  it("rejects a token minted for files", async () => {
    await expect(
      verifier.verify(await sign("urn:asynchrone:app:files"))
    ).rejects.toMatchObject({ code: "invalid_token", status: 401 })
  })

  it("uses the Copilot mount path as the issuer", () => {
    expect(verifier.issuer).toBe(`${COPILOT_ORIGIN}/api/auth`)
  })
})
