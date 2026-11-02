import "dotenv/config"

import { randomUUID } from "node:crypto"

import { expect, test } from "@playwright/test"
import { Client } from "pg"

import { signUp } from "./fixtures"

/**
 * Persistence across reload and the conversation rail.
 *
 * The suite runs without an OpenAI key, so it seeds server-owned conversations
 * instead of calling the model: the point is that the page lists, reopens,
 * creates and deletes conversations through the server APIs, and that the
 * transcript survives a reload. The empty conversation created by "New chat"
 * needs no model call, which is what lets the create flow run offline.
 */

async function connect() {
  const client = new Client({ connectionString: process.env.IDENTITY_DATABASE_URL ?? process.env.DATABASE_URL })
  await client.connect()
  return client
}

async function seedConversation(
  client: Client,
  input: {
    slug: string
    title: string
    userText: string
    assistantText: string
  }
) {
  const owner = await client.query<{
    organization_id: string
    user_id: string
  }>(
    `select o.id as organization_id, m."userId" as user_id
       from organization o
       join member m on m."organizationId" = o.id
      where o.slug = $1 and m.role like '%owner%'
      limit 1`,
    [input.slug]
  )
  const row = owner.rows[0]
  if (!row) throw new Error(`No owner for organization ${input.slug}`)

  const conversationId = randomUUID()
  await client.query(
    `insert into "assistantConversation"
       (id, "organizationId", "userId", title, "updatedAt")
     values ($1, $2, $3, $4, now())`,
    [conversationId, row.organization_id, row.user_id, input.title]
  )
  await client.query(
    `insert into "assistantMessage" (id, "conversationId", role, parts, "createdAt")
     values ($1, $2, 'user', $3::jsonb, now() - interval '1 minute'),
            ($4, $2, 'assistant', $5::jsonb, now())`,
    [
      randomUUID(),
      conversationId,
      JSON.stringify([{ type: "text", text: input.userText }]),
      randomUUID(),
      JSON.stringify([{ type: "text", text: input.assistantText }]),
    ]
  )

  return {
    ...input,
    conversationId,
    organizationId: row.organization_id,
  }
}

