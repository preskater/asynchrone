# External collaborators

Invite someone outside the workspace to **one project**, with an expiry, without
a seat and without access to anything else. Design: [ADR 0041](adr/0041-project-scoped-external-collaborators.md).

## For owners and admins

Settings → Members → **External collaborators** (needs `member:manage`).

1. **Invite collaborator**: pick the project, the email, the duration (7, 30 or
   90 days) and the access:

   | Capability      | Meaning                        | Default |
   | --------------- | ------------------------------ | ------- |
   | `project:read`  | Open the project               | always  |
   | `task:read`     | See its tasks                  | always  |
   | `task:comment`  | Comment on tasks               | yes     |
   | `task:write`    | Change a task's status         | no      |
   | `message:read`  | Read the project discussion    | no      |
   | `message:write` | Post in the project discussion | no      |

2. The invitation is emailed; the dialog also shows the link once so it can be
   sent another way.
3. **Remove** revokes the grant. Access ends on the guest's next request.

Limits: Free has none, Team allows 5 open invitations or guests per project,
Enterprise is unlimited (`externalCollaborators` in `@workspace/core/plans`).
Guests never count against seats. Someone who is already a member cannot be
invited as a guest.

## For the guest

- The link opens `/guest/accept?token=…`. Sign in, or create an account, with
  the invited email, then accept. No organization or onboarding is needed.
- `/guest` lists every project shared with you; each project page shows a
  banner with the host organization and the end date, and a **Leave project**
  button.
- You see the project's tasks and, depending on the invitation, comment, change
  status and use the project discussion. Your comments carry an **External**
  badge for the team.

## Security rules

- A grant is not a membership: no `member` row, so every workspace route, API,
  search, recents and notification feed refuses the guest as before.
- Copilot re-reads the grant on every request (active, same user, not expired,
  plan still includes guests). Expired equals revoked.
- The projects app only serves `guest-*` operations to a guest context, takes
  the project from the grant and returns 404 for any task outside it. The
  shared domain handler refuses a guest context on every other operation in
  every app.
- Only a SHA-256 hash of the invitation token is stored; acceptance requires the
  signed-in email to match the invited one, and only the first acceptance wins.
- Audit rows in the host organization: `project.guest.invited`, `accepted`,
  `revoked`, `left`.

## Tests

- `apps/copilot/scripts/contracts/guests.contract.test.ts` (`npm run
test:contracts`): invite rules, single acceptance, wrong user, expiry,
  downgrade, revocation, no membership, and the guest/operation matrix over
  every domain operation.
- `packages/service-auth/src/domain.unit.test.ts`: the handler guard.
- `packages/core/src/guests.unit.test.ts`: capability parsing and grant rules.
