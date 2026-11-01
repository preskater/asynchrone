import "dotenv/config"

// The contract suite always runs against a migrated database: the export
// assertions import the app adapters, which validate runtime env on load.
if (!process.env.DATABASE_URL) {
  throw new Error(
    "test:contracts requires DATABASE_URL pointing at a migrated PostgreSQL. " +
      "Run `cd packages/db && npx prisma migrate deploy` first; see docs/contract-tests.md."
  )
}
