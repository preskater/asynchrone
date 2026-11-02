#!/usr/bin/env bash
# Create the staging namespace and the non-OAuth Secrets.
#
# This script generates the database/auth values once and stores them in
# ~/.config/asynchrone-staging/secrets.env (mode 0600). It never prints the
# values. The OAuth client pairs are added later by patch-oauth.sh.
set -euo pipefail

KUBECONFIG="${KUBECONFIG:-$HOME/.kube/staging-ovh.yaml}"
export KUBECONFIG
NS="${NS:-asynchrone-space}"
STATE_DIR="${STATE_DIR:-$HOME/.config/asynchrone-staging}"
STATE_FILE="$STATE_DIR/secrets.env"

mkdir -p "$STATE_DIR"
chmod 700 "$STATE_DIR"

if [ -f "$STATE_FILE" ]; then
  # shellcheck disable=SC1090
  source "$STATE_FILE"
else
  POSTGRES_USER="asynchrone"
  POSTGRES_PASSWORD="$(openssl rand -hex 24)"
  POSTGRES_DB="asynchrone"
  DB_HOST="postgres.${NS}.svc.cluster.local"
  BETTER_AUTH_SECRET="$(openssl rand -base64 48 | tr -d '\n')"
  CRON_SECRET="$(openssl rand -hex 32)"
  CONTROL_TOWER_BETTER_AUTH_SECRET="$(openssl rand -base64 48 | tr -d '\n')"
  umask 077
  cat > "$STATE_FILE" <<EOF
POSTGRES_USER=$POSTGRES_USER
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
POSTGRES_DB=$POSTGRES_DB
DB_HOST=$DB_HOST
BETTER_AUTH_SECRET=$BETTER_AUTH_SECRET
CRON_SECRET=$CRON_SECRET
CONTROL_TOWER_BETTER_AUTH_SECRET=$CONTROL_TOWER_BETTER_AUTH_SECRET
EOF
  chmod 600 "$STATE_FILE"
fi

POSTGRES_USER="${POSTGRES_USER:-asynchrone}"
POSTGRES_DB="${POSTGRES_DB:-asynchrone}"
DB_HOST="${DB_HOST:-postgres.${NS}.svc.cluster.local}"
URL_BASE="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${DB_HOST}:5432"

kubectl get namespace "$NS" >/dev/null 2>&1 || kubectl create namespace "$NS"

create_if_missing() {
  local name="$1"
  shift
  if kubectl -n "$NS" get secret "$name" >/dev/null 2>&1; then
    echo "= $name (exists, left unchanged)"
    return
  fi
  kubectl -n "$NS" create secret generic "$name" "$@"
  echo "+ $name"
}

create_if_missing postgres-credentials \
  --from-literal=POSTGRES_USER="$POSTGRES_USER" \
  --from-literal=POSTGRES_PASSWORD="$POSTGRES_PASSWORD" \
  --from-literal=POSTGRES_DB="$POSTGRES_DB"

create_if_missing asynchrone-space-copilot-secrets \
  --from-literal=DATABASE_URL="${URL_BASE}/${POSTGRES_DB}?schema=public" \
  --from-literal=IDENTITY_DATABASE_URL="${URL_BASE}/asynchrone_identity?schema=public" \
  --from-literal=PROJECTS_DATABASE_URL="${URL_BASE}/asynchrone_projects?schema=public" \
  --from-literal=CALENDARS_DATABASE_URL="${URL_BASE}/asynchrone_calendars?schema=public" \
  --from-literal=FILES_DATABASE_URL="${URL_BASE}/asynchrone_files?schema=public" \
  --from-literal=MESSAGES_DATABASE_URL="${URL_BASE}/asynchrone_messages?schema=public" \
  --from-literal=CLIENTS_DATABASE_URL="${URL_BASE}/asynchrone_clients?schema=public" \
  --from-literal=EMPLOYEES_DATABASE_URL="${URL_BASE}/asynchrone_employees?schema=public" \
  --from-literal=CONTROL_TOWER_DATABASE_URL="${URL_BASE}/asynchrone_control_tower?schema=public" \
  --from-literal=BETTER_AUTH_SECRET="$BETTER_AUTH_SECRET" \
  --from-literal=CRON_SECRET="$CRON_SECRET"

create_if_missing asynchrone-space-control-tower-secrets \
  --from-literal=CONTROL_TOWER_DATABASE_URL="${URL_BASE}/asynchrone_control_tower?schema=public" \
  --from-literal=CONTROL_TOWER_BETTER_AUTH_SECRET="$CONTROL_TOWER_BETTER_AUTH_SECRET"

echo "State file: $STATE_FILE"
echo "Databases still need to be created with deploy/staging/db-create.sh."
