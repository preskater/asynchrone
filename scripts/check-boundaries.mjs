#!/usr/bin/env node
/**
 * Enforce the workspace boundaries that the OAuth2/database-per-app foundation
 * relies on:
 *
 * 1. packages never import apps;
 * 2. apps never import another app;
 * 3. relative imports never escape their workspace;
 * 4. `@workspace/*` imports are declared in the importer's package.json;
 * 5. a domain may only import its own `@workspace/db-<domain>` package.
 *
 * The checker walks source files instead of relying on TypeScript resolution so
 * it also catches strings in client components and dynamic imports.
 */

import { readFileSync, readdirSync } from "node:fs"
import { dirname, extname, join, relative, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const SOURCE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
])
const IGNORED_DIRECTORIES = new Set([
  "node_modules",
  ".next",
  ".turbo",
  "dist",
  "coverage",
  "generated",
  "migrations",
  "public",
])
const WORKSPACE_ROOTS = ["apps", "packages"]

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"))
}

function listWorkspaces() {
  const workspaces = []
  for (const kindRoot of WORKSPACE_ROOTS) {
    const absoluteRoot = join(root, kindRoot)
    let entries
    try {
      entries = readdirSync(absoluteRoot, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const dir = join(absoluteRoot, entry.name)
      let manifest
      try {
        manifest = readJson(join(dir, "package.json"))
      } catch {
        continue
      }
      workspaces.push({
        dir,
        name: manifest.name,
        kind: kindRoot === "apps" ? "app" : "package",
        appKey: kindRoot === "apps" ? entry.name : null,
        dependencyNames: new Set([
          ...Object.keys(manifest.dependencies ?? {}),
          ...Object.keys(manifest.devDependencies ?? {}),
          ...Object.keys(manifest.peerDependencies ?? {}),
        ]),
      })
    }
  }
  return workspaces
}

function walk(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".") && entry.name !== ".well-known") continue
    const absolute = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (IGNORED_DIRECTORIES.has(entry.name)) continue
      walk(absolute, files)
      continue
    }
    if (SOURCE_EXTENSIONS.has(extname(entry.name))) files.push(absolute)
  }
  return files
}

const IMPORT_PATTERNS = [
  /\bfrom\s*["']([^"']+)["']/g,
  /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
  /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
  /\bimport\s*["']([^"']+)["']/g,
]

function importsIn(source) {
  const specifiers = new Set()
  for (const pattern of IMPORT_PATTERNS) {
    pattern.lastIndex = 0
    let match
    while ((match = pattern.exec(source)) !== null) {
      if (match[1]) specifiers.add(match[1])
    }
  }
  return [...specifiers]
}

function workspaceAt(absolutePath) {
  return workspaces.find(
    (workspace) =>
      absolutePath === workspace.dir ||
      absolutePath.startsWith(`${workspace.dir}${sep}`)
  )
}

/**
 * Resolve a bare import to a workspace package. Workspace apps are unscoped
 * (`copilot`, `control-tower`), so the check cannot rely on the `@workspace/`
 * prefix alone. A subpath such as `@workspace/ui/button` or `copilot/lib/x`
 * resolves to its owning package.
 */
function workspacePackageName(specifier, packages) {
  if (specifier.startsWith(".")) return null

  if (specifier.startsWith("@workspace/")) {
    const [scope, name] = specifier.split("/")
    return name ? `${scope}/${name}` : null
  }

  const [name] = specifier.split("/")
  // Unscoped workspace packages are apps. Unknown bare imports are npm
  // dependencies and never reach this branch.
  return packages.has(name) ? name : null
}

const DIRECT_PRISMA_PACKAGES = new Set(["@prisma/client", "@prisma/adapter-pg"])

const workspaces = listWorkspaces()
const packages = new Map(
  workspaces.map((workspace) => [workspace.name, workspace])
)
const errors = []

function report(file, specifier, rule, message) {
  errors.push(`${relative(root, file)}: ${rule}: ${specifier} — ${message}`)
}

const DB_OWNER_ALIASES = {
  // Copilot owns the identity database (#175).
  identity: new Set(["copilot"]),
}

