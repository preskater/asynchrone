import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

/**
 * Cross-domain contract suite.
 *
 * Kept separate from the unit suite because it needs a migrated PostgreSQL
 * database and never runs a browser. It exercises the public `@workspace/*`
 * entrypoints and the app adapters Copilot binds to them.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["scripts/contracts/**/*.contract.test.ts"],
    exclude: ["node_modules", ".next", "e2e"],
    setupFiles: ["scripts/contracts/setup.ts"],
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // The suite shares one database; sequential files keep fixtures isolated
    // and stay inside DATABASE_POOL_MAX.
    fileParallelism: false,
    sequence: { concurrent: false },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
})
