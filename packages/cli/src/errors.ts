/** Exit codes documented in `docs/api.md` (issue #133). */
export const EXIT = {
  ok: 0,
  failure: 1,
  invalidInput: 2,
  auth: 3,
  forbidden: 4,
  rateLimited: 5,
} as const

export class CliError extends Error {
  constructor(
    message: string,
    readonly exitCode: number = EXIT.failure,
    readonly code?: string
  ) {
    super(message)
    this.name = "CliError"
  }
}

/** Maps an HTTP status from the API to the CLI exit code. */
export function exitCodeForStatus(status: number): number {
  if (status === 401) return EXIT.auth
  if (status === 403) return EXIT.forbidden
  if (status === 429) return EXIT.rateLimited
  if (status === 400 || status === 404 || status === 422)
    return EXIT.invalidInput
  return EXIT.failure
}

const HINTS: Record<string, string> = {
  token_invalid: "Check the token, or run `asynchrone auth login --token …`.",
  token_expired: "Create a new token in Settings → Developers.",
  token_revoked: "Create a new token in Settings → Developers.",
  token_scope_missing: "Create a token with the missing scope.",
  rate_limited: "Wait and retry.",
}

export function hintFor(code: string | undefined): string | undefined {
  return code ? HINTS[code] : undefined
}
