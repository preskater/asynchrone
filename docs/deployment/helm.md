# Deploying Asynchrone Space with Helm

Asynchrone Space runs as nine Next.js apps: the stateless public landing site,
Copilot (the customer app and identity/OAuth server), the projects, calendars,
files, messages, clients and employees domain apps and the control tower. Copilot
owns customer identity; every other app is an OIDC relying party with a host-only
session. Until #190/#171 the domain apps connect to the same PostgreSQL database
as Copilot. This guide installs all of them from the umbrella chart in
`charts/asynchrone-space`.

```
charts/
  asynchrone-space-app/             # one generic app chart: Deployment, Service,
                                    # Ingress, ConfigMap, Secret ref, PDB, HPA,
                                    # NetworkPolicy, CronJobs, helm test
  asynchrone-space/                 # umbrella: 9 dependency aliases, migrate Job,
                                    # wildcard Certificates, production values
```

The umbrella depends on `asynchrone-space-app` once per app through a Helm
dependency alias (`landing`, `copilot`, `projects`, `calendars`, `files`,
`messages`, `clients`, `employees`, `control-tower`). Each alias sets its own
`nameOverride`, image, host, TLS secret, config and cron jobs, so resources stay
`asynchrone-space-<app>-*`.

Secrets, network policy, backups, restore order and the connection budget are
covered in [Database operations](database-operations.md).

## Prerequisites

- Kubernetes 1.27+ with an ingress controller. The values default to the
  `nginx` ingress class.
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

`.github/workflows/docker.yml` publishes ten images for every push to `main` and
every `v*` tag. Every row uses the same `Dockerfile`; the `runner` stage builds
one Next.js app, the `migrate` stage ships the Prisma migration Job.

| Image                                                | Stage / build arg                    | Purpose                                                        |
| ---------------------------------------------------- | ------------------------------------ | -------------------------------------------------------------- |
| `ghcr.io/preskater/asynchrone-space-copilot`         | `runner`, `APP=copilot`              | Copilot, identity and OAuth (`copilot.asynchrone.space`)       |
| `ghcr.io/preskater/asynchrone-space-projects`        | `runner`, `APP=projects`             | Projects (`projects.copilot.asynchrone.space`)                 |
| `ghcr.io/preskater/asynchrone-space-calendars`       | `runner`, `APP=calendars`            | Calendars and meetings (`calendars.copilot.asynchrone.space`)  |
| `ghcr.io/preskater/asynchrone-space-files`           | `runner`, `APP=files`                | Files (`files.copilot.asynchrone.space`)                       |
| `ghcr.io/preskater/asynchrone-space-messages`        | `runner`, `APP=messages`             | Messages (`messages.copilot.asynchrone.space`)                 |
| `ghcr.io/preskater/asynchrone-space-clients`         | `runner`, `APP=clients`              | Clients, the CRM (`clients.copilot.asynchrone.space`)          |
| `ghcr.io/preskater/asynchrone-space-employees`       | `runner`, `APP=employees`            | Employees, the HR app (`employees.copilot.asynchrone.space`)   |
| `ghcr.io/preskater/asynchrone-space-control-tower`   | `runner`, `APP=control-tower`        | Control tower (`control-tower.asynchrone.space`)               |
| `ghcr.io/preskater/asynchrone-space-landing`         | `runner`, `APP=landing`              | Public site (`asynchrone.space`)                               |
| `ghcr.io/preskater/asynchrone-space-migrate`         | `migrate`, `turbo prune @workspace/migrate` | One-shot monolith + per-app Prisma migrations           |

The workflow tags images with the branch, the release tag and `sha-<shortsha>`.
Use the immutable `sha-` tag:

```bash
helm upgrade --install asynchrone-space charts/asynchrone-space -n asynchrone-space \
  --set global.imageTag=sha-abc1234
```

`global.imageTag` is required; the chart fails to render without it. A per-app
`image.tag` overrides it if one app must roll separately.

## Create the secrets

The chart references existing Secrets and never renders secret values. Create
them before installing; the pods fail fast if a required key is missing.

