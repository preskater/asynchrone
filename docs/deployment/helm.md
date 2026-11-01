# Deploying Asynchrone Space with Helm

Asynchrone Space runs as seven Next.js apps today: the stateless public landing
site, Copilot (the customer app and identity/OAuth server), the projects,
calendars, files and messages domain apps and the control tower. Copilot and the
control tower are backed by their own PostgreSQL databases (eight are reserved,
one per app; Copilot owns identity). Until #190/#171 the domain apps connect to
the same database as Copilot. This guide installs all of them from the umbrella
chart in `charts/asynchrone-space`. Secrets, network policy, backups, restore
order and the connection budget are covered in
[Database operations](database-operations.md).

```
charts/
  asynchrone-space/                   # umbrella: dependencies, migration hook, values
  asynchrone-space-landing/           # public site, ingress (asynchrone.space + www redirect)
  asynchrone-space-copilot/           # Copilot: ingress, CronJobs
  asynchrone-space-projects/          # domain app: ingress, host-only OIDC session
  asynchrone-space-calendars/         # domain app: calendars + meetings, host-only OIDC session
  asynchrone-space-files/             # domain app: files + uploads-sweep CronJob
  asynchrone-space-messages/          # domain app: ingress, host-only OIDC session
  asynchrone-space-control-tower/     # internal platform app, ingress
```

## Prerequisites

- A Kubernetes cluster (1.27+) with an ingress controller. The values default
  to the `nginx` ingress class.
- Helm 3.14+ or Helm 4.
- A PostgreSQL database reachable from the cluster.
- `kubectl` access to the target namespace.
- Pull access to the GHCR images. If the packages are private, create an image
  pull secret and pass it through `global.imagePullSecrets`:

  ```bash
  kubectl -n asynchrone-space create secret docker-registry ghcr-pull \
    --docker-server=ghcr.io \
    --docker-username=<github-user> \
    --docker-password=<github-token>
  ```

  Then reference it in values (strings are normalized to `{ name: … }`):

  ```yaml
  global:
    imagePullSecrets:
      - ghcr-pull
  ```

## Images

`.github/workflows/docker.yml` publishes eight images for every push to `main`
and every `v*` tag:

| Image                                                      | Built from                             | Purpose                                       |
| ---------------------------------------------------------- | -------------------------------------- | --------------------------------------------- |
| `ghcr.io/preskater/asynchrone-space-copilot`               | `runner` stage, `APP=copilot`          | Copilot (`copilot.asynchrone.space`)          |
| `ghcr.io/preskater/asynchrone-space-projects`              | `runner` stage, `APP=projects`         | Projects (`projects.copilot.asynchrone.space`)|
| `ghcr.io/preskater/asynchrone-space-calendars`             | `runner` stage, `APP=calendars`        | Calendars and meetings (`calendars.copilot.asynchrone.space`) |
| `ghcr.io/preskater/asynchrone-space-files`                 | `runner` stage, `APP=files`            | Files (`files.copilot.asynchrone.space`)      |
| `ghcr.io/preskater/asynchrone-space-messages`              | `runner` stage, `APP=messages`         | Messages (`messages.copilot.asynchrone.space`)|
| `ghcr.io/preskater/asynchrone-space-control-tower`         | `runner` stage, `APP=control-tower`    | Control tower                                 |
| `ghcr.io/preskater/asynchrone-space-landing`               | `runner` stage, `APP=landing`          | Public site (`asynchrone.space`)              |
| `ghcr.io/preskater/asynchrone-space-migrate`               | `migrate` stage, `turbo prune migrate` | One-shot monolith + per-app Prisma migrations |

The workflow tags images with the branch, the release tag and `sha-<shortsha>`.
Use the immutable `sha-` tag:

```bash
helm upgrade --install asynchrone-space charts/asynchrone-space -n asynchrone-space \
  --set global.imageTag=sha-abc1234
```

