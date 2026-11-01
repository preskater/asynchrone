import { describe, expect, it } from "vitest"

import { toMemberDirectoryEntry } from "./directory"

function source(role: string) {
  return {
    userId: "user_1",
    role,
    user: {
      name: "Ada Lovelace",
      email: "ada@example.com",
      image: null,
    },
  }
}

describe("toMemberDirectoryEntry", () => {
  it("maps the member directory contract", () => {
    expect(toMemberDirectoryEntry(source("admin"))).toEqual({
      id: "user_1",
      name: "Ada Lovelace",
      email: "ada@example.com",
      avatarUrl: undefined,
      role: "admin",
    })
  })

  it("keeps client-portal members and defaults unknown roles", () => {
    expect(toMemberDirectoryEntry(source("client")).role).toBe("client")
    expect(toMemberDirectoryEntry(source("something-else")).role).toBe("member")
  })
})
