const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "postgres"])

const DEFAULT_DEMO_PASSWORD = "asynchrone-demo-password"

type Env = Record<string, string | undefined>

function remoteDatabases(env: Env): string[] {
  return Object.entries(env)
    .filter(([key, url]) => key.endsWith("DATABASE_URL") && url)
    .filter(([, url]) => !LOCAL_HOSTS.has(new URL(url as string).hostname))
    .map(([key]) => key)
}

/**
 * Seeding writes accounts with a known password, so it needs `ALLOW_SEED=true`
 * in production or on any non-local database. A laptop pointed at a production
 * URL has no `NODE_ENV=production`, hence the host check.
 */
export function assertSeedAllowed(env: Env): void {
  if (env.ALLOW_SEED === "true") return
  if (env.NODE_ENV === "production") {
    throw new Error(
      "Refusing to seed: NODE_ENV=production without ALLOW_SEED=true."
    )
  }
  const remote = remoteDatabases(env)
  if (remote.length > 0) {
    throw new Error(
      `Refusing to seed non-local databases without ALLOW_SEED=true: ${remote.join(", ")}`
    )
  }
}

/** The documented password is for local use: shared environments set their own. */
export function demoPassword(env: Env): string {
  if (env.SEED_DEMO_PASSWORD) return env.SEED_DEMO_PASSWORD
  if (env.ALLOW_SEED === "true") {
    throw new Error("ALLOW_SEED=true requires SEED_DEMO_PASSWORD.")
  }
  return DEFAULT_DEMO_PASSWORD
}
