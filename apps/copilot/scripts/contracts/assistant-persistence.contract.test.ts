import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { toAgentInput, type AssistantPart } from "@workspace/ai/chat"

import {
  beginTurn,
  completeTurn,
  createConversation,
  deleteConversation,
  listConversations,
  loadConversation,
  MAX_HISTORY_MESSAGES,
} from "@/lib/assistant/conversations"
import { prisma } from "@/lib/prisma"

import {
  createContractFixture,
  rejectionOf,
  type ContractFixture,
} from "./fixtures"

/**
 * Server-owned assistant history against a migrated database: the accepted
 * turn is stored, the reload reads it back, and another organization or
 * another member cannot reach it.
 */
describe("assistant conversation persistence", () => {
  let fixture: ContractFixture

  beforeAll(async () => {
    fixture = await createContractFixture()
  })

  afterAll(async () => {
    await fixture?.cleanup()
  })

  it("stores the accepted user message and reloads the conversation", async () => {
    const turn = await beginTurn(fixture.ctxAlice, { text: "Plan my week" })

    expect(turn.history).toEqual([])
    expect(turn.conversationId).toBeTruthy()

    const reloaded = await loadConversation(
      fixture.ctxAlice,
      turn.conversationId
    )
    expect(reloaded.title).toBe("Plan my week")
    expect(reloaded.messages).toHaveLength(1)
    expect(reloaded.messages[0]).toMatchObject({
      role: "user",
      parts: [{ type: "text", text: "Plan my week" }],
    })
  })

  it("persists the assistant parts and rebuilds the model history", async () => {
    const first = await beginTurn(fixture.ctxAlice, { text: "List projects" })
    const parts: AssistantPart[] = [
      { type: "reasoning", text: "look first", state: "done" },
      { type: "text", text: "Looking." },
      {
        type: "tool",
        name: "list_projects",
        callId: `call_${fixture.suffix}`,
        args: "{}",
        state: "output",
        output: JSON.stringify({ projects: [fixture.projectA] }),
      },
      { type: "text", text: "You have one project." },
    ]
    await completeTurn(fixture.ctxAlice, first.conversationId, parts)

    const next = await beginTurn(fixture.ctxAlice, {
      conversationId: first.conversationId,
      text: "And the tasks?",
    })

    expect(next.history.map((message) => message.role)).toEqual([
      "user",
      "assistant",
    ])
    expect(next.history[1]!.parts).toEqual(parts)

    // The same history the client streamed is what the model receives: text
    // turns plus paired function call / result items, never reasoning.
    expect(toAgentInput(next.history)).toEqual([
      { role: "user", content: "List projects" },
      {
        role: "assistant",
        status: "completed",
        content: [{ type: "output_text", text: "Looking." }],
      },
      {
        type: "function_call",
        callId: `call_${fixture.suffix}`,
        name: "list_projects",
        arguments: "{}",
      },
      {
        type: "function_call_result",
        callId: `call_${fixture.suffix}`,
        name: "list_projects",
        status: "completed",
        output: JSON.stringify({ projects: [fixture.projectA] }),
      },
      {
        role: "assistant",
        status: "completed",
        content: [{ type: "output_text", text: "You have one project." }],
      },
    ])

    const reloaded = await loadConversation(
      fixture.ctxAlice,
      first.conversationId
    )
    expect(reloaded.messages).toHaveLength(3)
  })

  it("rejects a conversation from another organization", async () => {
    const turn = await beginTurn(fixture.ctxAlice, { text: "private" })

    await expect(
      rejectionOf(
        beginTurn(fixture.ctxMallory, {
          conversationId: turn.conversationId,
          text: "hijack",
        })
      )
    ).resolves.toMatchObject({ code: "not_found" })
    await expect(
      rejectionOf(loadConversation(fixture.ctxMallory, turn.conversationId))
    ).resolves.toMatchObject({ code: "not_found" })

    // The rejected attempt wrote nothing.
    const stored = await prisma.assistantMessage.count({
      where: { conversationId: turn.conversationId },
    })
    expect(stored).toBe(1)
  })

  it("rejects another member of the same organization", async () => {
    const turn = await beginTurn(fixture.ctxAlice, { text: "private" })

    await expect(
      rejectionOf(
        beginTurn(fixture.ctxBob, {
          conversationId: turn.conversationId,
          text: "hijack",
        })
      )
    ).resolves.toMatchObject({ code: "not_found" })
    await expect(
      rejectionOf(loadConversation(fixture.ctxBob, turn.conversationId))
    ).resolves.toMatchObject({ code: "not_found" })
  })

  it("leaves a usable conversation behind when the stream fails", async () => {
    const first = await beginTurn(fixture.ctxAlice, { text: "Start" })
    // A failed run never calls `completeTurn`: no assistant row is written.
    const retry = await beginTurn(fixture.ctxAlice, {
      conversationId: first.conversationId,
      text: "Retry",
    })

    expect(retry.history).toEqual([
      {
        id: expect.any(String),
        role: "user",
        parts: [{ type: "text", text: "Start" }],
      },
    ])
    const stored = await prisma.assistantMessage.findMany({
      where: { conversationId: first.conversationId },
      select: { role: true },
    })
    expect(stored.map((row) => row.role)).toEqual(["user", "user"])
  })

  it("only replays the most recent turns of a long conversation", async () => {
    const turn = await beginTurn(fixture.ctxAlice, { text: "First" })
    const conversationId = turn.conversationId
    const base = Date.now() - 10 * 60_000

    await prisma.assistantMessage.createMany({
      data: Array.from({ length: MAX_HISTORY_MESSAGES + 10 }, (_, index) => ({
        conversationId,
        role: index % 2 === 0 ? "user" : "assistant",
        parts: [{ type: "text", text: `turn ${index}` }],
        createdAt: new Date(base + index * 1000),
      })),
    })

    const next = await beginTurn(fixture.ctxAlice, {
      conversationId,
      text: "Latest",
    })

    expect(next.history).toHaveLength(MAX_HISTORY_MESSAGES)
    expect(next.history.at(-1)).toMatchObject({ role: "user" })
  })

  it("lists the signed-in user's conversations newest first", async () => {
    const older = await createConversation(fixture.ctxAlice)
    // `updatedAt` has millisecond resolution; give the newer row a distinct stamp.
    await new Promise((resolve) => setTimeout(resolve, 10))
    const newer = await createConversation(fixture.ctxAlice)

    const aliceList = await listConversations(fixture.ctxAlice)
    const ids = aliceList.map((conversation) => conversation.id)
    expect(ids).toContain(older.id)
    expect(ids).toContain(newer.id)
    expect(ids.indexOf(newer.id)).toBeLessThan(ids.indexOf(older.id))
    expect(aliceList).toContainEqual(newer)

    // Another organization sees none of them.
    const malloryList = await listConversations(fixture.ctxMallory)
    expect(malloryList.map((conversation) => conversation.id)).not.toContain(
      newer.id
    )

    // Another member of the same organization is excluded too.
    const bobList = await listConversations(fixture.ctxBob)
    expect(bobList.map((conversation) => conversation.id)).not.toContain(
      older.id
    )
  })

  it("creates an empty conversation that can be reopened", async () => {
    const created = await createConversation(fixture.ctxAlice)

    expect(created.title).toBe("")
    expect(Number.isNaN(Date.parse(created.updatedAt))).toBe(false)

    const reloaded = await loadConversation(fixture.ctxAlice, created.id)
    expect(reloaded).toEqual({
      id: created.id,
      title: "",
      messages: [],
    })
  })

  it("deletes a conversation and its messages, rejecting foreign ids", async () => {
    const turn = await beginTurn(fixture.ctxAlice, { text: "Delete me" })
    await completeTurn(fixture.ctxAlice, turn.conversationId, [
      { type: "text", text: "Gone soon." },
    ])

    await expect(
      rejectionOf(deleteConversation(fixture.ctxMallory, turn.conversationId))
    ).resolves.toMatchObject({ code: "not_found" })
    await expect(
      rejectionOf(deleteConversation(fixture.ctxBob, turn.conversationId))
    ).resolves.toMatchObject({ code: "not_found" })

    // The rejected attempts left it intact.
    const stillThere = await loadConversation(
      fixture.ctxAlice,
      turn.conversationId
    )
    expect(stillThere.messages).toHaveLength(2)

    await deleteConversation(fixture.ctxAlice, turn.conversationId)

    await expect(
      rejectionOf(loadConversation(fixture.ctxAlice, turn.conversationId))
    ).resolves.toMatchObject({ code: "not_found" })
    // The schema cascade removed the turns as well.
    expect(
      await prisma.assistantMessage.count({
        where: { conversationId: turn.conversationId },
      })
    ).toBe(0)

    // Deleting twice is the same 404 rather than an error.
    await expect(
      rejectionOf(deleteConversation(fixture.ctxAlice, turn.conversationId))
    ).resolves.toMatchObject({ code: "not_found" })
  })
})
