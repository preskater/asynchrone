# First-party OAuth clients

Copilot issues tokens to first-party workspace apps. The client manifest lives in
`apps/copilot/lib/oauth/clients.ts`; the provisioning command is
`apps/copilot/scripts/provision-oauth-clients.ts`.

## Clients

| Client ID                  | Type          | Grants                                                      | Resources                                                    | Service scopes                                                                                                      |
| -------------------------- | ------------- | ----------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `asynchrone-projects`      | web + service | `authorization_code`, `refresh_token`, `client_credentials` | `urn:asynchrone:app:projects`, `urn:asynchrone:app:copilot`  | `internal:identity:read`, `internal:notifications:write`                                                            |
| `asynchrone-calendars`     | web + service | same                                                        | `urn:asynchrone:app:calendars`, `urn:asynchrone:app:copilot` | same                                                                                                                |
| `asynchrone-files`         | web + service | same                                                        | `urn:asynchrone:app:files`, `urn:asynchrone:app:copilot`     | same                                                                                                                |
| `asynchrone-messages`      | web + service | same                                                        | `urn:asynchrone:app:messages`, `urn:asynchrone:app:copilot`  | same                                                                                                                |
| `asynchrone-clients`       | web + service | same                                                        | `urn:asynchrone:app:clients`, `urn:asynchrone:app:copilot`   | same                                                                                                                |
| `asynchrone-employees`     | web + service | same                                                        | `urn:asynchrone:app:employees`, `urn:asynchrone:app:copilot` | same                                                                                                                |
| `asynchrone-copilot`       | service       | `client_credentials`                                        | all six domain audiences                                     | `internal:domain:*`, `internal:audit:read`, `internal:search:read`, `internal:export:read`, `internal:delete:write` |
| `asynchrone-control-tower` | service       | `client_credentials`                                        | `urn:asynchrone:app:copilot`                                 | `internal:identity:read`, `internal:identity:admin`                                                                 |

Every web client is confidential (`client_secret_basic`), skips consent (it is
first-party), enables end-session and registers an exact back-channel logout
URI at `/api/auth/backchannel-logout`. Redirect URI is
`/api/auth/callback`.

Client IDs and secrets use the environment names in
`@workspace/contracts` (`PROJECTS_OAUTH_CLIENT_ID`, `..._SECRET`, etc.).

## Provision

Dry run (safe, no secrets, no DB writes):

```bash
npm run oauth:clients --workspace=copilot
```

Apply with an admin session cookie:

```bash
OAUTH_ADMIN_COOKIE="better-auth.session_token=..." \
BETTER_AUTH_URL="https://copilot.asynchrone.space" \
npm run oauth:clients --workspace=copilot -- --apply --write-env apps/copilot/.env.oauth
```

The script:

1. reads the manifest and existing `oauthClient` rows;
2. creates missing clients through `/api/auth/admin/oauth2/create-client`;
3. patches existing clients through `/api/auth/admin/oauth2/update-client`;
4. links missing resources through
   `/api/auth/admin/oauth2/resources/:identifier/clients/:client_id`;
5. writes `*_OAUTH_CLIENT_ID`/`*_OAUTH_CLIENT_SECRET` to the env file with mode
   `600`.

Without `--write-env`, the one-time secrets are printed to stdout. Never commit
them; `.env*` is gitignored.

## Rotate

```bash
OAUTH_ADMIN_COOKIE="..." BETTER_AUTH_URL="..." \
npm run oauth:clients --workspace=copilot -- --apply --rotate --write-env apps/copilot/.env.oauth
```

Rotation calls `/api/auth/oauth2/client/rotate-secret` for every client. The old
secret is invalidated immediately, so redeploy every app with the new env file.
Existing sessions remain valid until their access token/refresh flow fails; rotate
during a maintenance window if you need all clients to reconnect at once.

## Change the manifest

1. Edit `apps/copilot/lib/oauth/clients.ts`.
2. Run the dry run.
3. Apply to a development environment and inspect the diff.
4. Apply to production during a window.

Removing a client or a resource from the manifest does not delete it
automatically; revoke it deliberately through the admin API so a running app
does not lose access mid-release.

## CI

CI runs the dry run, so a malformed manifest (duplicate client ID, invalid
redirect URI, missing resource) fails before deployment. The apply step needs a
real admin session and is never run in CI.

## Follow-up

- #183 wires each app's `@workspace/oidc` config and Prisma session store.
- #192 restricts the admin endpoints and `/internal/*` at ingress.
