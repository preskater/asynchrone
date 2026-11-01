// Shared by `lib/auth.ts` (server enforcement) and the password forms, so the
// client check and its hint never drift from what the server accepts.
export const MIN_PASSWORD_LENGTH = 12

// Error code of Better Auth's `haveIBeenPwned` plugin.
export const PASSWORD_COMPROMISED = "PASSWORD_COMPROMISED"