`global.imageTag` is required; the chart fails to render without it. A
per-subchart `image.tag` overrides it if the apps must roll separately.

## Create the secrets

The chart references existing Secrets and never renders secret values. Create
them before installing; the migration Job and the pods fail fast if a required
key is missing.

The projects app has its own secret with the provisioned client credentials:

```bash
kubectl -n asynchrone-space create secret generic asynchrone-space-projects-secrets \
  --from-literal=DATABASE_URL='postgresql://user:pass@db:5432/asynchrone-space?schema=public' \
  --from-literal=PROJECTS_OAUTH_CLIENT_ID="$(grep ^PROJECTS_OAUTH_CLIENT_ID= apps/copilot/.env.oauth | cut -d= -f2-)" \
  --from-literal=PROJECTS_OAUTH_CLIENT_SECRET="$(grep ^PROJECTS_OAUTH_CLIENT_SECRET= apps/copilot/.env.oauth | cut -d= -f2-)"
```

`DATABASE_URL` is the same database Copilot uses until #190 (the projects domain
package still reads identity tables). Generate the client credentials with
`npm run oauth:clients --workspace=copilot -- --apply --write-env apps/copilot/.env.oauth`;
its registered redirect URI is
`https://projects.copilot.asynchrone.space/api/auth/callback`.

The calendars and files apps need their own secrets too; the files secret also
carries `CRON_SECRET` because it owns the `uploads-sweep` CronJob:

```bash
kubectl -n asynchrone-space create secret generic asynchrone-space-calendars-secrets \
  --from-literal=DATABASE_URL='postgresql://user:pass@db:5432/asynchrone-space?schema=public' \
  --from-literal=CALENDARS_OAUTH_CLIENT_ID="$(grep ^CALENDARS_OAUTH_CLIENT_ID= apps/copilot/.env.oauth | cut -d= -f2-)" \
  --from-literal=CALENDARS_OAUTH_CLIENT_SECRET="$(grep ^CALENDARS_OAUTH_CLIENT_SECRET= apps/copilot/.env.oauth | cut -d= -f2-)"

kubectl -n asynchrone-space create secret generic asynchrone-space-files-secrets \
  --from-literal=DATABASE_URL='postgresql://user:pass@db:5432/asynchrone-space?schema=public' \
  --from-literal=CRON_SECRET='<random-token>' \
  --from-literal=FILES_OAUTH_CLIENT_ID="$(grep ^FILES_OAUTH_CLIENT_ID= apps/copilot/.env.oauth | cut -d= -f2-)" \
  --from-literal=FILES_OAUTH_CLIENT_SECRET="$(grep ^FILES_OAUTH_CLIENT_SECRET= apps/copilot/.env.oauth | cut -d= -f2-)"
```

Their registered redirect URIs are
`https://calendars.copilot.asynchrone.space/api/auth/callback` and
`https://files.copilot.asynchrone.space/api/auth/callback`. `DATABASE_URL` is the
same database Copilot uses until #190, for the same reason as projects.

The messages app has its own secret the same way:

```bash
kubectl -n asynchrone-space create secret generic asynchrone-space-messages-secrets \
  --from-literal=DATABASE_URL='postgresql://user:pass@db:5432/asynchrone-space?schema=public' \
  --from-literal=MESSAGES_OAUTH_CLIENT_ID="$(grep ^MESSAGES_OAUTH_CLIENT_ID= apps/copilot/.env.oauth | cut -d= -f2-)" \
  --from-literal=MESSAGES_OAUTH_CLIENT_SECRET="$(grep ^MESSAGES_OAUTH_CLIENT_SECRET= apps/copilot/.env.oauth | cut -d= -f2-)"
```

`DATABASE_URL` is the same database Copilot uses until #190/#171 (the messaging
domain still reads the member directory and uses the files upload sessions); its
registered redirect URI is
`https://messages.copilot.asynchrone.space/api/auth/callback`.

