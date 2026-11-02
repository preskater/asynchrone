#!/usr/bin/env bash
# Add the provisioned OAuth client pairs to the staging Secrets and create the
# domain-app Secrets.
#
# Run after `provision-oauth.sh` has written oauth.env:
#   ./deploy/staging/patch-oauth.sh
set -euo pipefail

KUBECONFIG="${KUBECONFIG:-$HOME/.kube/staging-ovh.yaml}"
export KUBECONFIG
NS="${NS:-asynchrone-space}"
STATE_DIR="${STATE_DIR:-$HOME/.config/asynchrone-staging}"
STATE_FILE="$STATE_DIR/secrets.env"
OAUTH_FILE="$STATE_DIR/oauth.env"

# shellcheck disable=SC1090
source "$STATE_FILE"
# shellcheck disable=SC1090
source "$OAUTH_FILE"

DB_HOST="${DB_HOST:-postgres.${NS}.svc.cluster.local}"
POSTGRES_USER="${POSTGRES_USER:-asynchrone}"
URL_BASE="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${DB_HOST}:5432"

require_var() {
  local name="$1"
  if [ -z "${!name:-}" ]; then
    echo "missing $name in $OAUTH_FILE" >&2
    exit 1
  fi
}

for name in \
  COPILOT_OAUTH_CLIENT_ID COPILOT_OAUTH_CLIENT_SECRET \
  CONTROL_TOWER_OAUTH_CLIENT_ID CONTROL_TOWER_OAUTH_CLIENT_SECRET \
  PROJECTS_OAUTH_CLIENT_ID PROJECTS_OAUTH_CLIENT_SECRET \
  CALENDARS_OAUTH_CLIENT_ID CALENDARS_OAUTH_CLIENT_SECRET \
  FILES_OAUTH_CLIENT_ID FILES_OAUTH_CLIENT_SECRET \
  MESSAGES_OAUTH_CLIENT_ID MESSAGES_OAUTH_CLIENT_SECRET \
  CLIENTS_OAUTH_CLIENT_ID CLIENTS_OAUTH_CLIENT_SECRET \
  EMPLOYEES_OAUTH_CLIENT_ID EMPLOYEES_OAUTH_CLIENT_SECRET; do
  require_var "$name"
done

patch_secret() {
  local secret="$1"
  shift
  local patch='{"data":{'
  local first=1
  local pair key value encoded
  for pair in "$@"; do
    key="${pair%%=*}"
    value="${pair#*=}"
    encoded="$(printf %s "$value" | base64 | tr -d '\n')"
    if [ "$first" -eq 1 ]; then
      first=0
    else
      patch+=','
    fi
    patch+="\"${key}\":\"${encoded}\""
  done
  patch+='}}'
  kubectl -n "$NS" patch secret "$secret" --type merge -p "$patch" >/dev/null
  echo "~ $secret"
}

apply_domain_secret() {
  local name="$1"
  shift
  kubectl -n "$NS" create secret generic "$name" "$@" --dry-run=client -o yaml \
    | kubectl apply -f - >/dev/null
  echo "= $name"
}

patch_secret asynchrone-space-copilot-secrets \
  "COPILOT_OAUTH_CLIENT_ID=${COPILOT_OAUTH_CLIENT_ID}" \
  "COPILOT_OAUTH_CLIENT_SECRET=${COPILOT_OAUTH_CLIENT_SECRET}"

patch_secret asynchrone-space-control-tower-secrets \
  "CONTROL_TOWER_OAUTH_CLIENT_ID=${CONTROL_TOWER_OAUTH_CLIENT_ID}" \
  "CONTROL_TOWER_OAUTH_CLIENT_SECRET=${CONTROL_TOWER_OAUTH_CLIENT_SECRET}"

apply_domain_secret asynchrone-space-projects-secrets \
  --from-literal=PROJECTS_DATABASE_URL="${URL_BASE}/asynchrone_projects?schema=public" \
  --from-literal=PROJECTS_OAUTH_CLIENT_ID="$PROJECTS_OAUTH_CLIENT_ID" \
  --from-literal=PROJECTS_OAUTH_CLIENT_SECRET="$PROJECTS_OAUTH_CLIENT_SECRET" \
  --from-literal=CRON_SECRET="$CRON_SECRET"

apply_domain_secret asynchrone-space-calendars-secrets \
  --from-literal=CALENDARS_DATABASE_URL="${URL_BASE}/asynchrone_calendars?schema=public" \
  --from-literal=CALENDARS_OAUTH_CLIENT_ID="$CALENDARS_OAUTH_CLIENT_ID" \
  --from-literal=CALENDARS_OAUTH_CLIENT_SECRET="$CALENDARS_OAUTH_CLIENT_SECRET"

apply_domain_secret asynchrone-space-files-secrets \
  --from-literal=FILES_DATABASE_URL="${URL_BASE}/asynchrone_files?schema=public" \
  --from-literal=FILES_OAUTH_CLIENT_ID="$FILES_OAUTH_CLIENT_ID" \
  --from-literal=FILES_OAUTH_CLIENT_SECRET="$FILES_OAUTH_CLIENT_SECRET" \
  --from-literal=CRON_SECRET="$CRON_SECRET"

apply_domain_secret asynchrone-space-messages-secrets \
  --from-literal=MESSAGES_DATABASE_URL="${URL_BASE}/asynchrone_messages?schema=public" \
  --from-literal=MESSAGES_OAUTH_CLIENT_ID="$MESSAGES_OAUTH_CLIENT_ID" \
  --from-literal=MESSAGES_OAUTH_CLIENT_SECRET="$MESSAGES_OAUTH_CLIENT_SECRET"

apply_domain_secret asynchrone-space-clients-secrets \
  --from-literal=CLIENTS_DATABASE_URL="${URL_BASE}/asynchrone_clients?schema=public" \
  --from-literal=CLIENTS_OAUTH_CLIENT_ID="$CLIENTS_OAUTH_CLIENT_ID" \
  --from-literal=CLIENTS_OAUTH_CLIENT_SECRET="$CLIENTS_OAUTH_CLIENT_SECRET"

apply_domain_secret asynchrone-space-employees-secrets \
  --from-literal=EMPLOYEES_DATABASE_URL="${URL_BASE}/asynchrone_employees?schema=public" \
  --from-literal=EMPLOYEES_OAUTH_CLIENT_ID="$EMPLOYEES_OAUTH_CLIENT_ID" \
  --from-literal=EMPLOYEES_OAUTH_CLIENT_SECRET="$EMPLOYEES_OAUTH_CLIENT_SECRET"

echo "OAuth pairs patched. Restart the affected deployments before Phase 2."
