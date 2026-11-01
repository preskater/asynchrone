import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/*.unit.test.ts"],
    exclude: ["node_modules", ".next", "content"],
    server: {
      deps: {
        // `next-intl` imports `next/server`, which needs Next's export
        // conditions; inline it so Vitest resolves `next/server.js`.
        inline: ["next-intl"],
      },
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
      // `next-intl` imports the bare specifier, which Node cannot resolve
      // without Next's export conditions.
      "next/server": "next/server.js",
    },
  },
})
