import { PrismaPg } from "@prisma/adapter-pg"

import { createPool } from "@workspace/db-core"

import { PrismaClient } from "../lib/generated/prisma/client"

const pool = createPool(
  process.env.CONTROL_TOWER_DATABASE_URL ?? process.env.DATABASE_URL,
  {
    app: "control-tower",
    label: "CONTROL_TOWER_DATABASE_URL",
  }
)
const adapter = new PrismaPg(pool, { disposeExternalPool: false })

export const prisma = new PrismaClient({ adapter })
export { Prisma } from "../lib/generated/prisma/client"
export type { PrismaClient } from "../lib/generated/prisma/client"
export { pool }