### Copilot and the migrate Job

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
```

Copilot reads `DATABASE_URL`; the per-app `*_DATABASE_URL` keys are consumed by
the migrate Job. Keep `BETTER_AUTH_SECRET` stable: it encrypts the JWKS rows in
the database. If it is rotated, clear the `jwks` table so new keys are generated.

Add optional keys to `asynchrone-space-copilot-secrets` as needed:

| Key                     | Used by                                                     |
| ----------------------- | ----------------------------------------------------------- |
| `OPENAI_API_KEY`        | Assistant                                                   |
| `RESEND_API_KEY`        | Verification and password-reset email                       |
| `GITHUB_CLIENT_SECRET`  | GitHub OAuth account linking                                |
| `GITLAB_CLIENT_SECRET`  | GitLab OAuth account linking                                |
| `TURNSTILE_SECRET_KEY`  | Cloudflare Turnstile on sign-up and password reset          |
| `STRIPE_SECRET_KEY`     | Billing: Checkout and the Customer Portal                   |
| `STRIPE_WEBHOOK_SECRET` | Billing: signing secret of `/api/webhooks/stripe`           |
| `SENTRY_DSN`            | Server-side error tracking and request timings              |

Register the OAuth callbacks on the GitHub and GitLab apps:

- GitHub: `https://copilot.asynchrone.space/api/auth/callback/github`
- GitLab: `https://copilot.asynchrone.space/api/auth/callback/gitlab`

Set `copilot.config.GITHUB_CLIENT_ID` / `copilot.config.GITLAB_CLIENT_ID` in
values and the matching secrets above. `TURNSTILE_SECRET_KEY` must be set
together with `copilot.config.TURNSTILE_SITE_KEY`; `STRIPE_WEBHOOK_SECRET`
requires `STRIPE_SECRET_KEY`. The app refuses to boot on a half-configured pair.

### Domain apps

Each domain app has its own Secret. Its `DATABASE_URL` is the same database
Copilot uses until #190/#171 (the domain packages still read identity rows), and
it carries the provisioned OAuth client pair. Generate the pairs with
`npm run oauth:clients --workspace=copilot -- --apply --write-env apps/copilot/.env.oauth`.

```bash
for app in projects calendars files messages clients employees; do
  PREFIX=$(echo "$app" | tr a-z A-Z)
  EXTRA=()
  # The projects app owns repository-sync since #168.
  if [ "$app" = "projects" ]; then EXTRA+=(--from-literal=CRON_SECRET='<random-token>'); fi
  # The files app owns uploads-sweep.
  if [ "$app" = "files" ]; then EXTRA+=(--from-literal=CRON_SECRET='<random-token>'); fi

  kubectl -n asynchrone-space create secret generic "asynchrone-space-${app}-secrets" \
    --from-literal=DATABASE_URL='postgresql://user:pass@db:5432/asynchrone-space?schema=public' \
    --from-literal="${PREFIX}_OAUTH_CLIENT_ID=$(grep ^${PREFIX}_OAUTH_CLIENT_ID= apps/copilot/.env.oauth | cut -d= -f2-)" \
    --from-literal="${PREFIX}_OAUTH_CLIENT_SECRET=$(grep ^${PREFIX}_OAUTH_CLIENT_SECRET= apps/copilot/.env.oauth | cut -d= -f2-)" \
    "${EXTRA[@]}"
done
```

Registered redirect URIs (all on the domain wildcard):

| App       | Redirect URI                                                     |
| --------- | ---------------------------------------------------------------- |
| projects  | `https://projects.copilot.asynchrone.space/api/auth/callback`    |
| calendars | `https://calendars.copilot.asynchrone.space/api/auth/callback`   |
| files     | `https://files.copilot.asynchrone.space/api/auth/callback`       |
| messages  | `https://messages.copilot.asynchrone.space/api/auth/callback`    |
| clients   | `https://clients.copilot.asynchrone.space/api/auth/callback`     |
| employees | `https://employees.copilot.asynchrone.space/api/auth/callback`   |

Every app uses the same `CRON_SECRET` value as Copilot so the CronJob and the
route agree. Only the owner app's Secret needs it.

### Control tower

```bash
kubectl -n asynchrone-space create secret generic asynchrone-space-control-tower-secrets \
  --from-literal=CONTROL_TOWER_DATABASE_URL='postgresql://user:pass@db:5432/asynchrone_control_tower?schema=public' \
  --from-literal=CONTROL_TOWER_BETTER_AUTH_SECRET='<at-least-32-chars>'
```

