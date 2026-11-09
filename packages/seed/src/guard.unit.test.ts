import { describe, expect, it } from "vitest"

import { assertSeedAllowed, demoPassword } from "./guard"

const local = "postgresql://u:p@localhost:5434/asynchrone_identity"
const remote = "postgresql://u:p@db.example.com:5432/asynchrone_identity"

describe("assertSeedAllowed", () => {
  it("allows local databases", () => {
    expect(() =>
      assertSeedAllowed({ IDENTITY_DATABASE_URL: local })
    ).not.toThrow()
  })

  it("refuses production without the override", () => {
    expect(() =>
      assertSeedAllowed({
        NODE_ENV: "production",
        IDENTITY_DATABASE_URL: local,
      })
    ).toThrow("NODE_ENV=production")
  })

  it("refuses any non-local database, naming it", () => {
    expect(() =>
      assertSeedAllowed({
        DATABASE_URL: local,
        FILES_DATABASE_URL: remote,
      })
    ).toThrow("FILES_DATABASE_URL")
  })

  it("only accepts the exact override", () => {
    expect(() =>
      assertSeedAllowed({ NODE_ENV: "production", ALLOW_SEED: "1" })
    ).toThrow()
    expect(() =>
      assertSeedAllowed({
        NODE_ENV: "production",
        ALLOW_SEED: "true",
        DATABASE_URL: remote,
      })
    ).not.toThrow()
  })
})

describe("demoPassword", () => {
  it("defaults locally and prefers SEED_DEMO_PASSWORD", () => {
    expect(demoPassword({})).toBeTruthy()
    expect(demoPassword({ SEED_DEMO_PASSWORD: "custom" })).toBe("custom")
  })

  it("never uses the documented password with the override", () => {
    expect(() => demoPassword({ ALLOW_SEED: "true" })).toThrow(
      "SEED_DEMO_PASSWORD"
    )
    expect(demoPassword({ ALLOW_SEED: "true", SEED_DEMO_PASSWORD: "x" })).toBe(
      "x"
    )
  })
})
