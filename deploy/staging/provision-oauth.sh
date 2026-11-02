#!/usr/bin/env bash
# Provision the first-party OAuth clients against the running staging Copilot.
#
# Prerequisites:
#   - create-secrets.sh and db-create.sh have run
#   - the core Helm release is running at https://copilot.staging.asynchrone.space
#
# Better Auth 1.7 marks the admin OAuth endpoints SERVER_ONLY, so the script
# writes the stable first-party clients directly to the identity database with
# the provider's base64url(SHA-256(secret)) storage format. The generated
# client IDs and secrets are written to ~/.config/asynchrone-staging/oauth.env
# (mode 0600). No admin session cookie is needed.
set -euo pipefail

KUBECONFIG="${KUBECONFIG:-$HOME/.kube/staging-ovh.yaml}"
export KUBECONFIG
NS="${NS:-asynchrone-space}"
STATE_DIR="${STATE_DIR:-$HOME/.config/asynchrone-staging}"
STATE_FILE="$STATE_DIR/secrets.env"
LOCAL_PORT="${LOCAL_PORT:-15432}"

if [ ! -f "$STATE_FILE" ]; then
  echo "missing $STATE_FILE; run create-secrets.sh first" >&2
  exit 1
fi

# shellcheck disable=SC1090
source "$STATE_FILE"
POSTGRES_USER="${POSTGRES_USER:-asynchrone}"
POSTGRES_DB="${POSTGRES_DB:-asynchrone}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

kubectl -n "$NS" port-forward svc/postgres "${LOCAL_PORT}:5432" >/dev/null 2>&1 &
PF_PID=$!
trap 'kill "$PF_PID" 2>/dev/null || true' EXIT
sleep 3

LOCAL_BASE="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:${LOCAL_PORT}"
export DATABASE_URL="${LOCAL_BASE}/${POSTGRES_DB}?schema=public"
export IDENTITY_DATABASE_URL="${LOCAL_BASE}/asynchrone_identity?schema=public"
export BETTER_AUTH_SECRET="$BETTER_AUTH_SECRET"
export BETTER_AUTH_URL="https://copilot.staging.asynchrone.space"
export NEXT_PUBLIC_APP_URL="https://copilot.staging.asynchrone.space"
export COPILOT_APP_URL="https://copilot.staging.asynchrone.space"
export PROJECTS_APP_URL="https://projects.copilot.staging.asynchrone.space"
export CALENDARS_APP_URL="https://calendars.copilot.staging.asynchrone.space"
export FILES_APP_URL="https://files.copilot.staging.asynchrone.space"
export MESSAGES_APP_URL="https://messages.copilot.staging.asynchrone.space"
export CLIENTS_APP_URL="https://clients.copilot.staging.asynchrone.space"
export EMPLOYEES_APP_URL="https://employees.copilot.staging.asynchrone.space"

npx tsx apps/copilot/scripts/provision-oauth-clients-direct.ts \
  --write-env "$STATE_DIR/oauth.env"

echo "OAuth clients written to $STATE_DIR/oauth.env; run patch-oauth.sh next."
