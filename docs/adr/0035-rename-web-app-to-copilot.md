# Rename the customer app to Copilot

- Status: accepted
- Deciders: Asynchrone Space maintainers
- Date: 2026-11-01

## Context and Problem Statement

ADR 0028 splits the product into a stateless landing site, a Copilot workspace
shell and domain apps. ADR 0029 makes Copilot the OAuth 2.1/OIDC authorization
server and ADR 0032 gives it `asynchrone_identity`. ADR 0031 already calls it
Copilot in the product and in the contracts registry (`APPS.copilot`,
`COPILOT_APP_URL`, `COPILOT_OAUTH_CLIENT_*`).

The repository still called the app `apps/web` with the workspace package name
`web`. Deployments, Docker build arguments, Helm resources and every runbook
used the old name for an app that is no longer the only web surface and is
about to stop being the only web app. How do we complete the rename without
changing behavior or splitting historical records?

## Decision Drivers

- **One name.** Directory, workspace package, image, chart, Kubernetes
  resources and docs must refer to the same app.
- **No behavior change.** Routes, URLs on the Copilot host, schemas and domain
  packages stay as they are; the domain routes move later (#160).
- **Visible deploys.** The image and chart names are part of the deployment
  contract, so the rename needs an explicit upgrade path.
- **Reversibility.** Rolling back must be possible during the release window.
- **Historical accuracy.** Accepted ADRs and closed issues keep the names they
  used at the time.

## Considered Options

1. Keep `apps/web`, add Copilot naming only in docs and URLs.
2. Rename the workspace to `apps/copilot` and `copilot`, and rename the image,
   chart and Kubernetes resources.
3. Rename the directory but keep the package, image and chart names.

## Decision Outcome

Chosen option: **2 — rename every project-owned identifier, including the
deployment artefacts.**

- `apps/web` becomes `apps/copilot`; the workspace package `web` becomes
  `copilot`, so every task runs with `--workspace=copilot`.
- The Dockerfile keeps one parameterised build with
  `--build-arg APP=copilot|control-tower|landing` and the default becomes
  `copilot`. The image is `ghcr.io/preskater/asynchrone-space-copilot`; the
  migrate image (`asynchrone-space-migrate`) and its hook are unchanged.
- The Helm subchart is `charts/asynchrone-space-copilot`, the deployment,
  service, ConfigMap, CronJobs, ServiceAccount and PDB use
  `asynchrone-space-copilot-*`, and the Secret is
  `asynchrone-space-copilot-secrets`.
- `docker compose` services are `copilot` and `copilot-migrate`; the container
  still listens on 3003.
- `BETTER_AUTH_URL` and `MCP_RESOURCE_URL` point at
  `https://copilot.asynchrone.space`. The app was already the OAuth server; this
  records the origin in values and docs rather than changing code.
- First-party OAuth clients are still declared in
  `apps/copilot/lib/oauth/clients.ts` and provisioned with
  `npm run oauth:clients --workspace=copilot`. Nothing is created by hand.
- The landing keeps `asynchrone.space` and `www`. A small middleware list
  redirects legacy apex auth and portal paths to Copilot without shadowing
  marketing URLs.
- No domain route moves in this change: Copilot keeps them until #160.

### Migration

The rename changes resource names, so an existing release needs a short,
explicit upgrade:

1. Create `asynchrone-space-copilot-secrets` from the values in
   `asynchrone-space-web-secrets` (use the secret manager, not a copied
   manifest with resource metadata).
2. Pull the new `asynchrone-space-copilot` image.
3. `helm dependency build` and `helm upgrade` with a new `global.imageTag`.
4. Delete the old `asynchrone-space-web-*` resources and Secret after the new
   pods are healthy.

The new ADR records the rename; accepted ADRs are not rewritten.

## Consequences

- CI jobs (`ci`, `e2e`, `landing`), `turbo.json`, `package-lock.json`, Docker,
  Helm and every runbook use one name.
- Branch protection keeps the `ci` and `e2e` job names; only their commands
  change (`--workspace=copilot`).
- The image rename is observable: GHCR publishes
  `asynchrone-space-copilot` instead of `asynchrone-space`. The old package can
  stay published for rollbacks but must not receive new tags.
- `check:boundaries` no longer needs the transitional `web` → identity alias;
  Copilot owns `@workspace/db-identity`.
- Historical ADRs, closed issues and release notes may keep `apps/web`; new
  documentation uses Copilot.

## Links

- Issue [#175](https://github.com/preskater/asynchrone-space/issues/175)
- [ADR 0028](0028-split-workspace-into-domain-apps.md)
- [ADR 0029](0029-use-copilot-as-oauth-authorization-server.md)
- [ADR 0031](0031-add-copilot-app-with-persisted-conversations.md)
- [ADR 0032](0032-give-each-app-its-own-database.md)
