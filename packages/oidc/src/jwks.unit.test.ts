import { describe, expect, it } from "vitest"

import type { OidcConfig } from "./config"
import { jwksUri, oidcIssuer } from "./jwks"

const config: OidcConfig = {
  issuer: "https://copilot.asynchrone.space",
  clientId: "asynchrone-projects",
  clientSecret: "secret",
  redirectUri: "https://projects.copilot.asynchrone.space/api/auth/callback",
  resource: "urn:asynchrone:app:projects",
}

describe("oidcIssuer", () => {
  it("expects the mount path Better Auth uses as the token issuer", () => {
    // Better Auth publishes `${origin}/api/auth` as `issuer` in its discovery
    // document and signs every access, ID and logout token with it.
    expect(oidcIssuer(config)).toBe("https://copilot.asynchrone.space/api/auth")
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
