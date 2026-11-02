import { PrismaPg } from "@prisma/adapter-pg"

import { createPool } from "@workspace/db-core"

import { PrismaClient } from "../lib/generated/prisma/client"

const pool = createPool(
  process.env.FILES_DATABASE_URL ?? process.env.DATABASE_URL,
  {
    app: "files",
    label: "FILES_DATABASE_URL",
  }
)
const adapter = new PrismaPg(pool, { disposeExternalPool: false })

export const prisma = new PrismaClient({ adapter })
export { pool }
