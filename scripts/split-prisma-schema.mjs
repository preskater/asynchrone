#!/usr/bin/env node
/**
 * Generate the per-app Prisma schemas from the monolith schema.
 *
 * Each app owns one database. Cross-database relation fields are removed; the
 * scalar id columns stay. Run with `node scripts/split-prisma-schema.mjs` after
 * changing `packages/db/prisma/schema.prisma` or the ownership map. #185 owns
 * the data copy; this script only creates the target schemas.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const source = readFileSync(
  join(root, "packages/db/prisma/schema.prisma"),
  "utf8"
)

const SHARED_AUDIT = "AuditLog"

const DATABASES = {
  identity: {
    package: "db-identity",
    env: "IDENTITY_DATABASE_URL",
    models: [
      "User",
      "Session",
      "Account",
      "Verification",
      "Organization",
      "TrialClaim",
      "Team",
      "TeamMember",
      "Member",
      "Invitation",
      "Notification",
      "PortalInvite",
      "Jwks",
      // Transitional home of the projects app's OIDC sessions (#160): the pilot
      // still binds the shared client until #190 moves the domain data.
      "OidcSession",
      "OauthClient",
      "OauthResource",
      "OauthClientResource",
      "OauthRefreshToken",
      "OauthAccessToken",
      "OauthConsent",
      "OauthClientAssertion",
      "TwoFactor",
      "CustomerTwoFactor",
      "Subscription",
      "Invoice",
      "BillingEvent",
      "AiUsageEvent",
      "AssistantConversation",
      "AssistantMessage",
      "RateLimit",
      "DataExport",
      "DataExportApp",
      "PlatformHandoff",
      "OrganizationDeletionJob",
      "OrganizationDeletionApp",
      "UserDeletionJob",
      "UserDeletionApp",
    ],
  },
  projects: {
    package: "db-projects",
    env: "PROJECTS_DATABASE_URL",
    models: [
      "Project",
      "ProjectMember",
      "Label",
      "ProjectLabel",
      "Task",
      "TaskIdentifierCounter",
      "TaskTemplate",
      "TaskLabel",
      "Subtask",
      "TaskComment",
      "ProjectActivity",
      "ProjectMessage",
      "RepositoryConnection",
      "UserRepositoryToken",
      // The app-local relying-party session (#160).
      "OidcSession",
    ],
  },
  calendars: {
    package: "db-calendars",
    env: "CALENDARS_DATABASE_URL",
    models: [
      "Calendar",
      "CalendarMember",
      "CalendarEvent",
      "EventAttendee",
      "MeetingSettings",
      "MeetingRequest",
      "MeetingSlot",
      // The app-local relying-party session (#161).
      "OidcSession",
    ],
  },
  files: {
    package: "db-files",
    env: "FILES_DATABASE_URL",
    models: [
      "FileNode",
      "UploadSession",
      "FileShare",
      "FileVersion",
      "FileActivity",
      // The app-local relying-party session (#161).
      "OidcSession",
    ],
  },
  messages: {
    package: "db-messages",
    env: "MESSAGES_DATABASE_URL",
    models: [
      "ChatTeam",
      "Conversation",
      "ConversationMember",
      "Message",
      "MessageReaction",
      "MessageAttachment",
      // The app-local relying-party session (#162).
      "OidcSession",
    ],
  },
  clients: {
    package: "db-clients",
    env: "CLIENTS_DATABASE_URL",
    models: [
      "Client",
      "Contact",
      "ContactCompany",
      "Pipeline",
      "PipelineStage",
      "Deal",
      "DealContact",
      "ClientActivity",
      "ClientFieldDefinition",
      "ClientDocument",
      // The app-local relying-party session (#163).
      "OidcSession",
    ],
  },
  employees: {
    package: "db-employees",
    env: "EMPLOYEES_DATABASE_URL",
    models: [
      "EmployeeProfile",
      "AttendanceEntry",
      "LeaveRequest",
      "LeaveBalance",
      "LeaveAdjustment",
      "EmployeeSettings",
      "SalaryProfile",
      "InternalActivity",
      // The app-local relying-party session (#163).
      "OidcSession",
    ],
  },
  "control-tower": {
    package: "db-control-tower",
    env: "CONTROL_TOWER_DATABASE_URL",
    models: [
      "User",
      "Session",
      "Account",
      "Verification",
      "TwoFactor",
      "Jwks",
      "PlatformAuditEvent",
      // Present in both schemas during the control-tower cutover: the customer
      // app consumes the identity copy, while the deployed control-tower
      // migration still creates its original table.
      "PlatformHandoff",
    ],
  },
}

const modelBlocks = new Map()
for (const match of source.matchAll(/^model\s+(\w+)\s*\{[\s\S]*?^\}/gm)) {
  modelBlocks.set(match[1], match[0])
}

const allModels = new Set(modelBlocks.keys())
const owners = new Map()
for (const [db, definition] of Object.entries(DATABASES)) {
  for (const model of definition.models) {
    if (!modelBlocks.has(model)) throw new Error(`${model} has no definition`)
    const current = owners.get(model) ?? new Set()
    current.add(db)
    owners.set(model, current)
  }
}
for (const model of allModels) {
  if (model !== SHARED_AUDIT && !owners.has(model)) {
    throw new Error(`${model} has no database owner`)
  }
}

function filteredModel(name, db) {
  const block = modelBlocks.get(name)
  if (!block) throw new Error(`Missing model ${name}`)
  const lines = block.split("\n")
  const kept = [lines[0]]
  for (const line of lines.slice(1, -1)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("//") || trimmed.startsWith("///")) {
      kept.push(line)
      continue
    }
    if (trimmed.startsWith("@@")) {
      kept.push(line)
      continue
    }
    const type = trimmed.split(/\s+/)[1]?.replace(/[?[\]]/g, "")
    if (type && allModels.has(type) && !owners.get(type)?.has(db)) {
      continue
    }
    kept.push(line)
  }
  kept.push(lines.at(-1))
  return kept.join("\n")
}

function auditModel() {
  const block = modelBlocks.get(SHARED_AUDIT)
  if (!block) throw new Error("AuditLog model not found")
  return block
    .split("\n")
    .filter((line) => !line.includes("organization   Organization @relation"))
    .join("\n")
}

function renderSchema(db) {
  const definition = DATABASES[db]
  const models = definition.models.map((model) => filteredModel(model, db))
  return [
    'datasource db {\n  provider = "postgresql"\n}',
    'generator client {\n  provider = "prisma-client"\n  output   = "../lib/generated/prisma"\n}',
    ...models,
    auditModel(),
  ].join("\n\n")
}

function renderPrismaConfig(env) {
  const shadowEnv = env.replace("DATABASE_URL", "SHADOW_DATABASE_URL")
  return `import path from "node:path"
import { fileURLToPath } from "node:url"

import { config as loadEnv } from "dotenv"
import { defineConfig } from "prisma/config"

const here = path.dirname(fileURLToPath(import.meta.url))

loadEnv({
  path: [path.resolve(here, "../../apps/copilot/.env"), path.resolve(here, ".env")],
  quiet: true,
})

const url = process.env.${env} ?? process.env.DATABASE_URL
if (!url) throw new Error("${env} or DATABASE_URL is required")

const shadow =
  process.env.${shadowEnv} ??
  (() => {
    const parsed = new URL(url)
    parsed.pathname = parsed.pathname + "_shadow"
    return parsed.toString()
  })()

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: { url, shadowDatabaseUrl: shadow },
})
`
}

function renderIndex(env) {
  return `import { PrismaPg } from "@prisma/adapter-pg"

import { createPool } from "@workspace/db-core"

import { PrismaClient } from "../lib/generated/prisma/client"

const pool = createPool(process.env.${env} ?? process.env.DATABASE_URL, {
  label: "${env}",
})
const adapter = new PrismaPg(pool, { disposeExternalPool: false })

export const prisma = new PrismaClient({ adapter })
export { pool }
`
}

function renderPackage(definition) {
  return `{
  "name": "@workspace/${definition.package}",
  "version": "0.0.0",
  "type": "module",
  "private": true,
  "license": "Elastic-2.0",
  "scripts": {
    "generate": "prisma generate",
    "lint": "eslint",
    "typecheck": "tsc --noEmit",
    "migrate:deploy": "prisma migrate deploy"
  },
  "dependencies": {
    "@prisma/adapter-pg": "^7.10.1",
    "@prisma/client": "^7.10.1",
    "@workspace/db-core": "*",
    "pg": "^8.23.1"
  },
  "devDependencies": {
    "@types/node": "^26.6.5",
    "@types/pg": "^8.23.1",
    "@workspace/eslint-config": "*",
    "@workspace/typescript-config": "*",
    "dotenv": "^18.0.9",
    "eslint": "^10.13.0",
    "prisma": "^7.10.1",
    "typescript": "^7"
  },
  "exports": {
    ".": "./src/index.ts"
  }
}
`
}

function write(file, content) {
  const absolute = join(root, file)
  mkdirSync(dirname(absolute), { recursive: true })
  writeFileSync(absolute, content)
}

for (const [db, definition] of Object.entries(DATABASES)) {
  const directory = `packages/${definition.package}`
  write(`${directory}/package.json`, renderPackage(definition))
  write(
    `${directory}/tsconfig.json`,
    `{
  "extends": "@workspace/typescript-config/base.json",
  "compilerOptions": {
    "declaration": false,
    "declarationMap": false,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["src", "prisma.config.ts"],
  "exclude": ["node_modules", "lib/generated"]
}
`
  )
  write(
    `${directory}/eslint.config.js`,
    `import { config } from "@workspace/eslint-config/base"

/** @type {import("eslint").Linter.Config[]} */
export default [...config, { ignores: ["lib/generated/**", "prisma/migrations/**"] }]
`
  )
  write(`${directory}/prisma.config.ts`, renderPrismaConfig(definition.env))
  write(`${directory}/prisma/schema.prisma`, renderSchema(db))
  write(`${directory}/src/index.ts`, renderIndex(definition.env))
  console.log(`wrote ${directory}`)
}
