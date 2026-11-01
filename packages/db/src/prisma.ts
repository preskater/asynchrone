import { PrismaPg } from "@prisma/adapter-pg"
import { Pool } from "pg"

// Validates required runtime configuration on first import (fail fast).
import "./env"

import { PrismaClient } from "../lib/generated/prisma/client"

/**
 * Small, explicitly configured Postgres pool.
 *
 * Every app instance (container, pod, or function) builds its own `pg.Pool`,
 * and `@prisma/adapter-pg` defaults that pool to `max: 10`. Under concurrency
 * that exhausts the database role's connection limit (`P2037 /
 * TooManyConnections`). We instead build one small pool per instance and
 * strongly recommend pointing `DATABASE_URL` at a connection pooler
 * (PgBouncer / Neon / Supabase / Accelerate).
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  pool: Pool | undefined
}

function poolMax() {
  const value = Number(process.env.DATABASE_POOL_MAX)
  if (Number.isFinite(value) && value > 0) return value
  return 3
}

function makePool() {
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    max: poolMax(),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
    allowExitOnIdle: true,
  })
}

/**
 * A single shared pool used by both Prisma and the large-object helpers in
 * `apps/copilot/lib/large-object.ts`. Prisma must never dispose of it, otherwise
 * the large-object code would be left holding a dead pool. Keep this singleton
 * on `globalThis` so hot reloads and warm serverless invocations reuse it.
 */
export const pool = globalForPrisma.pool ?? makePool()

function createPrisma() {
  const adapter = new PrismaPg(pool, { disposeExternalPool: false })
  return new PrismaClient({ adapter })
}

export const prisma = globalForPrisma.prisma ?? createPrisma()

// Cache across warm invocations of the same serverless instance.
if (!globalForPrisma.pool) {
  globalForPrisma.pool = pool
}
if (!globalForPrisma.prisma) {
  globalForPrisma.prisma = prisma
}
