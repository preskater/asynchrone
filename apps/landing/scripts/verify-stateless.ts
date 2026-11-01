import path from "node:path"
import { fileURLToPath } from "node:url"

import { findStatelessViolations } from "../lib/stateless"

/**
 * Fails when the landing gains an auth, database, OIDC or Prisma import, a
 * session API or a workspace-shell dependency. Runs in CI's no-env landing
 * job, next to `next build`.
 */
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const violations = findStatelessViolations(root)

if (violations.length > 0) {
  console.error("landing must stay stateless:")
  for (const violation of violations) console.error(`  - ${violation}`)
  process.exit(1)
}

console.log("landing is stateless: no auth, database, OIDC, Prisma or session")
