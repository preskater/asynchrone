# Public API and CLI

Scripts, CI jobs and the `asynchrone` CLI call `/api/v1` on Copilot with a
personal access token. Copilot checks the token, then forwards the call to the
domain app that owns the data, exactly like an MCP tool (ADR 0042). The
contract is published as OpenAPI 3.1 at `GET /api/v1/openapi.json`.

## Tokens

Create one in **Settings → Developers**. The token is shown once; only its
SHA-256 hash is stored.

- A token belongs to one member and one organization. It can never do more
  than its owner's **current** role: removing the member, banning the user or
  lowering the role takes effect on the next request.
- Every token expires, 1 to 365 days after creation (default 90).
- Any member manages their own tokens; admins and owners see and revoke every
  token of the organization. Creation and revocation are audited
  (`api_token.created`, `api_token.revoked`).
- A control-tower impersonation session cannot create tokens.

| Scope           | Allows                                      |
| --------------- | ------------------------------------------- |
| `projects:read` | `GET /projects` (projects and their labels) |
| `members:read`  | `GET /members`                              |
| `tasks:read`    | `GET /tasks`                                |
| `tasks:write`   | `POST /tasks`, `PATCH /tasks/{id}`          |

`GET /token` needs no scope: any valid token can describe itself.

## Endpoints

All paths are under `/api/v1` and take `Authorization: Bearer asy_…`.
Cookies are ignored.

| Method  | Path                 | Scope           | Notes                                                     |
| ------- | -------------------- | --------------- | --------------------------------------------------------- |
| `GET`   | `/token`             | —               | Owner, organization, scopes and expiry of the token       |
| `GET`   | `/projects`          | `projects:read` |                                                           |
| `GET`   | `/members`           | `members:read`  | `id` is the value for `assigneeId`                        |
| `GET`   | `/tasks?projectId=…` | `tasks:read`    |                                                           |
| `POST`  | `/tasks`             | `tasks:write`   | Returns `201`; `Idempotency-Key` supported                |
| `PATCH` | `/tasks/{taskId}`    | `tasks:write`   | Omitted fields are unchanged; `Idempotency-Key` supported |

Responses are `{ "data": … }`; lists are `{ "data": [ … ], "nextCursor": null }`.
Tasks carry their native key (`AB-123`) and a `url` to the projects app.

```bash
export ASYNCHRONE_TOKEN=asy_…
curl -s https://copilot.asynchrone.space/api/v1/projects \
  -H "Authorization: Bearer $ASYNCHRONE_TOKEN"

curl -s https://copilot.asynchrone.space/api/v1/tasks \
  -H "Authorization: Bearer $ASYNCHRONE_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: ci-build-1234" \
  -d '{"projectId":"<project id>","title":"Build 1234 failed","priority":"high"}'
```

A task created through the API never opens an issue in the project's connected
repository unless the body sets `"createIssue": true`.

### Errors

Errors are `{ "error": { "code", "message", "params", "details" } }`.

| Status | Code                         | Meaning                                            |
| ------ | ---------------------------- | -------------------------------------------------- |
| 401    | `token_invalid`              | Missing, malformed or unknown token                |
| 401    | `token_expired`              | Past its expiry date                               |
| 401    | `token_revoked`              | Revoked, or its owner left the organization        |
| 403    | `token_scope_missing`        | The token lacks the route's scope                  |
| 403    | `upgrade_required`           | The plan has no API access                         |
| 403    | `forbidden`, `role_cannot_…` | The owner's role forbids the action                |
| 404    | `not_found`                  | Unknown id, including another organization's       |
| 422    | `validation_error`           | Invalid body or query (`details` lists the issues) |
| 429    | `rate_limited`               | See `Retry-After`                                  |

### Rate limits

Per token, per minute: Free 60, Team 300, Enterprise 1 200. The window is
shared by every Copilot replica (`rateLimit` table) and fails closed.

### Audit

The domain app records the change as usual, with the token owner as actor. Its
`userAgent` column reads `asynchrone-api (token asy_xxxxxxxx) <client>`, so an
audit reviewer can tell API changes from the UI and find the token.

## CLI

`packages/cli` (`@workspace/cli`, binary `asynchrone`) is a plain HTTP client
for the endpoints above. Build and run it from the repository:

```bash
npm run build --workspace=@workspace/cli
node packages/cli/dist/bin.js --help
```

```bash
asynchrone auth login --token asy_… [--api-url http://localhost:3000]
asynchrone auth status
asynchrone projects list
asynchrone labels list --project "Website Redesign"
asynchrone members list
asynchrone tasks list --project "Website Redesign" --assignee me --status todo
asynchrone tasks create --project "Website Redesign" --title "Fix login" \
  --priority high --label Bug --assignee me --due 2026-12-31 --json
git log -1 --format=%B | asynchrone tasks create --project "Website Redesign" \
  --title "Review last commit" --description-file -
asynchrone tasks update WR-8 --project "Website Redesign" --status done
```

- `--project` takes a project id or its exact name (case-insensitive). Task keys
  are not unique across projects, so `tasks update AB-1` needs `--project`; a
  task id does not.
- `--assignee` takes `me`, a member email (needs `members:read`) or a user id;
  `tasks update --assignee none` and `--due none` clear the field.
- `--json` prints the API payload; `--dry-run` prints the request and sends
  nothing; `--idempotency-key` makes a CI retry safe.

Configuration, first match wins: `--token` / `--api-url`, then
`ASYNCHRONE_TOKEN` / `ASYNCHRONE_API_URL`, then
`$XDG_CONFIG_HOME/asynchrone/config.json` (default `~/.config/…`, written with
mode `0600` by `auth login`). The default server is
`https://copilot.asynchrone.space`.

| Exit code | Meaning                                                                  |
| --------- | ------------------------------------------------------------------------ |
| 0         | Success                                                                  |
| 1         | Other failure (server error, API unreachable)                            |
| 2         | Invalid input (bad option, unknown project, label or task, `422`, `404`) |
| 3         | Authentication (`401`, no token)                                         |
| 4         | Forbidden (`403`: scope, plan or role)                                   |
| 5         | Rate limited (`429`)                                                     |

The package is `private` until it is published under a public npm scope.

## Not in v1

Webhooks and the other modules (#96), browser login for the CLI,
organization-wide service accounts, an owner-configurable maximum lifetime and
keyset pagination.