The control tower reads `CONTROL_TOWER_DATABASE_URL` (never `DATABASE_URL`) so a
copied customer secret cannot point platform sign-in at the identity database.
Run the data cutover described in [../control-tower-database.md](../control-tower-database.md)
before rolling the new image out. Use different `BETTER_AUTH_SECRET` and
`CONTROL_TOWER_BETTER_AUTH_SECRET` values.

Secret values are injected with `envFrom` at pod start, so restart the
Deployments after changing a Secret:

```bash
kubectl -n asynchrone-space rollout restart deploy/asynchrone-space-copilot \
  deploy/asynchrone-space-projects deploy/asynchrone-space-calendars \
  deploy/asynchrone-space-files deploy/asynchrone-space-messages \
  deploy/asynchrone-space-clients deploy/asynchrone-space-employees \
  deploy/asynchrone-space-control-tower deploy/asynchrone-space-landing
```

## Install

The umbrella chart has a local `file://` dependency, so build it first when
installing from a source checkout:

```bash
helm dependency build charts/asynchrone-space

helm upgrade --install asynchrone-space charts/asynchrone-space \
  --namespace asynchrone-space \
  --set global.imageTag=sha-abc1234
```

`helm dependency build` writes `charts/asynchrone-space/charts/asynchrone-space-app-*.tgz`
and `Chart.lock`. The archive **is committed**, so a chart source that clones the
repository (Rancher, Fleet) or a packaged `.tgz` works without a dependency step.
After changing the generic chart, rebuild and commit the archive:

```bash
helm dependency build charts/asynchrone-space
git add charts/asynchrone-space/charts charts/asynchrone-space/Chart.lock
```

CI fails when the vendored archive no longer matches its sources
(`.github/workflows/helm.yml`). `npm run verify:helm` also lints the umbrella,
renders every app alias on its own and renders the generic chart standalone.

## DNS and TLS

Point both wildcard DNS records at the ingress controller's load balancer:

| Record                       | Serves                                              |
| ---------------------------- | --------------------------------------------------- |
| `asynchrone.space`           | landing (apex)                                      |
| `*.asynchrone.space`         | `www`, `copilot`, `control-tower` and future hosts  |
| `*.copilot.asynchrone.space` | projects, calendars, files, messages, clients, employees |

The umbrella renders two cert-manager `Certificate` resources by default:

```yaml
certificates:
  enabled: true
  issuerRef:
    name: letsencrypt-prod
    kind: ClusterIssuer
  entries:
    - name: asynchrone-space-tls
      secretName: asynchrone-space-tls
      dnsNames: [asynchrone.space, "*.asynchrone.space"]
    - name: asynchrone-space-domain-tls
      secretName: asynchrone-space-domain-tls
      dnsNames: ["*.copilot.asynchrone.space"]
```

Every Ingress references the matching Secret: landing, Copilot and the control
tower use `asynchrone-space-tls`; the six domain apps use
`asynchrone-space-domain-tls`. `www.asynchrone.space` is an explicit landing
host with `nginx.ingress.kubernetes.io/from-to-www-redirect: "true"`, so it
redirects to the apex at the edge.

If you provision certificates another way, set `certificates.enabled: false`
and create the two Secrets yourself (or point each `ingress.tls[].secretName`
at your own Secret). The rendered Ingress TLS entries remain in place.

## What gets created

| Resource       | Name                                                                                     | Notes                              |
| -------------- | ---------------------------------------------------------------------------------------- | ---------------------------------- |
| Deployment     | `asynchrone-space-{landing,copilot,projects,calendars,files,messages,clients,employees,control-tower}` | 2 replicas by default |
| Service        | same nine names                                                                          | ClusterIP, port 80 → container 3000 |
| Ingress        | same nine names                                                                          | One host each, wildcard TLS        |
| ConfigMap      | same nine names                                                                          | Non-secret runtime config          |
| Certificate    | `asynchrone-space-tls`, `asynchrone-space-domain-tls`                                    | cert-manager, apex + both wildcards |
| CronJob        | `asynchrone-space-copilot-{trial-expiry,organization-deletion,audit-retention,data-exports}` | Copilot identity jobs          |
| CronJob        | `asynchrone-space-projects-repository-sync`                                              | Hourly repository safety net       |
| CronJob        | `asynchrone-space-files-uploads-sweep`                                                   | Daily large-object sweep           |
| Job (hook)     | `asynchrone-space-migrate`                                                               | Pre-install and pre-upgrade        |
| ServiceAccount | the nine apps plus `asynchrone-space-migrate`                                            | Token automount disabled           |
| PDB            | the nine apps                                                                            | `minAvailable: 1`                  |