```bash
kubectl create namespace asynchrone-space

kubectl -n asynchrone-space create secret generic asynchrone-space-copilot-secrets \
  --from-literal=DATABASE_URL='postgresql://user:pass@db:5432/asynchrone-space?schema=public' \
  --from-literal=IDENTITY_DATABASE_URL='postgresql://user:pass@db:5432/asynchrone_identity?schema=public' \
  --from-literal=PROJECTS_DATABASE_URL='postgresql://user:pass@db:5432/asynchrone_projects?schema=public' \
  --from-literal=CALENDARS_DATABASE_URL='postgresql://user:pass@db:5432/asynchrone_calendars?schema=public' \
  --from-literal=FILES_DATABASE_URL='postgresql://user:pass@db:5432/asynchrone_files?schema=public' \
  --from-literal=MESSAGES_DATABASE_URL='postgresql://user:pass@db:5432/asynchrone_messages?schema=public' \
  --from-literal=CLIENTS_DATABASE_URL='postgresql://user:pass@db:5432/asynchrone_clients?schema=public' \
  --from-literal=EMPLOYEES_DATABASE_URL='postgresql://user:pass@db:5432/asynchrone_employees?schema=public' \
  --from-literal=CONTROL_TOWER_DATABASE_URL='postgresql://user:pass@db:5432/asynchrone_control_tower?schema=public' \
  --from-literal=BETTER_AUTH_SECRET='<at-least-16-chars>' \
  --from-literal=CRON_SECRET='<random-token>'

kubectl -n asynchrone-space create secret generic asynchrone-space-control-tower-secrets \
  --from-literal=CONTROL_TOWER_DATABASE_URL='postgresql://user:pass@db:5432/asynchrone_control_tower?schema=public' \
  --from-literal=CONTROL_TOWER_BETTER_AUTH_SECRET='<at-least-32-chars>'
```

The control tower reads `CONTROL_TOWER_DATABASE_URL` (never `DATABASE_URL`) so a
copied customer secret cannot point platform sign-in at the identity database.
Run the data cutover described in [../control-tower-database.md](../control-tower-database.md)
before rolling the new image out.

Add optional keys to `asynchrone-space-copilot-secrets` as needed:

