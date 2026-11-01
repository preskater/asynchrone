/**
 * Sign-up abuse controls applied to every new user, whatever the sign-up path
 * (email/password or GitHub/GitLab OAuth). See `databaseHooks` in `auth.ts`.
 */

// ponytail: a short list of the most abused throwaway providers, not an
// exhaustive one. Extend it with SIGNUP_BLOCKED_EMAIL_DOMAINS, or swap in a
// maintained list (e.g. the `disposable-email-domains` package) if abuse grows.
const DISPOSABLE_DOMAINS = new Set([
  "10minutemail.com",
  "dispostable.com",
  "getnada.com",
  "guerrillamail.com",
  "maildrop.cc",
  "mailinator.com",
  "mailnesia.com",
  "mintemail.com",
  "mohmal.com",
  "sharklasers.com",
  "temp-mail.org",
  "tempmail.com",
  "throwawaymail.com",
  "trashmail.com",
  "yopmail.com",
])

function emailDomain(email: string): string {
  return email
    .slice(email.lastIndexOf("@") + 1)
    .trim()
    .toLowerCase()
}

/** True when the address, or any parent domain of it, is blocked. */
export function isBlockedEmailDomain(
  email: string,
  extra: string | undefined = process.env.SIGNUP_BLOCKED_EMAIL_DOMAINS
): boolean {
  const blocked = new Set(DISPOSABLE_DOMAINS)
  for (const domain of extra?.split(",") ?? []) {
    if (domain.trim()) blocked.add(domain.trim().toLowerCase())
  }
  const labels = emailDomain(email).split(".")
  return labels.some((_, i) => blocked.has(labels.slice(i).join(".")))
}

export function isInviteOnly(): boolean {
  return process.env.SIGNUP_INVITE_ONLY === "true"
}
