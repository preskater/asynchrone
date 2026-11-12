import { createHash, randomBytes, timingSafeEqual } from "node:crypto"

export {
  API_TOKEN_EXPIRY_PRESETS,
  API_TOKEN_MAX_DAYS,
  API_TOKEN_SCOPES,
  type ApiTokenScope,
} from "./scopes"

const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789"
// asy_<8 lowercase alphanumerics>_<32 random bytes, base64url>
const TOKEN_PATTERN = /^(asy_[a-z0-9]{8})_[A-Za-z0-9_-]{43}$/

export function hashApiToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

/** A fresh token. Only `tokenHash` and `prefix` are ever stored. */
export function generateApiToken() {
  // The id is a public lookup key, not a secret: the modulo bias is harmless.
  const id = Array.from(
    randomBytes(8),
    (byte) => ID_ALPHABET[byte % ID_ALPHABET.length]
  ).join("")
  const prefix = `asy_${id}`
  const token = `${prefix}_${randomBytes(32).toString("base64url")}`
  return { token, prefix, tokenHash: hashApiToken(token) }
}

/** The lookup prefix of a well-formed token, or null. */
export function apiTokenPrefix(token: string): string | null {
  return TOKEN_PATTERN.exec(token)?.[1] ?? null
}

/** Constant-time comparison of a presented token against the stored hash. */
export function apiTokenMatches(token: string, tokenHash: string): boolean {
  const presented = Buffer.from(hashApiToken(token), "hex")
  const stored = Buffer.from(tokenHash, "hex")
  return (
    presented.length === stored.length && timingSafeEqual(presented, stored)
  )
}

/** The bearer value of an `Authorization` header, or null. */
export function bearerToken(header: string | null): string | null {
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header ?? "")
  return match?.[1] ?? null
}
