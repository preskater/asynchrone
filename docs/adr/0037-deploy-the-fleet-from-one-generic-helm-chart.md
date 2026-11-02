# 0037. Deploy the app fleet from one generic Helm chart

- Status: accepted
- Date: 2026-11-02
- Deciders: platform
- Issue: #168

## Context

The fleet grew from one customer app to nine apps plus a migration image:
landing, Copilot, six domain apps and the control tower. The first domain apps
(#160-#163) each copied the same Deployment, Service, Ingress, ConfigMap, PDB,
HPA, NetworkPolicy, ServiceAccount and test Pod into a per-app subchart. The
copies drifted, so a fix (a probe, a security context, a CronJob guard) had to
be applied in eight places. DNS/TLS was also per chart: there was no wildcard
certificate and no shared answer for `www`.

## Decision

Keep one generic chart, `charts/asynchrone-space-app`, and instantiate it once
per app from the umbrella `charts/asynchrone-space` with a Helm dependency
alias:

```yaml
dependencies:
  - name: asynchrone-space-app
    alias: copilot
    repository: file://../asynchrone-space-app
    condition: copilot.enabled
```

Every alias supplies `nameOverride`, `image.repository`, `ingress`, `config`,
`secret.existingSecret` and (optionally) `cronjobs.jobs`. Resource names remain
`asynchrone-space-<app>-*`, so existing objects keep their names.

The umbrella owns what is genuinely fleet-wide:

- the pre-install/pre-upgrade `asynchrone-space-migrate` Job;
- two cert-manager `Certificate` resources: `asynchrone-space-tls`
  (`asynchrone.space` + `*.asynchrone.space`) and
  `asynchrone-space-domain-tls` (`*.copilot.asynchrone.space`);
- the nine values blocks and the committed `Chart.lock`/vendored archive.

Each scheduled job has exactly one owner:

| Job | Owner |
| --- | --- |
| `trial-expiry`, `organization-deletion`, `audit-retention`, `data-exports` | Copilot |
| `repository-sync` | projects |
| `uploads-sweep` | files |

The repository webhook route stays in Copilot until #190; only the scheduled
reconciliation moved to the projects app.

## Consequences

- A chart change lands once. `npm run verify:helm` lints the umbrella and
  renders every alias plus the generic chart standalone.
- Per-app overrides move from
  `asynchrone-space-copilot.replicaCount` to `copilot.replicaCount`. The
  generic chart is the only chart source to copy for a new app.
- One archive (`asynchrone-space-app-*.tgz`) is vendored instead of nine, and
  `helm dependency build` still works from a source checkout.
- The CronJob names are unchanged, but the owner app changes for
  `repository-sync`: its `CRON_SECRET` now lives in
  `asynchrone-space-projects-secrets`.
- Two wildcard certificates replace per-host certificates. A manual
  certificate setup sets `certificates.enabled: false` and keeps the rendered
  Ingress TLS references.