function checkDbOwnership(importer, packageName, file, specifier) {
  if (!packageName.startsWith("@workspace/db-")) return
  // The shared pool/adapter package is not a per-app database.
  if (packageName === "@workspace/db-core") return
  const owner = packageName.slice("@workspace/db-".length)
  const allowed =
    importer.appKey === owner ||
    DB_OWNER_ALIASES[owner]?.has(importer.appKey) ||
    importer.name === `@workspace/${owner}` ||
    importer.name.startsWith(`@workspace/${owner}-`) ||
    importer.name === packageName
  if (!allowed) {
    report(
      file,
      specifier,
      "cross-database-import",
      `${importer.name} may not import the ${owner} database`
    )
  }
}

/**
 * `@workspace/db` is the monolith/identity client. The control tower owns its
 * own database (ADR 0032) and reads customer data through the identity admin
 * API, so it must never import it — including its plan helpers, which live in
 * `@workspace/core` now.
 */
const MONOLITH_DATABASE = "@workspace/db"

function checkMonolithDatabase(importer, file, specifier) {
  if (importer.appKey !== "control-tower") return
  if (
    specifier !== MONOLITH_DATABASE &&
    !specifier.startsWith(`${MONOLITH_DATABASE}/`)
  ) {
    return
  }
  report(
    file,
    specifier,
    "control-tower-identity-import",
    "control-tower must use @workspace/db-control-tower and the identity admin API"
  )
}

/**
 * Only the database packages may construct a Prisma client. An app or a
 * domain package reaching for `@prisma/client` directly would bypass both the
 * pool budget (`@workspace/db-core`) and the per-app database ownership rule.
 */
function checkDirectPrisma(importer, file, specifier) {
  if (!DIRECT_PRISMA_PACKAGES.has(specifier)) return
  if (importer.name.startsWith("@workspace/db")) return
  report(
    file,
    specifier,
    "direct-database-client",
    `${importer.name} must import a @workspace/db-* package instead of a Prisma client`
  )
}

for (const workspace of workspaces) {
  for (const file of walk(workspace.dir)) {
    const source = readFileSync(file, "utf8")
    for (const specifier of importsIn(source)) {
      if (specifier.startsWith(".")) {
        const resolved = resolve(dirname(file), specifier)
        const target = workspaceAt(resolved)
        if (target && target.dir !== workspace.dir) {
          report(
            file,
            specifier,
            "relative-cross-workspace",
            `${workspace.name} may not reach into ${target.name}`
          )
        } else if (!resolved.startsWith(`${workspace.dir}${sep}`)) {
          report(
            file,
            specifier,
            workspace.kind === "package" ? "package-escape" : "app-escape",
            "relative import escapes the workspace"
          )
        }
        continue
      }

      checkDirectPrisma(workspace, file, specifier)

      const packageName = workspacePackageName(specifier, packages)
      if (!packageName) continue

      const dependency = packages.get(packageName)
      if (!dependency) {
        report(
          file,
          specifier,
          "unknown-workspace-package",
          "package is not a workspace package"
        )
        continue
      }

      if (dependency.name === workspace.name) continue

      // App source must never import another app: the split relies on every
      // app being independently deployable. Packages never import an app for
      // the same reason.
      if (workspace.kind === "app" && dependency.kind === "app") {
        report(
          file,
          specifier,
          "app-to-app-import",
          `${workspace.name} may not import the ${dependency.name} app`
        )
      } else if (workspace.kind === "package" && dependency.kind === "app") {
        report(
          file,
          specifier,
          "package-app-import",
          `${workspace.name} may not import the ${dependency.name} app`
        )
      }

      if (!workspace.dependencyNames.has(packageName)) {
        report(
          file,
          specifier,
          "undeclared-workspace-dependency",
          `${workspace.name} must declare ${packageName} in package.json`
        )
      }

      checkDbOwnership(workspace, packageName, file, specifier)
      checkMonolithDatabase(workspace, file, specifier)
    }
  }
}

if (errors.length > 0) {
  console.error(`Boundary check failed (${errors.length}):`)
  for (const error of errors) console.error(`  ${error}`)
  process.exit(1)
}

console.log(
  `Boundary check passed: ${workspaces.length} workspaces, ${workspaces.reduce(
    (count, workspace) => count + walk(workspace.dir).length,
    0
  )} source files.`
)
