import "dotenv/config"

import { randomUUID } from "node:crypto"

import { expect, test } from "@playwright/test"
import { Client } from "pg"

import { signUp } from "./fixtures"

/**
 * Persistence across reload. The suite runs without an OpenAI key, so it seeds
 * a server-owned conversation instead of calling the model: the point is that
 * the page loads history from the database and keeps it after a reload, not
 * that the model streams.
 */

async function connect() {
  const client = new Client({ connectionString: process.env.DATABASE_URL })
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

  return { conversationId, organizationId: row.organization_id }
}

test("the assistant reloads the conversation the server stored", async ({
  page,
}) => {
  const suffix = randomUUID().slice(0, 8)
  const userText = `Which projects are behind (${suffix})?`
  const assistantText = `Nothing is behind (${suffix}).`
  const slug = await signUp(page)

  const client = await connect()
  try {
    const { conversationId, organizationId } = await seedConversation(client, {
      slug,
      title: `Plan ${suffix}`,
      userText,
      assistantText,
    })

    const storageKey = `assistant:conversation:${organizationId}`
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

    await client.query(`delete from "assistantConversation" where id = $1`, [
      conversationId,
    ])
  } finally {
    await client.end()
  }
})