| Key                     | Used by                                                                          |
| ----------------------- | -------------------------------------------------------------------------------- |
| `OPENAI_API_KEY`        | Assistant                                                                        |
| `RESEND_API_KEY`        | Verification and password-reset email                                            |
| `GITHUB_CLIENT_SECRET`  | GitHub OAuth account linking                                                     |
| `GITLAB_CLIENT_SECRET`  | GitLab OAuth account linking                                                     |
| `TURNSTILE_SECRET_KEY`  | Cloudflare Turnstile on sign-up and password reset                               |
| `STRIPE_SECRET_KEY`     | Billing: Checkout and the Customer Portal                                        |
| `STRIPE_WEBHOOK_SECRET` | Billing: signing secret of `/api/webhooks/stripe`                                |
| `SENTRY_DSN`            | Server-side error tracking and request timings ([Observability](#observability)) |

`TURNSTILE_SECRET_KEY` must be set together with
`asynchrone-space-copilot.config.TURNSTILE_SITE_KEY`, and `STRIPE_WEBHOOK_SECRET`
requires `STRIPE_SECRET_KEY`; the app refuses to boot on a half-configured
pair.

Plan and trial limits need no extra configuration. Billing falls back to the
inline Team price when `asynchrone-space-copilot.config.STRIPE_PRICE_TEAM_MONTHLY` /
`STRIPE_PRICE_TEAM_YEARLY` are empty; see [../billing.md](../billing.md) for the
Stripe endpoint, test-mode procedure and the production checklist.

Use different `BETTER_AUTH_SECRET` and `CONTROL_TOWER_BETTER_AUTH_SECRET`
values. Keep `BETTER_AUTH_SECRET` stable: it encrypts the JWKS rows in the
database. If it is rotated, clear the `jwks` table so new keys are generated.

Secret values are injected with `envFrom` at pod start, so restart the
Deployments after changing a Secret:

```bash
kubectl -n asynchrone-space rollout restart deploy/asynchrone-space-copilot deploy/asynchrone-space-projects deploy/asynchrone-space-messages deploy/asynchrone-space-control-tower deploy/asynchrone-space-landing
```

### Upgrading from the pre-#175 chart

The rename in [ADR 0035](../adr/0035-rename-web-app-to-copilot.md) renamed the
image, the subchart and every Kubernetes resource. An existing release does not
adopt the new names in place: Helm creates the Copilot resources and leaves the
old `asynchrone-space-web-*` ones running against the same database. During a
maintenance window:

1. Create `asynchrone-space-copilot-secrets` from the same values as the old
   `asynchrone-space-web-secrets` (read them from your secret manager; do not
   copy a manifest with `resourceVersion`/`uid`).
2. Install the new chart with a new immutable `global.imageTag`.
3. Check the Copilot pod, sign-in, OAuth metadata and one cron run.
4. Delete the old Deployment/Service/Ingress/ConfigMap/CronJobs/PDB and, once
   no rollback is needed, the old Secret and the old
   `ghcr.io/preskater/asynchrone-space` package.

Rolling back before step 4 is a `helm rollback` plus pointing DNS at the old
Ingress; the database schema did not change.

## Install

The umbrella chart has local `file://` dependencies, so build them first when
installing from a source checkout:

```bash
helm dependency build charts/asynchrone-space

helm upgrade --install asynchrone-space charts/asynchrone-space \
  --namespace asynchrone-space \
  --set global.imageTag=sha-abc1234
```

`helm dependency build` writes packaged copies to `charts/asynchrone-space/charts/`
and creates `Chart.lock`. Those archives **are committed**, so a chart source
that clones the repository (Rancher, Fleet) or a packaged `.tgz` works without
running a dependency step first. After changing any subchart, rebuild and
commit the archives:

```bash
helm dependency build charts/asynchrone-space
git add charts/asynchrone-space/charts
```

CI fails when a vendored archive no longer matches its subchart sources
(`.github/workflows/helm.yml`, "Check vendored subcharts are up to date").

Use `-f my-values.yaml` for production overrides instead of long `--set`
lists. The defaults target `asynchrone.space` (landing, with
`www.asynchrone.space` redirected to the apex by the ingress annotation),
`copilot.asynchrone.space` (Copilot), `projects.copilot.asynchrone.space`,
`calendars.copilot.asynchrone.space`, `files.copilot.asynchrone.space`,
`messages.copilot.asynchrone.space` and `control-tower.asynchrone.space`, with
the `nginx` ingress class.

Only the landing host is indexable: it serves `robots.txt` and a localized
`sitemap.xml`. Copilot answers `robots.txt` with `Disallow: /` and sends
`X-Robots-Tag: noindex, nofollow` on every response (the control tower does the
same). Old apex workspace URLs (`/sign-in`, `/portal`, `/settings`,
`/<orgSlug>/search`, …) are redirected to Copilot inside the landing app with a
308 that preserves the locale and query string; no ingress rule is needed.

## What gets created

| Resource       | Name                                                                                 | Notes                               |
| -------------- | ------------------------------------------------------------------------------------ | ----------------------------------- |
| Deployment     | `asynchrone-space-landing`                                                           | 2 replicas by default               |
| Deployment     | `asynchrone-space-copilot`                                                               | 2 replicas by default               |
| Deployment     | `asynchrone-space-projects`                                                              | 2 replicas by default               |
| Deployment     | `asynchrone-space-calendars`                                                             | 2 replicas by default               |
| Deployment     | `asynchrone-space-files`                                                                 | 2 replicas by default               |
| Deployment     | `asynchrone-space-messages`                                                              | 2 replicas by default               |
| Deployment     | `asynchrone-space-control-tower`                                                     | 2 replicas by default               |
| Service        | `asynchrone-space-{landing,copilot,projects,calendars,files,messages,control-tower}`     | ClusterIP, port 80 → container 3000 |
| Ingress        | `asynchrone-space-{landing,copilot,projects,calendars,files,messages,control-tower}`     | One host each                       |
| ConfigMap      | `asynchrone-space-{copilot,projects,calendars,files,messages,control-tower}`             | Non-secret runtime config           |
| CronJob        | `asynchrone-space-files-uploads-sweep`                                                   | `0 3 * * *` (moved here in #161)    |
| CronJob        | `asynchrone-space-copilot-repository-sync`                                               | `0 * * * *`                         |
| CronJob        | `asynchrone-space-copilot-trial-expiry`                                                  | `0 6 * * *`                         |
| CronJob        | `asynchrone-space-copilot-organization-deletion`                                         | `30 3 * * *`                        |
| CronJob        | `asynchrone-space-copilot-audit-retention`                                               | `45 3 * * *`                        |
| CronJob        | `asynchrone-space-copilot-data-exports`                                                  | `*/15 * * * *`                      |
| Job (hook)     | `asynchrone-space-migrate`                                                           | Pre-install and pre-upgrade         |
| ServiceAccount | `asynchrone-space-{copilot,projects,calendars,files,control-tower}`, `asynchrone-space-migrate` | Token automount disabled |
| PDB            | `asynchrone-space-{copilot,projects,calendars,files,control-tower}`                      | `minAvailable: 1`                   |

## Configuration

Values live under `asynchrone-space-{copilot,projects,calendars,files,control-tower}`
in `charts/asynchrone-space/values.yaml`. The most useful overrides:

| Value                                          | Default                          | Purpose                                |
| ---------------------------------------------- | -------------------------------- | -------------------------------------- |
| `global.imageTag`                              | `""` (required)                  | Tag shared by all three images         |
| `global.imagePullSecrets`                      | `[]`                             | Pull secrets for private GHCR packages |
| `asynchrone-space-copilot.replicaCount`            | `2`                              | Copilot replicas                      |
| `asynchrone-space-control-tower.replicaCount`  | `2`                              | Control tower replicas                 |
| `asynchrone-space-copilot.ingress.hosts`           | `copilot.asynchrone.space`       | Copilot host(s)                       |
| `asynchrone-space-control-tower.ingress.hosts` | `control-tower.asynchrone.space` | Control tower host(s)                  |
| `*.ingress.className`                          | `nginx`                          | Ingress controller class               |
| `*.ingress.tls`                                | `[]`                             | TLS secret(s) for the hosts            |
| `*.config`                                     | see values                       | Non-secret environment variables       |
| `*.networkPolicy.enabled`                      | `false`                          | Enable least-privilege ingress/egress  |
| `asynchrone-space-copilot.cronjobs.*.enabled`      | `true`                           | Toggle each identity scheduled job     |
| `asynchrone-space-files.cronjobs.uploadsSweep`     | `true`, `0 3 * * *`              | Upload-sweep job (files app)           |
| `migrate.enabled`                              | `true`                           | Toggle the migration hook              |

`BETTER_AUTH_URL`, `MCP_RESOURCE_URL`, `PLATFORM_APP_URL`,
`NEXT_PUBLIC_APP_URL` and `CONTROL_TOWER_URL` must match the public URLs served
by the ingress. Copilot uses `CONTROL_TOWER_URL` for "Stop impersonating"; the
control tower uses `PLATFORM_APP_URL` for impersonation handoff links.

`asynchrone-space-copilot.config.TRUSTED_IP_HEADERS` (default
`x-real-ip,x-forwarded-for`) lists the headers Better Auth trusts for the
per-IP auth rate limits. They are only trustworthy because ingress-nginx
overwrites them: never expose the Copilot pods without the ingress (no
`port-forward`, no direct `Service` URL) in production.

### TLS and DNS

Point both hostnames at the ingress controller's load balancer, then configure
certificates either through cert-manager annotations:

```yaml
asynchrone-space-copilot:
  ingress:
    annotations:
      cert-manager.io/cluster-issuer: letsencrypt-prod
    tls:
      - secretName: asynchrone-space-tls
        hosts:
          - asynchrone.space
```

or by creating the TLS Secrets yourself. Repeat for
`asynchrone-space-control-tower`.

### Uploads and proxy limits

The files subchart sets nginx proxy read/send timeouts to 600 seconds and a body
size of 8 MiB (Copilot keeps the same limits for its portal and message
attachments). Uploads are chunked, so a single request stays small, but downloads
stream a PostgreSQL large object and can take a while. Increase the timeouts if
your files are very large, and keep the ingress body limit above the 3 MiB
upload chunk.

### Database connections

Each pod opens one pool (`DATABASE_POOL_MAX`, default 10 in the chart). The
fleet-wide budget, per-app values, PgBouncer guidance and the failure drill are
in [Database operations](database-operations.md). In-flight uploads and
downloads hold one connection each; keep the total below 70% of
`max_connections`.

Enable `asynchrone-space-copilot.networkPolicy.enabled` and
`asynchrone-space-control-tower.networkPolicy.enabled` after setting the ingress
and database namespaces. `/internal/v1/*` is never routed by the Ingress.

### Control tower access

Every platform role requires TOTP. Grant one from a machine with database
access:

```bash
npm run grant:platform-role --workspace=control-tower -- --email you@example.com
```

The operator then enrolls an authenticator at `/setup-2fa`. Set
`PLATFORM_ALLOWED_IPS` in `asynchrone-space-control-tower.config` to a comma-separated list
of IPv4 addresses/CIDRs (or `*`). The app reads `X-Forwarded-For` and
`X-Real-IP`, so the ingress must be configured to preserve the client address.
For defense in depth, also add an edge allowlist:

```yaml
asynchrone-space-control-tower:
  ingress:
    annotations:
      nginx.ingress.kubernetes.io/whitelist-source-range: "203.0.113.0/24"
```

## Migrations

The `asynchrone-space-migrate` Job is a Helm `pre-install,pre-upgrade` hook with a lower
hook weight than the Deployments. It runs `cd packages/db && npx prisma migrate
deploy` with `DATABASE_URL` from `asynchrone-space-copilot-secrets`. A failed migration aborts
the release before pods roll; the Job is kept for inspection:

```bash
kubectl -n asynchrone-space logs job/asynchrone-space-migrate
```

The previous hook Job is deleted before the next install/upgrade. To apply
migrations manually (for example when recovering a cluster):

```bash
kubectl -n asynchrone-space create job asynchrone-space-migrate-manual \
  --image=ghcr.io/preskater/asynchrone-space-migrate:sha-abc1234
```

The migrate image runs as a non-root user with a read-only root filesystem and
`HOME=/tmp`. If a future Prisma release needs to write elsewhere, override
`migrate.podSecurityContext` / `migrate.securityContext` in a values file.

## Scheduled jobs

The uploads-sweep and repository-sync CronJobs replace the former Vercel crons;
trial-expiry runs the daily Team trial reminders and expiry (ADR 0021);
organization-deletion deletes organizations whose 30-day deletion grace period
has passed, including their file large objects
([ADR 0024](../adr/0024-delete-organizations-after-a-grace-period.md));
audit-retention prunes audit rows past each organization's plan window without
touching `PlatformAuditEvent` (see [audit-log.md](../audit-log.md)); and
data-exports builds owner-requested organization exports every 15 minutes and
unlinks archives older than 7 days
([ADR 0026](../adr/0026-export-organization-data-asynchronously.md)). They
call the in-cluster Service and send the same `CRON_SECRET` bearer token read
from `asynchrone-space-copilot-secrets`; the corresponding route rejects a missing
or incorrect token when `CRON_SECRET` is set. `concurrencyPolicy: Forbid`
prevents overlapping runs. Change schedules through
`asynchrone-space-copilot.cronjobs.<job>.schedule`.

## Observability

Error tracking and request timings go to Sentry (`@sentry/nextjs`, issue #44).
Nothing is sent while `SENTRY_DSN` is empty, so development and CI need no
account.

- **Server**: add `SENTRY_DSN` to `asynchrone-space-copilot-secrets`. Copilot
  reads it at runtime in `apps/copilot/instrumentation.ts`, reports every request
  error through `onRequestError`, and samples 10 % of requests for latency.
- **Browser**: the DSN is inlined at build time, so set the `SENTRY_DSN`
  repository variable in GitHub (Settings → Secrets and variables → Actions →
  Variables). `docker.yml` passes it as a build arg. The DSN is public; it
  only allows sending events.
- Events use `DEPLOY_ENV` (falling back to `NODE_ENV`) as the environment and
  `GIT_COMMIT_SHA` as the release when they are set.

Configure monitoring in Sentry once events arrive:

1. **Uptime**: an uptime monitor on `GET https://<copilot-host>/api/health` every
   minute. The route returns 200 when the database answers and 503 otherwise,
   so it catches both a down pod and a lost database.
2. **5xx rate**: a metric alert on the failure rate of
   `transaction.op:http.server` transactions (for example above 2 % over 5
   minutes).
3. **p95 latency**: a metric alert on `p95(transaction.duration)` for the same
   transactions (for example above 2 s over 10 minutes).

The Content-Security-Policy is report-only and limits `connect-src` to
`'self'`, so browser events to Sentry show up as CSP reports. Add the Sentry
ingest host to `connect-src` before the policy is enforced.

## Upgrades and rollback

```bash
helm upgrade asynchrone-space charts/asynchrone-space -n asynchrone-space \
  --reuse-values \
  --set global.imageTag=sha-def5678

helm history asynchrone-space -n asynchrone-space
helm rollback asynchrone-space 1 -n asynchrone-space
```

`--reuse-values` keeps earlier overrides but does not merge new chart defaults;
use `-f my-values.yaml` on every upgrade for a durable configuration. A
rollback also re-runs the migration Job, so rollbacks across a schema-changing
release still need a database plan.

## Verify

```bash
helm lint --strict charts/asynchrone-space --set global.imageTag=ci
helm template asynchrone-space charts/asynchrone-space -n asynchrone-space --set global.imageTag=ci
kubectl -n asynchrone-space get pods,svc,ingress,cronjob,job
helm test asynchrone-space -n asynchrone-space
kubectl -n asynchrone-space logs deploy/asynchrone-space-copilot --tail=100
```

`helm test` runs the per-subchart connection Pods against each Service.

## Troubleshooting

- **`image.tag or global.imageTag must be set`** — pass `--set
global.imageTag=sha-…`; the chart intentionally refuses to default to a
  mutable tag.
- **Migration Job fails immediately** — check that the Secret exists and
  contains `DATABASE_URL`; check the Job logs. If Prisma needs a writable path,
  set `migrate.securityContext.readOnlyRootFilesystem=false`.
- **Pods crash with `Invalid environment configuration`** — a required
  variable is missing or malformed. Compare the ConfigMap and Secret with the
  env table in the README.
- **Pods start but the control tower returns 404** — the account has no platform
  role; grant it and enroll TOTP.
- **Client IPs are the ingress address** — configure the controller to preserve
  `X-Forwarded-For` (nginx: `use-forwarded-headers: "true"`).
- **CronJob fails with `secret not found`** — `CRON_SECRET` is missing from
  `asynchrone-space-copilot-secrets`; the chart mounts it as a required key.
- **Read-only filesystem errors** — Next.js writes its image cache to
  `apps/<app>/.next/cache`, mounted as an `emptyDir`. If a custom runtime path
  is used, override `cache.mountPath` or
  `securityContext.readOnlyRootFilesystem`.
