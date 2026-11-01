import { describe, expect, it } from "vitest"

import {
  removeConversation,
  sortConversations,
  upsertConversation,
  type AssistantConversationSummary,
} from "./conversations"

function conversation(
  id: string,
  updatedAt: string,
  title = id
): AssistantConversationSummary {
  return { id, title, updatedAt }
}

describe("sortConversations", () => {
  it("orders the newest conversation first", () => {
    const sorted = sortConversations([
      conversation("old", "2026-01-01T00:00:00.000Z"),
      conversation("new", "2026-03-01T00:00:00.000Z"),
      conversation("middle", "2026-02-01T00:00:00.000Z"),
    ])

    expect(sorted.map((entry) => entry.id)).toEqual(["new", "middle", "old"])
  })

  it("keeps an unparseable timestamp at the bottom instead of crashing", () => {
    const sorted = sortConversations([
      conversation("invalid", "not-a-date"),
      conversation("valid", "2026-03-01T00:00:00.000Z"),
    ])

    expect(sorted.map((entry) => entry.id)).toEqual(["valid", "invalid"])
  })

  it("does not mutate its input", () => {
    const input = [
      conversation("a", "2026-01-01T00:00:00.000Z"),
      conversation("b", "2026-02-01T00:00:00.000Z"),
    ]

    sortConversations(input)

    expect(input.map((entry) => entry.id)).toEqual(["a", "b"])
  })
})

describe("upsertConversation", () => {
  it("adds a new conversation at the top", () => {
    const next = upsertConversation(
      [conversation("existing", "2026-01-01T00:00:00.000Z")],
      conversation("created", "2026-02-01T00:00:00.000Z")
    )

    expect(next.map((entry) => entry.id)).toEqual(["created", "existing"])
  })

  it("replaces an existing conversation without duplicating it", () => {
    const next = upsertConversation(
      [
        conversation("first", "2026-01-01T00:00:00.000Z"),
        conversation("second", "2026-02-01T00:00:00.000Z"),
      ],
      conversation("first", "2026-03-01T00:00:00.000Z", "Renamed")
    )

    expect(next.map((entry) => entry.id)).toEqual(["first", "second"])
    expect(next[0]!.title).toBe("Renamed")
  })
})

describe("removeConversation", () => {
  it("drops only the deleted conversation", () => {
    const next = removeConversation(
      [
        conversation("keep", "2026-01-01T00:00:00.000Z"),
        conversation("delete", "2026-02-01T00:00:00.000Z"),
      ],
      "delete"
    )

    expect(next.map((entry) => entry.id)).toEqual(["keep"])
  })

  it("is a no-op for an unknown id", () => {
    const input = [conversation("keep", "2026-01-01T00:00:00.000Z")]

    expect(removeConversation(input, "missing")).toEqual(input)
  })
})
