/** Client-safe constants: the UI imports these without pulling `node:crypto`. */

/** Scopes a personal access token can carry (ADR 0042). No wildcard. */
export const API_TOKEN_SCOPES = [
  "projects:read",
  "members:read",
  "tasks:read",
  "tasks:write",
] as const
export type ApiTokenScope = (typeof API_TOKEN_SCOPES)[number]

export const API_TOKEN_MAX_DAYS = 365
export const API_TOKEN_EXPIRY_PRESETS = [30, 90, 365] as const
