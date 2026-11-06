# Architecture Decision Records

This directory holds the Architecture Decision Records (ADRs) for Asynchrone Space. Each
record captures one architecturally significant decision together with its
context, the options that were considered, and the consequences.

Records are written with the
[MADR](https://adr.github.io/madr/) template (Markdown Any Decision Records)
from the [architecture-decision-record](https://github.com/architecture-decision-record/architecture-decision-record)
collection.

## Conventions

- One decision per file, named `NNNN-short-title.md` (zero-padded, sequential).
- Status is one of `proposed`, `accepted`, `deprecated`, or `superseded by [ADR-XXXX](XXXX-....md)`.
- Records are immutable: to change a decision, add a new record that supersedes
  the old one rather than editing it. Additive updates are allowed with a dated
  note.
- Exception: product-name references in existing records were rewritten once
  during the rename to Asynchrone Space ([ADR 0020](0020-rename-to-asynchrone-space.md)).
  Those edits changed naming only, never the recorded decisions.

## Index

| ADR                                                                        | Status   | Decision                                                                  |
| -------------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------- |
| [0001](0001-use-monorepo-with-turborepo.md)                                | accepted | Use a monorepo with Turborepo and npm workspaces                          |
| [0002](0002-use-nextjs-app-router.md)                                      | accepted | Use Next.js App Router with React 19                                      |
| [0003](0003-use-postgresql-with-prisma-driver-adapter.md)                  | accepted | Use PostgreSQL with Prisma 7 and the `@prisma/adapter-pg` driver adapter  |
| [0004](0004-use-better-auth-with-organization-plugin.md)                   | accepted | Use Better Auth with the organization plugin for multi-tenant RBAC        |
| [0005](0005-store-files-as-postgresql-large-objects.md)                    | accepted | Store files as PostgreSQL large objects                                   |
| [0006](0006-expose-ai-assistant-over-mcp.md)                               | accepted | Expose the AI assistant over MCP                                          |
| [0007](0007-use-shadcn-ui-with-base-ui.md)                                 | accepted | Use shadcn/ui with Base UI and Tailwind CSS                               |
| [0008](0008-use-next-intl-for-i18n.md)                                     | accepted | Use next-intl for internationalization                                    |
| [0009](0009-ship-standalone-docker-image.md)                               | accepted | Ship a standalone Docker image with a separate migration service          |
| [0010](0010-chunked-upload-protocol.md)                                    | accepted | Use a chunked upload protocol with `UploadSession`                        |
| [0011](0011-authenticate-mcp-with-oauth2.md)                               | accepted | Authenticate the MCP endpoint with OAuth2                                 |
| [0012](0012-extend-clients-into-crm-core.md)                               | accepted | Extend clients into the CRM core (contacts, pipelines, deals, activities) |
| [0013](0013-task-templates-as-form-configurations.md)                      | accepted | Model task templates as form configurations with JSON custom fields       |
| [0014](0014-sync-project-tasks-with-repositories.md)                       | accepted | Sync project tasks with GitHub/GitLab repositories two-way                |
| [0015](0015-per-user-repository-tokens.md)                                 | accepted | Use per-user repository tokens for issue and PR authoring                 |
| [0016](0016-server-actions-as-the-crud-transport.md)                       | accepted | Use server actions as the only CRUD transport                             |
| [0017](0017-client-meeting-requests.md)                                    | accepted | Let clients request meetings that the team books on the calendar          |
| [0018](0018-control-tower-on-shared-database-package.md)                   | accepted | Add a separate control-tower app on a shared `packages/db`                |
| [0019](0019-deploy-on-kubernetes-with-helm.md)                             | accepted | Deploy on Kubernetes with Helm                                            |
| [0020](0020-rename-to-asynchrone-space.md)                                 | accepted | Rename the product to Asynchrone Space                                    |
| [0021](0021-team-trial-without-billing.md)                                 | accepted | Model the Team trial as a time window, not a plan change                  |
| [0022](0022-shared-rate-limits-in-postgres.md)                             | accepted | Share rate limits through PostgreSQL                                      |
| [0023](0023-bill-subscriptions-through-stripe.md)                          | accepted | Bill subscriptions through Stripe with a local plan state                 |
| [0024](0024-delete-organizations-after-a-grace-period.md)                  | accepted | Delete organizations after a 30-day grace period                          |
| [0025](0025-license-under-elastic-license-2.0.md)                          | accepted | License the project under the Elastic License 2.0                         |
| [0026](0026-export-organization-data-asynchronously.md)                    | accepted | Export organization data asynchronously                                   |
| [0027](0027-customer-facing-audit-log.md)                                  | accepted | Expose a customer-facing audit log with filters, export and retention     |
| [0028](0028-split-workspace-into-domain-apps.md)                           | accepted | Split into a landing site, a Copilot shell and domain apps                |
| [0029](0029-use-copilot-as-oauth-authorization-server.md)                  | accepted | Use Copilot as the OAuth 2.1/OIDC authorization server                    |
| [0030](0030-rename-crm-hr-to-clients-employees.md)                         | accepted | Rename CRM and HR to Clients and Employees                                |
| [0031](0031-add-copilot-app-with-persisted-conversations.md)               | accepted | Make Copilot the workspace shell with persisted conversations             |
| [0032](0032-give-each-app-its-own-database.md)                             | accepted | Give each workspace app its own PostgreSQL database                       |
| [0033](0033-keep-audit-export-and-deletion-consistent-across-databases.md) | accepted | Keep audit, export and deletion consistent across databases               |
| [0034](0034-cut-the-control-tower-over-to-its-own-database.md)             | accepted | Cut the control tower over to its own database                            |
| [0035](0035-rename-web-app-to-copilot.md)                                  | accepted | Rename `apps/web` to `apps/copilot` and its deployment artefacts          |
| [0036](0036-use-a-per-domain-app-template.md)                              | accepted | Move the domain apps with one documented template                         |
| [0037](0037-deploy-the-fleet-from-one-generic-helm-chart.md)               | accepted | Deploy the app fleet from one generic Helm chart                          |
| [0038](0038-budget-connections-and-observe-each-app.md)                    | accepted | Budget database connections and observe every app independently           |
| [0039](0039-file-support-tickets-in-the-identity-database.md)              | accepted | File support tickets in the identity database, worked from the control tower |
