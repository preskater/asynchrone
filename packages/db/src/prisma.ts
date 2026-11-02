import { PrismaPg } from "@prisma/adapter-pg"

import { createPool } from "@workspace/db-core"

// Validates required runtime configuration on first import (fail fast).
import "./env"

import { PrismaClient } from "../lib/generated/prisma/client"

/**
 * Small, explicitly configured Postgres pool.
 *
 * Every app instance (container, pod, or function) builds its own `pg.Pool`.
 * `@workspace/db-core` applies the fleet connection budget (ADR 0038): the
 * configured `DATABASE_POOL_MAX` is clamped to the app's ceiling, and the idle
 * timeouts release a connection left inside a transaction. Without that clamp
 * a single app could exhaust the shared PostgreSQL role (`P2037 /
 * TooManyConnections`).
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  pool: ReturnType<typeof createPool> | undefined
}

export const pool =
  globalForPrisma.pool ??
  createPool(process.env.DATABASE_URL, {
    app: "copilot",
    label: "DATABASE_URL",
  })

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
