import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.unit.test.ts"],
    exclude: ["node_modules", ".next", "e2e"],
    coverage: {
      provider: "v8",
      reporter: ["text"],
      include: ["lib/platform/**/*.ts", "actions/**/*.ts"],
      exclude: ["**/*.unit.test.ts"],
      // Floor at today's coverage: raise it, never lower it.
      thresholds: { statements: 79, branches: 75, functions: 80, lines: 80 },
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
})
