# Customer two-factor authentication

Customers turn on TOTP from **Account → Two-factor authentication**. The web app
registers Better Auth's `twoFactor` plugin with its own storage:

| | Customer (web) | Platform staff (control tower) |
|---|---|---|
| Secrets and backup codes | `customerTwoFactor` table | `twoFactor` table |
| Enabled flag | `user.customerTwoFactorEnabled` | `user.twoFactorEnabled` |
| Encryption key | `BETTER_AUTH_SECRET` | `CONTROL_TOWER_BETTER_AUTH_SECRET` |

The two must stay apart: each instance encrypts secrets with its own key
(ADR 0018), so a shared row would be unreadable on the other side and lock the
account out.

## Sign-in

1. The password is checked at `/sign-in`. When the account has 2FA, Better
   Auth drops the new session and sets a 10-minute pending cookie instead.
2. `/two-factor` asks for an authenticator code or a backup code. "Trust this
   device" skips the challenge on that browser for 30 days.

Only email/password sign-in is challenged. GitHub/GitLab sign-in relies on the
provider's own second factor.

Enabling and disabling write an `AuditLog` row (`member.two_factor_enabled` /
`member.two_factor_disabled`) in every organization the user belongs to.

## Organization policy (Team and Enterprise)

Owners and admins can require 2FA for every member under **Settings →
Members**. The same card lists members who have not turned it on (client-portal
accounts are left out: they never reach the workspace).

- The `(app)` layout sends an unenrolled member to `/two-factor/setup` before
  rendering the workspace (`mustEnrollTwoFactor` in
  `lib/organization/two-factor-policy.ts`).
- The setting is stored in `organization.requireTwoFactor`; the
  `requireTwoFactor` entitlement decides whether it is enforced, so a downgrade
  to Free lifts it without rewriting the setting. Turning it off is always
  allowed.
- Impersonating platform staff are let through, since they cannot enroll on the
  user's behalf.
- Every domain app also enforces the `twoFactorRequired` / `twoFactorEnrolled`
  claims from the verified OIDC access token. The app requires enrollment when
  **either** the current policy or the token's claims say so, so a token minted
  before the policy was enabled cannot lower the gate. Impersonation sessions
  are exempt (the claim is ignored when `impersonated` is attested, and the
  workspace resolver exempts the Copilot `impersonatedBy` session).
- Changes write `organization.two_factor_policy.update` to the audit log.
- The gate covers the workspace pages. Server actions, the REST API and MCP
  tokens are not gated by it.

## Lost device and backup codes (support)

A user who still has a backup code signs in with it, then sets 2FA up again.
Without one, support resets 2FA **after verifying the person's identity**
through a channel tied to the account (for example, the organization owner
confirming in writing). Then, against the database:

```sql
BEGIN;
DELETE FROM "customerTwoFactor" WHERE "userId" = '<user id>';
UPDATE "user" SET "customerTwoFactorEnabled" = false WHERE "id" = '<user id>';
DELETE FROM "session" WHERE "userId" = '<user id>';
COMMIT;
```

The user signs in with their password and should turn 2FA back on.
