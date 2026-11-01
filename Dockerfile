# syntax=docker/dockerfile:1

ARG NODE_VERSION=26.10.0
ARG ALPINE_VERSION=3.24
ARG WORKDIR=/usr/src/asynchrone-space

# ---
FROM node:${NODE_VERSION}-alpine${ALPINE_VERSION} AS base
ARG WORKDIR
# Workspace app to build: `copilot` (customer app), `projects`, `messages`,
# `calendars` and `files` (domain apps), `control-tower` or `landing` (the
# stateless public site).
ARG APP=copilot
WORKDIR ${WORKDIR}
ENV NEXT_TELEMETRY_DISABLED=1

# ---
FROM base AS prepare
COPY . .
RUN npx turbo prune ${APP} --docker

# The migrate image needs every database workspace, not just the Copilot app.
FROM base AS prepare-migrate
ARG WORKDIR
COPY . .
RUN npx turbo prune @workspace/migrate --docker

# ---
FROM base AS builder
ARG WORKDIR
# Install dependencies first (they change less often than source)
COPY --from=prepare ${WORKDIR}/out/json/ .
RUN npm ci
# Build the project
COPY --from=prepare ${WORKDIR}/out/full/ .

# Build-time placeholders. `prisma generate` loads prisma.config.ts, which
# requires DATABASE_URL, and `next build` evaluates auth config. Neither
# connects to the database during the build. Real values are injected at
# runtime (e.g. `docker run -e DATABASE_URL=... -e BETTER_AUTH_SECRET=...`).
ENV DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder
ENV BETTER_AUTH_SECRET=build-placeholder-secret-not-used-at-runtime
ENV BETTER_AUTH_URL=http://localhost:3000
# Required by the control-tower build: its own database (ADR 0032) and secret.
ENV CONTROL_TOWER_DATABASE_URL=postgresql://placeholder:placeholder@localhost:5432/placeholder
ENV CONTROL_TOWER_BETTER_AUTH_SECRET=build-placeholder-control-tower-secret-not-used
ENV PLATFORM_APP_URL=http://localhost:3000
# Required by the projects build: its own origin, Copilot as the OIDC issuer and
# the provisioned client credentials (real values arrive at runtime).
ENV PROJECTS_APP_URL=http://localhost:3004
ENV COPILOT_APP_URL=http://localhost:3000
ENV PROJECTS_OAUTH_CLIENT_ID=build-placeholder-client-id
ENV PROJECTS_OAUTH_CLIENT_SECRET=build-placeholder-client-secret
# Required by the messages/calendars/files builds, same shape as projects
# (#161, #162).
ENV MESSAGES_APP_URL=http://localhost:3007
ENV MESSAGES_OAUTH_CLIENT_ID=build-placeholder-client-id
ENV MESSAGES_OAUTH_CLIENT_SECRET=build-placeholder-client-secret
ENV CALENDARS_APP_URL=http://localhost:3005
ENV CALENDARS_OAUTH_CLIENT_ID=build-placeholder-client-id
ENV CALENDARS_OAUTH_CLIENT_SECRET=build-placeholder-client-secret
ENV FILES_APP_URL=http://localhost:3006
ENV FILES_OAUTH_CLIENT_ID=build-placeholder-client-id
ENV FILES_OAUTH_CLIENT_SECRET=build-placeholder-client-secret
# Public Copilot origin inlined into the landing's browser bundle. Empty keeps
# the production default (https://copilot.asynchrone.space).
ARG NEXT_PUBLIC_WORKSPACE_URL=""
ENV NEXT_PUBLIC_WORKSPACE_URL=${NEXT_PUBLIC_WORKSPACE_URL}
# Public marketing origin used by the landing's canonical URLs, robots.txt and
# sitemap. Empty keeps the production default (https://asynchrone.space).
ARG NEXT_PUBLIC_SITE_URL=""
ENV NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL}
# Public Sentry DSN, inlined into the browser bundle (empty disables Sentry).
# The server reads SENTRY_DSN again at runtime from the deployment secret.
ARG SENTRY_DSN=""
ENV SENTRY_DSN=${SENTRY_DSN}

# Uncomment and pass build args to enable remote caching
# ARG TURBO_TEAM
# ENV TURBO_TEAM=$TURBO_TEAM
# ARG TURBO_TOKEN
# ENV TURBO_TOKEN=$TURBO_TOKEN

RUN npx turbo build

# ---
# Applies pending Prisma migrations, then exits. Runs before `copilot` starts.
# Reuses the pruned dependency install + source from `prepare`. The schema and
# migrations live in `packages/db` (shared with the control tower).
FROM base AS migrate
ARG WORKDIR
COPY --from=prepare-migrate ${WORKDIR}/out/json/ .
RUN npm ci
COPY --from=prepare-migrate ${WORKDIR}/out/full/ .
# The monolith migrations still run until #185 cuts the data over; the
# orchestrator then applies every per-app database in dependency order.
CMD ["sh", "-c", "cd packages/db && npx prisma migrate deploy && cd ../.. && node packages/migrate/src/index.mjs"]

# ---
FROM node:${NODE_VERSION}-alpine AS runner
ARG WORKDIR
ARG APP=copilot
ENV APP=${APP}
WORKDIR ${WORKDIR}
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Don't run production as root for security reasons
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
USER nextjs

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/app/api-reference/config/next-config-js/output
COPY --from=builder --chown=nextjs:nodejs ${WORKDIR}/apps/${APP}/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs ${WORKDIR}/apps/${APP}/.next/static ./apps/${APP}/.next/static
COPY --from=builder --chown=nextjs:nodejs ${WORKDIR}/apps/${APP}/public ./apps/${APP}/public

EXPOSE 3000

CMD ["sh", "-c", "node apps/${APP}/server.js"]
