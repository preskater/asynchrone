import "dotenv/config"

import { randomUUID } from "node:crypto"

import { expect, test } from "@playwright/test"
import { Client } from "pg"

import { E2E_BASE_URL } from "./env"
import {
  E2E_COPILOT_OAUTH_CLIENT_ID,
  E2E_COPILOT_OAUTH_CLIENT_SECRET,
} from "./internal-domain"
import { signUp } from "./fixtures"

/**
 * The assistant tools, MCP tools and portal now go through the domain internal
 * APIs. This spec drives the same path with a real client-credentials token so
 * a broken service-token scope, audience or delegated context fails the suite
 * without needing an OpenAI key.
 */
test("an assistant domain action creates and reads a project over the internal API", async ({
  page,
}) => {
  const slug = await signUp(page)
  const suffix = randomUUID().slice(0, 8)
  const name = `Assistant project ${suffix}`

  const client = new Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()
  let projectId: string | undefined
  try {
    const owner = await client.query<{
      organization_id: string
      user_id: string
      user_name: string
      user_email: string
    }>(
      `select o.id as organization_id, m."userId" as user_id,
              u.name as user_name, u.email as user_email
         from organization o
         join member m on m."organizationId" = o.id
         join "user" u on u.id = m."userId"
        where o.slug = $1 and m.role like '%owner%'
        limit 1`,
      [slug]
    )
    const row = owner.rows[0]
    if (!row) throw new Error(`No owner for organization ${slug}`)

    const tokenResponse = await fetch(`${E2E_BASE_URL}/api/auth/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(
          `${E2E_COPILOT_OAUTH_CLIENT_ID}:${E2E_COPILOT_OAUTH_CLIENT_SECRET}`
        ).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        resource: "urn:asynchrone:app:projects",
        scope: "internal:domain:read internal:domain:write",
      }),
    })
    expect(tokenResponse.ok).toBeTruthy()
    const token = (await tokenResponse.json()) as { access_token: string }

    const context = {
      userId: row.user_id,
      userName: row.user_name,
      userEmail: row.user_email,
      organizationId: row.organization_id,
      role: "owner",
      impersonatedBy: null,
      portal: null,
    }

    const create = await fetch(
      "http://localhost:3004/internal/v1/domain/create-project",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token.access_token}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `assistant-${suffix}`,
        },
        body: JSON.stringify({
          context,
          input: { name, status: "active" },
        }),
      }
    )
    expect(create.status).toBe(200)
    const created = (await create.json()) as { data: { id: string } }
    projectId = created.data.id

    // Retrying the same key replays the original result instead of creating a
    // second project.
    const retried = await fetch(
      "http://localhost:3004/internal/v1/domain/create-project",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token.access_token}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `assistant-${suffix}`,
        },
        body: JSON.stringify({ context, input: { name, status: "active" } }),
      }
    )
    const replay = (await retried.json()) as { data: { id: string } }
    expect(replay.data.id).toBe(projectId)

    const list = await fetch(
      "http://localhost:3004/internal/v1/domain/list-projects",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ context, input: {} }),
      }
    )
    expect(list.status).toBe(200)
    const data = (await list.json()) as {
      data: { projects: { id: string; name: string }[] }
    }
    expect(
      data.data.projects.filter((project) => project.id === projectId)
    ).toHaveLength(1)

    // Another organization cannot read the project through the same token.
    const foreign = await fetch(
      "http://localhost:3004/internal/v1/domain/get-project",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          context: { ...context, organizationId: `org_other_${suffix}` },
          input: { projectId },
        }),
      }
    )
    expect(foreign.status).toBe(404)
  } finally {
    if (projectId) {
      await client.query(`delete from project where id = $1`, [projectId])
    }
    await client.end()
  }
})
