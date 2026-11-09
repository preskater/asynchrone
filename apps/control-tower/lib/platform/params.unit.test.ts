import { describe, expect, it } from "vitest"

import { pageHref, readPage, readString } from "./params"

describe("readString", () => {
  it("reads the first value and defaults to empty", () => {
    expect(readString({ q: ["a", "b"] }, "q")).toBe("a")
    expect(readString({ q: "a" }, "q")).toBe("a")
    expect(readString({}, "q")).toBe("")
  })
})

describe("readPage", () => {
  it.each([
    ["3", 3],
    ["0", 1],
    ["-2", 1],
    ["1.5", 1],
    ["abc", 1],
  ])("reads %s as %i", (page, expected) => {
    expect(readPage({ page })).toBe(expected)
  })
})

describe("pageHref", () => {
  it("drops empty values and the first page", () => {
    expect(pageHref("/users", 1, { q: "" })).toBe("/users")
    expect(pageHref("/users", 2, { q: "a b", status: "" })).toBe(
      "/users?q=a+b&page=2"
    )
  })
})
