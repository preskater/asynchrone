import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto"

/**
 * Symmetric encryption for repository access tokens.
 *
 * Tokens are encrypted with AES-256-GCM using a key derived from
 * `BETTER_AUTH_SECRET`. The format is `v1:<iv>:<tag>:<ciphertext>` with
 * base64url parts, so the scheme can evolve without losing old values.
 *
 * Rotating `BETTER_AUTH_SECRET` invalidates stored repository tokens: the
 * connection must be re-authenticated with a fresh token (the connection row
 * itself stays; only `decryptSecret` fails).
 */
const VERSION = "v1"

function deriveKey(): Buffer {
  const secret = process.env.BETTER_AUTH_SECRET
  if (!secret) {
    throw new Error(
      "BETTER_AUTH_SECRET is required to encrypt repository credentials."
    )
  }
  return createHash("sha256")
    .update(`asynchrone-space:repository-token:${secret}`)
    .digest()
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", deriveKey(), iv)
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()
  return [
    VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url"),
  ].join(":")
}

export function decryptSecret(value: string): string {
  const [version, iv, tag, data] = value.split(":")
  if (version !== VERSION || !iv || !tag || !data) {
    throw new Error("Unsupported repository token format.")
  }
  const decipher = createDecipheriv(
    "aes-256-gcm",
    deriveKey(),
    Buffer.from(iv, "base64url")
  )
  decipher.setAuthTag(Buffer.from(tag, "base64url"))
  return Buffer.concat([
    decipher.update(Buffer.from(data, "base64url")),
    decipher.final(),
  ]).toString("utf8")
}

/** Random URL-safe secret used for webhook HMACs / GitLab webhook tokens. */
export function generateWebhookSecret(): string {
  return randomBytes(32).toString("base64url")
}
