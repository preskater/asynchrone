import fs from "node:fs"
import path from "node:path"

/**
 * The landing is stateless marketing: no auth, no database, no session and no
 * workspace shell. These checks run in `verify:stateless` (CI) and in the unit
 * tests, so a future import cannot quietly pull the workspace back in.
 */
export const FORBIDDEN_MODULES = [
  "@workspace/auth",
  "@workspace/db",
  "@workspace/oidc",
  "@workspace/service-auth",
  "@workspace/sagas",
  "@workspace/app-shell",
  "better-auth",
  "prisma",
  "pg",
]

const FORBIDDEN_MODULE_PREFIXES = [
  "@workspace/db-",
  "@prisma/",
  "@better-auth/",
]

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs"])

const SKIPPED_DIRECTORIES = new Set([
  "node_modules",
  ".next",
  "public",
  ".turbo",
])

/** Every source file that can end up in the landing bundle or server. */
export function landingSourceFiles(root: string): string[] {
  const files: string[] = []

  const walk = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!SKIPPED_DIRECTORIES.has(entry.name)) {
          walk(path.join(directory, entry.name))
        }
        continue
      }
      if (SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
        files.push(path.join(directory, entry.name))
      }
    }
  }

  walk(root)
  return files
}

/** Import specifiers used by a source file (`from`, dynamic `import()`, `require`). */
export function importSpecifiers(source: string): string[] {
  const pattern = /(?:from\s*|import\s*\(\s*|require\s*\(\s*)["']([^"']+)["']/g
  return [...source.matchAll(pattern)].map((match) => match[1]!)
}

function isForbiddenModule(specifier: string) {
  return (
    FORBIDDEN_MODULES.includes(specifier) ||
    FORBIDDEN_MODULE_PREFIXES.some((prefix) => specifier.startsWith(prefix))
  )
}

export function isForbiddenPackageName(name: string) {
  return isForbiddenModule(name)
}

/** Forbidden runtime imports in the landing source tree. */
export function forbiddenImports(root: string): string[] {
  const violations: string[] = []

  for (const file of landingSourceFiles(root)) {
    // Unit tests carry forbidden names as fixtures; they are never bundled.
    if (file.endsWith(".unit.test.ts")) continue
    const source = fs.readFileSync(file, "utf8")
    for (const specifier of importSpecifiers(source)) {
      if (isForbiddenModule(specifier)) {
        violations.push(`${path.relative(root, file)} imports ${specifier}`)
      }
    }
  }

  return violations
}

/** Cookie access that no landing file may use (the landing sets no session). */
export function sessionApiViolations(root: string): string[] {
  const violations: string[] = []

  for (const file of landingSourceFiles(root)) {
    // Unit tests carry forbidden names as fixtures; they are never bundled.
    if (file.endsWith(".unit.test.ts")) continue
    // This module names the APIs it forbids, so it is not a violation itself.
    if (path.basename(file) === "stateless.ts") continue

    const source = fs.readFileSync(file, "utf8")
    // `headers()` is fine (the global not-found reads `accept-language`);
    // reading or writing a cookie is not.
    if (/\bcookies\s*\(/.test(source)) {
      violations.push(`${path.relative(root, file)} calls cookies()`)
    }
  }

  return violations
}

/** Forbidden dependencies in `package.json` (runtime and dev). */
export function forbiddenDependencies(manifest: {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}): string[] {
  return Object.keys({
    ...manifest.dependencies,
    ...manifest.devDependencies,
  }).filter(isForbiddenPackageName)
}

/** All stateless violations, as human-readable messages. */
export function findStatelessViolations(root: string): string[] {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(root, "package.json"), "utf8")
  ) as Parameters<typeof forbiddenDependencies>[0]

  return [
    ...forbiddenDependencies(manifest).map(
      (name) => `package.json depends on ${name}`
    ),
    ...forbiddenImports(root),
    ...sessionApiViolations(root),
  ]
}