No app owns another app's CronJob. The ownership matrix is:

| Job                     | Owner     | Schedule        | Route                             |
| ----------------------- | --------- | --------------- | --------------------------------- |
| `trial-expiry`          | copilot   | `0 6 * * *`     | `/api/cron/trial-expiry`          |
| `organization-deletion` | copilot   | `30 3 * * *`    | `/api/cron/organization-deletion` |
| `audit-retention`       | copilot   | `45 3 * * *`    | `/api/cron/audit-retention`       |
| `data-exports`          | copilot   | `*/15 * * * *`  | `/api/cron/data-exports`          |
| `repository-sync`       | projects  | `0 * * * *`     | `/api/cron/repository-sync`       |
| `uploads-sweep`         | files     | `0 3 * * *`     | `/api/files/uploads/sweep`        |

The repository webhook route (`/api/webhooks/repositories/:id`) stays in Copilot
until #190; only the scheduled reconciliation moved to projects. The portal has
no image and no host: it is part of Copilot (`copilot.asynchrone.space/portal`).

## Configuration

Values live under the alias key in `charts/asynchrone-space/values.yaml`
(`landing`, `copilot`, `projects`, `calendars`, `files`, `messages`, `clients`,
`employees`, `control-tower`). Every app accepts the generic chart values; the
most useful overrides are:

| Value                              | Default                              | Purpose                                |
| ---------------------------------- | ------------------------------------ | -------------------------------------- |
| `global.imageTag`                  | `""` (required)                      | Tag shared by every image              |
| `global.imagePullSecrets`          | `[]`                                 | Pull secrets for private GHCR packages |
| `<app>.replicaCount`               | `2`                                  | Replicas                               |
| `<app>.image.repository`           | per app                              | Image repository                       |
| `<app>.ingress.hosts`              | per app                              | Host(s) and paths                      |
| `<app>.ingress.className`          | `nginx`                              | Ingress controller class               |
| `<app>.ingress.tls`                | wildcard Secret per app              | TLS secret(s) for the hosts            |
| `<app>.config`                     | see values                           | Non-secret environment variables       |
| `<app>.secret.existingSecret`      | per app                              | Secret mounted with `envFrom`          |
| `<app>.networkPolicy.enabled`      | `false`                              | Least-privilege ingress/egress         |
| `<app>.cronjobs.jobs.<job>.enabled`| owner only                           | Toggle the owner's scheduled job       |
| `certificates.enabled`             | `true`                               | Render the two wildcard certificates   |
| `migrate.enabled`                  | `true`                               | Toggle the migration hook              |

### Copilot discovery URLs

`copilot.config` sets:

- `BETTER_AUTH_URL=https://copilot.asynchrone.space`
- `PLATFORM_APP_URL=https://copilot.asynchrone.space`
- `MCP_RESOURCE_URL=https://copilot.asynchrone.space/mcp`

`PLATFORM_APP_URL` also appears on the control tower, where it is the handoff
target. There is no `AUTH_COOKIE_DOMAIN` and no shared customer cookie: each app
keeps a host-only session, and Copilot is the only OAuth issuer.

The per-app internal audience is derived in `@workspace/contracts`
(`urn:asynchrone:app:<key>`), not set as an environment variable. The OAuth
client credentials are read from each app's Secret:

