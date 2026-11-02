// Validates the Copilot app's runtime configuration on first import (fail fast).
import "./env"

/**
 * Copilot's database client.
 *
 * Copilot owns `asynchrone_identity`; every other customer app owns its own
 * database. This module binds the identity package for the app, its actions
 * and the internal routes.
 */
export { pool, prisma } from "@workspace/db-identity"
