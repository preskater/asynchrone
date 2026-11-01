/**
 * Runtime configuration for the messages app.
 *
 * Validated on first import (fail fast). Only this app's own keys live here;
 * the shared client's `DATABASE_URL` is validated by `@workspace/db`.
 *
 * `MESSAGES_OAUTH_CLIENT_*` come from the provisioned client manifest
 * (`npm run oauth:clients --workspace=copilot -- --apply --write-env`); the
 * app cannot sign anyone in without them.
 */
interface Rule {
  key: string
  required?: boolean
  min?: number
  url?: boolean
}

const RULES: Rule[] = [
  { key: "MESSAGES_APP_URL", required: true, url: true },
  { key: "COPILOT_APP_URL", required: true, url: true },
  { key: "MESSAGES_OAUTH_CLIENT_ID", required: true },
  { key: "MESSAGES_OAUTH_CLIENT_SECRET", required: true, min: 16 },
  { key: "NEXT_PUBLIC_APP_URL", url: true },
]

const problems: string[] = []

for (const rule of RULES) {
  const value = process.env[rule.key]
  if (rule.required && (value === undefined || value === "")) {
    problems.push(`${rule.key} is required`)
    continue
  }
  if (value === undefined || value === "") continue
  if (rule.min && value.length < rule.min) {
    problems.push(`${rule.key} must be at least ${rule.min} characters`)
  }
  if (rule.url) {
    try {
      new URL(value)
    } catch {
      problems.push(`${rule.key} must be a valid URL`)
    }
  }
}

if (problems.length > 0) {
  throw new Error(
    `Invalid messages configuration:\n${problems
      .map((problem) => `  - ${problem}`)
      .join("\n")}`
  )
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "")
}

export const env = {
  MESSAGES_APP_URL: trimTrailingSlash(process.env.MESSAGES_APP_URL!),
  COPILOT_APP_URL: trimTrailingSlash(process.env.COPILOT_APP_URL!),
  MESSAGES_OAUTH_CLIENT_ID: process.env.MESSAGES_OAUTH_CLIENT_ID!,
  MESSAGES_OAUTH_CLIENT_SECRET: process.env.MESSAGES_OAUTH_CLIENT_SECRET!,
} as const