| App           | Client ID / secret keys                         | Internal audience                 |
| ------------- | ----------------------------------------------- | --------------------------------- |
| copilot       | `COPILOT_OAUTH_CLIENT_ID`/`_SECRET`             | `urn:asynchrone:app:copilot`      |
| projects      | `PROJECTS_OAUTH_CLIENT_ID`/`_SECRET`            | `urn:asynchrone:app:projects`     |
| calendars     | `CALENDARS_OAUTH_CLIENT_ID`/`_SECRET`           | `urn:asynchrone:app:calendars`    |
| files         | `FILES_OAUTH_CLIENT_ID`/`_SECRET`               | `urn:asynchrone:app:files`        |
| messages      | `MESSAGES_OAUTH_CLIENT_ID`/`_SECRET`            | `urn:asynchrone:app:messages`     |
| clients       | `CLIENTS_OAUTH_CLIENT_ID`/`_SECRET`             | `urn:asynchrone:app:clients`      |
| employees     | `EMPLOYEES_OAUTH_CLIENT_ID`/`_SECRET`           | `urn:asynchrone:app:employees`    |
| control-tower | `CONTROL_TOWER_OAUTH_CLIENT_ID`/`_SECRET`       | `urn:asynchrone:app:control-tower`|
| landing       | none (stateless)                                | `urn:asynchrone:app:landing`      |

### TLS and proxy limits

The files and Copilot Ingresses set nginx proxy read/send timeouts to 600
seconds and a body size of 8 MiB; messages uses the same body ceiling for
attachment chunks. Uploads are chunked, so a single request stays small, but
downloads stream a PostgreSQL large object and can take a while. Keep the
ingress body limit above the 3 MiB upload chunk.

### Database connections

Each pod opens one pool (`DATABASE_POOL_MAX`, default 10 in the chart). The
fleet-wide budget, per-app values, PgBouncer guidance and the failure drill are
in [Database operations](database-operations.md). In-flight uploads and
downloads hold one connection each; keep the total below 70% of
`max_connections`.

Enable `<app>.networkPolicy.enabled` after setting the ingress and database
namespaces. `/internal/v1/*` is never routed by the Ingress.

### Control tower access

Every platform role requires TOTP. Grant one from a machine with database
access:

```bash
npm run grant:platform-role --workspace=control-tower -- --email you@example.com
```

The operator then enrolls an authenticator at `/setup-2fa`. Set
`control-tower.config.PLATFORM_ALLOWED_IPS` to a comma-separated list of IPv4
addresses/CIDRs (or `*`). The app reads `X-Forwarded-For` and `X-Real-IP`, so
the ingress must preserve the client address. For defense in depth, also add an
edge allowlist:

```yaml
control-tower:
  ingress:
    annotations:
      nginx.ingress.kubernetes.io/whitelist-source-range: "203.0.113.0/24"
```

## Migrations

The `asynchrone-space-migrate` Job is a Helm `pre-install,pre-upgrade` hook with
a lower hook weight than the Deployments. It runs
`cd packages/db && npx prisma migrate deploy` with `DATABASE_URL` from
`asynchrone-space-copilot-secrets`, then the per-app orchestrator. A failed
migration aborts the release before pods roll; the Job is kept for inspection:

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

Trial-expiry runs the daily Team trial reminders and expiry (ADR 0021);
organization-deletion deletes organizations whose 30-day deletion grace period
has passed, including their file large objects (ADR 0024); audit-retention prunes
audit rows past each organization's plan window without touching
`PlatformAuditEvent` (see [audit-log.md](../audit-log.md)); data-exports builds
owner-requested organization exports every 15 minutes and unlinks archives older
than 7 days (ADR 0026); repository-sync reconciles repository connections as a
safety net for missed webhooks; uploads-sweep removes incomplete upload
sessions.

Each CronJob calls the owning app's in-cluster Service with the same
`CRON_SECRET` bearer token, read from that app's Secret. The corresponding route
rejects a missing or incorrect token when `CRON_SECRET` is set.
`concurrencyPolicy: Forbid` prevents overlapping runs. Change schedules through
`<app>.cronjobs.jobs.<job>.schedule`.

## Local compose

`docker compose up --build` starts PostgreSQL, the migration Job and every app:

