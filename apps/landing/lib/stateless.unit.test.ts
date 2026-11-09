import fs from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

import {
  findStatelessViolations,
  forbiddenDependencies,
  importSpecifiers,
} from "./stateless"

const root = process.cwd()

const scope = "@workspace/"

describe("landing is stateless", () => {
  it("has no auth, database, OIDC, Prisma or workspace-shell dependency", () => {
    expect(findStatelessViolations(root)).toEqual([])
  })

  it("flags a forbidden dependency", () => {
    expect(
      forbiddenDependencies({
        dependencies: { [`${scope}db`]: "*" },
        devDependencies: { prisma: "*" },
      })
    ).toEqual(expect.arrayContaining([`${scope}db`, "prisma"]))
  })

  it("reads static and dynamic imports", () => {
    expect(
      importSpecifiers(
        [
          `import { auth } from "${scope}auth"`,
          `const oidc = await import("${scope}oidc")`,
          'const pg = require("pg")',
        ].join("\n")
      )
    ).toEqual([`${scope}auth`, `${scope}oidc`, "pg"])
  })

  it("keeps the landing's own import graph small", () => {
    // Guards the stateless build: if this list grows, a workspace package
    // leaked into the marketing app. Sentry and the observability package are
    // stateless: they hold no session and never open a database connection.
    const allowed = new Set([
      "@mdx-js/loader",
      "@mdx-js/react",
      "@hookform/resolvers",
      "@sentry/nextjs",
      // Only the dependency-free `plans` and `support` policy tables (#101).
      "@workspace/core",
      "@workspace/i18n",
      "@workspace/next-config",
      "@workspace/observability",
      "@workspace/ui",
      "lucide-react",
      "next",
      "next-intl",
      "react",
      "react-dom",
      "react-hook-form",
      "sonner",
      "zod",
    ])

    const manifest = JSON.parse(
      fs.readFileSync(path.join(root, "package.json"), "utf8")
    ) as { dependencies?: Record<string, string> }
    expect(Object.keys(manifest.dependencies ?? {})).toEqual(
      expect.arrayContaining([...allowed])
    )
    expect(
      Object.keys(manifest.dependencies ?? {}).filter(
        (name) => !allowed.has(name)
      )
    ).toEqual([])
  })
})