/** Row buttons start with the title; delete buttons start with "Delete". */
function titlePattern(title: string) {
  return new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`)
}

async function deleteConversations(client: Client, conversationIds: string[]) {
  if (conversationIds.length === 0) return
  await client.query(
    `delete from "assistantConversation" where id = any($1::text[])`,
    [conversationIds]
  )
}

test("the assistant reloads the conversation the server stored", async ({
  page,
}) => {
  const suffix = randomUUID().slice(0, 8)
  const userText = `Which projects are behind (${suffix})?`
  const assistantText = `Nothing is behind (${suffix}).`
  const slug = await signUp(page)

  const client = await connect()
  let conversationId: string | undefined
  try {
    const seeded = await seedConversation(client, {
      slug,
      title: `Plan ${suffix}`,
      userText,
      assistantText,
    })
    conversationId = seeded.conversationId

    const storageKey = `assistant:conversation:${seeded.organizationId}`
    await page.addInitScript(
      ({ key, id }) => window.localStorage.setItem(key, id),
      { key: storageKey, id: conversationId }
    )

    await page.goto(`/${slug}`)
    // `next dev` compiles the route on first use, so allow a cold compile.
    await expect(page.getByText(userText)).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText(assistantText)).toBeVisible()

    // A reload asks the server again; the client keeps only the id.
    await page.reload()
    await expect(page.getByText(userText)).toBeVisible({ timeout: 30_000 })
    await expect(page.getByText(assistantText)).toBeVisible()
    await expect(
      page.evaluate((key) => window.localStorage.getItem(key), storageKey)
    ).resolves.toBe(conversationId)

    // An id that is not this user's is a 404, never a foreign transcript.
    const foreign = await page.request.get(
      `/api/assistant?conversationId=${randomUUID()}`
    )
    expect(foreign.status()).toBe(404)
  } finally {
    if (conversationId) await deleteConversations(client, [conversationId])
    await client.end()
  }
})

test("creates, reopens and deletes conversations from the organization home", async ({
  page,
}) => {
  const suffix = randomUUID().slice(0, 8)
  const slug = await signUp(page)

  const client = await connect()
  const seeded: string[] = []
  let createdId: string | null = null
  try {
    const first = await seedConversation(client, {
      slug,
      title: `Plan ${suffix}`,
      userText: `Plan the week (${suffix})`,
      assistantText: `The week is planned (${suffix}).`,
    })
    const second = await seedConversation(client, {
      slug,
      title: `Review ${suffix}`,
      userText: `Review the launch (${suffix})`,
      assistantText: `The launch is reviewed (${suffix}).`,
    })
    seeded.push(first.conversationId, second.conversationId)
    const storageKey = `assistant:conversation:${first.organizationId}`

    await page.goto(`/${slug}`)

    // Copilot itself is the organization home: no redirect to another shell.
    expect(new URL(page.url()).pathname).toBe(`/en/${slug}`)

    // The list is server-loaded, so both titles are present before any fetch.
    const rail = page.getByTestId("conversation-rail")
    await expect(
      rail.getByRole("button", { name: titlePattern(first.title) })
    ).toBeVisible({ timeout: 30_000 })
    await expect(
      rail.getByRole("button", { name: titlePattern(second.title) })
    ).toBeVisible()

    // Reopen a stored conversation from the rail.
    await rail.getByRole("button", { name: titlePattern(first.title) }).click()
    await expect(page.getByText(first.userText)).toBeVisible()
    await expect(page.getByText(first.assistantText)).toBeVisible()
    await expect(
      page.evaluate((key) => window.localStorage.getItem(key), storageKey)
    ).resolves.toBe(first.conversationId)

    // Reopen reloads the same transcript from the server, not from the client.
    await page.reload()
    await expect(page.getByText(first.userText)).toBeVisible({
      timeout: 30_000,
    })
    await expect(page.getByText(first.assistantText)).toBeVisible()

    // New chat creates an empty conversation immediately (no model call).
    await rail.getByRole("button", { name: "New chat", exact: true }).click()
    await expect(
      page.getByRole("heading", { name: "Asynchrone Space assistant" })
    ).toBeVisible({ timeout: 30_000 })
    await expect(
      rail.getByRole("button", { name: titlePattern("New conversation") })
    ).toBeVisible()

    const createdIdFromStorage = await page.evaluate(
      (key) => window.localStorage.getItem(key),
      storageKey
    )
    expect(createdIdFromStorage).toBeTruthy()
    expect(createdIdFromStorage).not.toBe(first.conversationId)
    createdId = createdIdFromStorage
    if (!createdId) throw new Error("New chat did not persist a conversation")

    // The empty conversation survives a reload and stays selected.
    await page.reload()
    await expect(
      page.getByRole("heading", { name: "Asynchrone Space assistant" })
    ).toBeVisible({ timeout: 30_000 })
    await expect(
      page.evaluate((key) => window.localStorage.getItem(key), storageKey)
    ).resolves.toBe(createdId)

    // The list endpoint is scoped to this organization and user.
    const listResponse = await page.request.get("/api/assistant/conversations")
    expect(listResponse.ok()).toBeTruthy()
    const list = (await listResponse.json()) as {
      conversations: { id: string; title: string; updatedAt: string }[]
    }
    const listIds = list.conversations.map((conversation) => conversation.id)
    expect(listIds).toEqual(expect.arrayContaining(seeded))
    expect(listIds).toEqual(expect.arrayContaining([createdId]))

    // Reopen the other seeded conversation before deleting the empty one.
    await rail.getByRole("button", { name: titlePattern(second.title) }).click()
    await expect(page.getByText(second.assistantText)).toBeVisible()

    // Delete the empty conversation through the confirmation dialog.
    const createdTitle = "New conversation"
    await rail
      .getByRole("button", {
        name: new RegExp(`Delete conversation.*${createdTitle}`),
      })
      .click()
    await page.getByRole("button", { name: "Delete", exact: true }).click()

    await expect(
      rail.getByRole("button", {
        name: new RegExp(`Delete conversation.*${createdTitle}`),
      })
    ).toHaveCount(0)
    // The active transcript is untouched when another conversation is deleted.
    await expect(page.getByText(second.assistantText)).toBeVisible()

    const removed = await client.query(
      `select id from "assistantConversation" where id = $1`,
      [createdId]
    )
    expect(removed.rowCount).toBe(0)
    // Deleting a missing or foreign id is a 404, never a cross-user delete.
    const foreignDelete = await page.request.delete(
      `/api/assistant/conversations/${randomUUID()}`
    )
    expect(foreignDelete.status()).toBe(404)
  } finally {
    await deleteConversations(
      client,
      createdId ? [...seeded, createdId] : seeded
    )
    await client.end()
  }
})

test("opens the conversation rail in a sheet on a phone", async ({ page }) => {
  const suffix = randomUUID().slice(0, 8)
  const slug = await signUp(page)

  const client = await connect()
  let conversationId: string | undefined
  try {
    const seeded = await seedConversation(client, {
      slug,
      title: `Mobile ${suffix}`,
      userText: `Open the rail (${suffix})`,
      assistantText: `The rail is open (${suffix}).`,
    })
    conversationId = seeded.conversationId

    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`/${slug}`)

    const bar = page.getByTestId("conversation-bar")
    await bar
      .getByRole("button", { name: "Conversations", exact: true })
      .click()

    const sheet = page.getByTestId("conversation-sheet")
    await expect(
      sheet.getByRole("button", { name: titlePattern(seeded.title) })
    ).toBeVisible()
    await sheet
      .getByRole("button", { name: titlePattern(seeded.title) })
      .click()

    // Selecting closes the sheet and loads the transcript.
    await expect(page.getByText(seeded.assistantText)).toBeVisible({
      timeout: 30_000,
    })
    await expect(sheet).toBeHidden()
  } finally {
    if (conversationId) await deleteConversations(client, [conversationId])
    await client.end()
  }
})
