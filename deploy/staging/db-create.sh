#!/usr/bin/env bash
# Create the per-app PostgreSQL databases and shadow databases.
#
# Requires the postgres Deployment to be Ready and create-secrets.sh to have
# written ~/.config/asynchrone-staging/secrets.env.
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

DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:${LOCAL_PORT}/${POSTGRES_DB}" \
  npm run db:create
