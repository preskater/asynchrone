import { describe, expect, it } from "vitest"

import {
  applyAssistantEvent,
  finishAssistantParts,
  toAgentInput,
  type AssistantPart,
} from "./chat"

describe("applyAssistantEvent", () => {
  it("coalesces text deltas into one part", () => {
    let parts: AssistantPart[] = []
    parts = applyAssistantEvent(parts, { type: "text", delta: "Hel" })
    parts = applyAssistantEvent(parts, { type: "text", delta: "lo" })

    expect(parts).toEqual([{ type: "text", text: "Hello" }])
  })

  it("keeps a tool call and its output on the same part", () => {
    let parts = applyAssistantEvent([], {
      type: "tool_call",
      name: "list_projects",
      callId: "call_1",
      args: "{}",
    })
    expect(parts).toEqual([
      {
        type: "tool",
        name: "list_projects",
        callId: "call_1",
        args: "{}",
        state: "call",
      },
    ])

    parts = applyAssistantEvent(parts, {
      type: "tool_output",
      name: "list_projects",
      callId: "call_1",
      output: '{"projects":[]}',
    })
    expect(parts).toEqual([
      {
        type: "tool",
        name: "list_projects",
        callId: "call_1",
        args: "{}",
        state: "output",
        output: '{"projects":[]}',
      },
    ])
  })

  it("appends text that follows a tool call as its own part", () => {
    let parts = applyAssistantEvent([], { type: "text", delta: "Checking." })
    parts = applyAssistantEvent(parts, {
      type: "tool_call",
      name: "list_projects",
      callId: "call_1",
      args: "{}",
    })
    parts = applyAssistantEvent(parts, { type: "text", delta: " Done." })

    expect(parts.map((part) => part.type)).toEqual(["text", "tool", "text"])
  })

  it("ignores empty deltas and terminal events", () => {
    const parts: AssistantPart[] = [{ type: "text", text: "kept" }]
    expect(applyAssistantEvent(parts, { type: "text", delta: "" })).toBe(parts)
    expect(
      applyAssistantEvent(parts, { type: "text", delta: "" })
    ).toHaveLength(1)
    expect(applyAssistantEvent(parts, { type: "done" })).toBe(parts)
    expect(applyAssistantEvent(parts, { type: "error", message: "boom" })).toBe(
      parts
    )
  })
})

describe("finishAssistantParts", () => {
  it("marks reasoning that was still streaming as done", () => {
    const parts: AssistantPart[] = [
      { type: "reasoning", text: "thinking", state: "streaming" },
      { type: "text", text: "answer" },
    ]

    expect(finishAssistantParts(parts)).toEqual([
      { type: "reasoning", text: "thinking", state: "done" },
      { type: "text", text: "answer" },
    ])
  })
})

describe("toAgentInput", () => {
  it("rebuilds the same history the client streamed, including tool pairs", () => {
    const parts: AssistantPart[] = [
      { type: "reasoning", text: "look first", state: "done" },
      { type: "text", text: "Looking." },
      {
        type: "tool",
        name: "list_projects",
        callId: "call_1",
        args: "{}",
        state: "output",
        output: '{"projects":[]}',
      },
      { type: "text", text: "Done." },
    ]

    expect(
      toAgentInput([
        {
          id: "user_1",
          role: "user",
          parts: [{ type: "text", text: "ship it" }],
        },
        { id: "assistant_1", role: "assistant", parts },
      ])
    ).toEqual([
      { role: "user", content: "ship it" },
      {
        role: "assistant",
        status: "completed",
        content: [{ type: "output_text", text: "Looking." }],
      },
      {
        type: "function_call",
        callId: "call_1",
        name: "list_projects",
        arguments: "{}",
      },
      {
        type: "function_call_result",
        callId: "call_1",
        name: "list_projects",
        status: "completed",
        output: '{"projects":[]}',
      },
      {
        role: "assistant",
        status: "completed",
        content: [{ type: "output_text", text: "Done." }],
      },
    ])
  })

  it("never replays reasoning parts to the model", () => {
    expect(
      toAgentInput([
        {
          id: "assistant_1",
          role: "assistant",
          parts: [{ type: "reasoning", text: "private", state: "done" }],
        },
      ])
    ).toEqual([])
  })
})
