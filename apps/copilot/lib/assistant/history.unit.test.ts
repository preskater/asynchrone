import { describe, expect, it } from "vitest"

import { toAgentInput } from "@workspace/ai/chat"

import {
  parseParts,
  titleFromText,
  toChatMessages,
} from "@/lib/assistant/history"

describe("titleFromText", () => {
  it("collapses whitespace and keeps a short first message", () => {
    expect(titleFromText("  Plan\n\nmy   week  ")).toBe("Plan my week")
  })

  it("clips long messages to the title budget", () => {
    const title = titleFromText("a".repeat(200))
    expect(title.length).toBe(80)
    expect(title.endsWith("…")).toBe(true)
  })
})

describe("parseParts", () => {
  it("drops malformed parts instead of failing the reload", () => {
    expect(
      parseParts([
        { type: "text", text: "kept" },
        { type: "text", text: 42 },
        { type: "tool", name: "no-call-id" },
        { type: "unknown" },
        null,
      ])
    ).toEqual([{ type: "text", text: "kept" }])
  })

  it("defaults missing states", () => {
    expect(
      parseParts([
        { type: "reasoning", text: "hmm" },
        {
          type: "tool",
          name: "list_projects",
          callId: "call_1",
          args: "{}",
        },
      ])
    ).toEqual([
      { type: "reasoning", text: "hmm", state: "done" },
      {
        type: "tool",
        name: "list_projects",
        callId: "call_1",
        args: "{}",
        state: "call",
      },
    ])
  })

  it("returns an empty list for a non-array payload", () => {
    expect(parseParts(null)).toEqual([])
    expect(parseParts({ type: "text" })).toEqual([])
  })
})

describe("toChatMessages", () => {
  it("maps stored rows back to the rendered transcript, in order", () => {
    const messages = toChatMessages([
      {
        id: "m1",
        role: "user",
        parts: [{ type: "text", text: "Plan my week" }],
      },
      {
        id: "m2",
        role: "assistant",
        parts: [
          { type: "reasoning", text: "look", state: "done" },
          {
            type: "tool",
            name: "list_projects",
            callId: "call_1",
            args: "{}",
            state: "output",
            output: "{}",
          },
          { type: "text", text: "Here is the plan." },
        ],
      },
    ])

    expect(messages).toEqual([
      {
        id: "m1",
        role: "user",
        parts: [{ type: "text", text: "Plan my week" }],
      },
      {
        id: "m2",
        role: "assistant",
        parts: [
          { type: "reasoning", text: "look", state: "done" },
          {
            type: "tool",
            name: "list_projects",
            callId: "call_1",
            args: "{}",
            state: "output",
            output: "{}",
          },
          { type: "text", text: "Here is the plan." },
        ],
      },
    ])
  })

  it("skips rows that hold nothing replayable", () => {
    expect(
      toChatMessages([
        { id: "m1", role: "user", parts: [] },
        { id: "m2", role: "assistant", parts: [] },
        { id: "m3", role: "system", parts: [{ type: "text", text: "no" }] },
      ])
    ).toEqual([])
  })

  it("feeds the rebuilt history to the model deterministically", () => {
    const messages = toChatMessages([
      { id: "m1", role: "user", parts: [{ type: "text", text: "hi" }] },
      {
        id: "m2",
        role: "assistant",
        parts: [{ type: "text", text: "hello" }],
      },
    ])

    expect(toAgentInput(messages)).toEqual([
      { role: "user", content: "hi" },
      {
        role: "assistant",
        status: "completed",
        content: [{ type: "output_text", text: "hello" }],
      },
    ])
  })
})