| Service       | Host port | Host name in production             |
| ------------- | --------- | ----------------------------------- |
| control-tower | 3001      | `control-tower.asynchrone.space`    |
| landing       | 3002      | `asynchrone.space`                  |
| copilot       | 3003      | `copilot.asynchrone.space`          |
| projects      | 3004      | `projects.copilot.asynchrone.space` |
| calendars     | 3005      | `calendars.copilot.asynchrone.space`|
| files         | 3006      | `files.copilot.asynchrone.space`    |
| messages      | 3007      | `messages.copilot.asynchrone.space` |
| clients       | 3008      | `clients.copilot.asynchrone.space`  |
| employees     | 3009      | `employees.copilot.asynchrone.space`|
| postgres      | 5434      | —                                   |

## Observability

Error tracking and request timings go to Sentry (`@sentry/nextjs`, issue #44).
Nothing is sent while `SENTRY_DSN` is empty, so development and CI need no
account.

- **Server**: add `SENTRY_DSN` to `asynchrone-space-copilot-secrets`. Copilot
  reads it at runtime in `apps/copilot/instrumentation.ts`, reports every request
  error through `onRequestError`, and samples 10% of requests for latency.
- **Browser**: the DSN is inlined at build time, so set the `SENTRY_DSN`
  repository variable in GitHub. `docker.yml` passes it as a build arg. The DSN
  is public; it only allows sending events.
- Events use `DEPLOY_ENV` (falling back to `NODE_ENV`) as the environment and
  `GIT_COMMIT_SHA` as the release when they are set.

Recommended alerts: uptime on `GET https://copilot.asynchrone.space/api/health`
every minute, a 5xx-rate alert above 2% over 5 minutes, and a p95 latency alert
above 2 s over 10 minutes.

## Upgrades and rollback

```bash
helm upgrade asynchrone-space charts/asynchrone-space -n asynchrone-space \
  --reuse-values \
  --set global.imageTag=sha-def5678

helm history asynchrone-space -n asynchrone-space
helm rollback asynchrone-space 1 -n asynchrone-space
```

`--reuse-values` keeps earlier overrides but does not merge new chart defaults;
use `-f my-values.yaml` on every upgrade for a durable configuration. A rollback
also re-runs the migration Job, so rollbacks across a schema-changing release
still need a database plan.

## Verify

```bash
npm run verify:helm
helm lint --strict charts/asynchrone-space --set global.imageTag=ci
helm template asynchrone-space charts/asynchrone-space -n asynchrone-space \
  --set global.imageTag=ci > /dev/null
grep -c '^kind: CronJob' <(helm template asynchrone-space charts/asynchrone-space \
  --set global.imageTag=ci)   # 6, one owner each
docker compose config > /dev/null
kubectl -n asynchrone-space get pods,svc,ingress,cronjob,job,certificate
helm test asynchrone-space -n asynchrone-space
kubectl -n asynchrone-space logs deploy/asynchrone-space-copilot --tail=100
```

`npm run verify:helm` renders the umbrella, every app alias on its own and the
generic chart standalone, and asserts the two wildcard certificates, the www
redirect, the Copilot discovery URLs and the six-owner CronJob set.

## Troubleshooting

- **`image.tag or global.imageTag must be set`** — pass
  `--set global.imageTag=sha-…`; the chart intentionally refuses to default to a
  mutable tag.
- **Migration Job fails immediately** — check that the Secret exists and
  contains `DATABASE_URL`; check the Job logs. If Prisma needs a writable path,
  set `migrate.securityContext.readOnlyRootFilesystem=false`.
- **Pods crash with `Invalid environment configuration`** — a required variable
  is missing or malformed. Compare the ConfigMap and Secret with the env table
  in the README.
- **Pods start but the control tower returns 404** — the account has no platform
  role; grant it and enroll TOTP.
- **Client IPs are the ingress address** — configure the controller to preserve
  `X-Forwarded-For` (nginx: `use-forwarded-headers: "true"`).
- **CronJob fails with `secret not found`** — `CRON_SECRET` is missing from the
  owner app's Secret (projects for repository-sync, files for uploads-sweep,
  Copilot for the four identity jobs). The chart mounts it as a required key.
- **Read-only filesystem errors** — Next.js writes its image cache to
  `apps/<app>/.next/cache`, mounted as an `emptyDir`. If a custom runtime path is
  used, override `cache.mountPath` or `securityContext.readOnlyRootFilesystem`.
