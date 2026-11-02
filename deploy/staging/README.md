# Staging deployment

Staging runs the full nine-app umbrella chart on the `staging` MKS cluster, on
its own `asynchrone-space` namespace and in-cluster PostgreSQL.

## Hosts

| Host | App |
| --- | --- |
| `staging.asynchrone.space` | landing |
| `www.staging.asynchrone.space` | landing (redirects to apex) |
| `copilot.staging.asynchrone.space` | Copilot / identity / OAuth |
| `projects.copilot.staging.asynchrone.space` | projects |
| `calendars.copilot.staging.asynchrone.space` | calendars |
| `files.copilot.staging.asynchrone.space` | files |
| `messages.copilot.staging.asynchrone.space` | messages |
| `clients.copilot.staging.asynchrone.space` | clients |
| `employees.copilot.staging.asynchrone.space` | employees |
| `control-tower.staging.asynchrone.space` | control tower |

## Cluster facts

- Rancher cluster `c-4zmhr`, MKS cluster `15b71624-e445-4ed1-8460-9211e8de8e8a`.
- Region `GRA11`, one `d2-4` node, Staging network `51708903…` and subnet
  `619e6357…` (`10.6.0.0/16`).
- Ingress floating IP `151.80.202.99`; OVH gateway `377ed77b…`
  (`91.134.46.196`).
- The node is memory constrained. Keep one replica per app, monitoring and
  CronJobs disabled, and check `kubectl top node` between phases. If the node
  OOMs or PostgreSQL is evicted again, recreate the empty cluster with one
  `d2-8` or add a second `d2-4`.

## DNS

Create the four A records in the OVH `asynchrone.space` zone (TTL 300):

```bash
ovhcloud domain-zone record create asynchrone.space \
  --sub-domain staging --field-type A --target 151.80.202.99 --ttl 300
ovhcloud domain-zone record create asynchrone.space \
  --sub-domain '*.staging' --field-type A --target 151.80.202.99 --ttl 300
ovhcloud domain-zone record create asynchrone.space \
  --sub-domain '*.copilot.staging' --field-type A --target 151.80.202.99 --ttl 300
# `*.copilot.staging` creates an empty non-terminal at copilot.staging, which
# blocks the `*.staging` wildcard for that exact name. Add it explicitly.
ovhcloud domain-zone record create asynchrone.space \
  --sub-domain copilot.staging --field-type A --target 151.80.202.99 --ttl 300
```

Verify against the authoritative nameservers:

```bash
dig +short staging.asynchrone.space @dns200.anycast.me
dig +short copilot.staging.asynchrone.space @dns200.anycast.me
dig +short projects.copilot.staging.asynchrone.space @dns200.anycast.me
```

## 1. Ingress and TLS

```bash
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update
helm upgrade --install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx --create-namespace \
  --version 4.15.1 \
  -f deploy/staging/ingress-nginx-values.yaml \
  --kubeconfig ~/.kube/staging-ovh.yaml

kubectl --kubeconfig ~/.kube/staging-ovh.yaml -n ingress-nginx \
  get svc ingress-nginx-controller -w
```

Create the DNS records once the service reports `151.80.202.99`, then:

```bash
helm repo add jetstack https://charts.jetstack.io
helm repo update
helm upgrade --install cert-manager jetstack/cert-manager \
  --namespace cert-manager --create-namespace \
  --version v1.21.3 --set crds.enabled=true \
  --kubeconfig ~/.kube/staging-ovh.yaml

kubectl --kubeconfig ~/.kube/staging-ovh.yaml \
  apply -f deploy/staging/clusterissuer.yaml
```

## 2. Database and secrets

The staging credentials are generated once and stored in
`~/.config/asynchrone-staging/secrets.env` (mode 0600). They are never printed
and never committed.

```bash
./deploy/staging/create-secrets.sh
kubectl --kubeconfig ~/.kube/staging-ovh.yaml \
  apply -f deploy/staging/postgres.yaml
kubectl --kubeconfig ~/.kube/staging-ovh.yaml -n asynchrone-space \
  rollout status deploy/postgres
./deploy/staging/db-create.sh
```

`db-create.sh` port-forwards PostgreSQL and runs `npm run db:create` to create
`asynchrone_identity`, `asynchrone_projects`, `asynchrone_calendars`,
`asynchrone_files`, `asynchrone_messages`, `asynchrone_clients`,
`asynchrone_employees`, `asynchrone_control_tower` and their shadow databases.
The monolith database `asynchrone` comes from `POSTGRES_DB`.

## 3. Core release (landing, Copilot, control tower)

```bash
helm upgrade --install asynchrone-space charts/asynchrone-space \
  --namespace asynchrone-space \
  -f charts/asynchrone-space/values-staging.yaml \
  -f charts/asynchrone-space/values-staging-bootstrap.yaml \
  --kubeconfig ~/.kube/staging-ovh.yaml

kubectl --kubeconfig ~/.kube/staging-ovh.yaml -n asynchrone-space \
  get pods,ingress,certificate
kubectl --kubeconfig ~/.kube/staging-ovh.yaml -n asynchrone-space \
  logs job/asynchrone-space-migrate
```

The pre-install migrate Job runs the monolith migration, then every per-app
migration. Verify:

- both `Certificate` resources are `Ready`;
- landing, Copilot and control tower pods are `Ready`;
- `https://copilot.staging.asynchrone.space/api/health` returns 200;
- `kubectl top node` still has headroom.

## 4. Bootstrap the admin and OAuth clients

1. Open `https://copilot.staging.asynchrone.space/sign-up` and create the first
   user and organization.
2. Run:

```bash
./deploy/staging/provision-oauth.sh
./deploy/staging/patch-oauth.sh
```

Better Auth 1.7 marks the admin OAuth endpoints `SERVER_ONLY`, so
`provision-oauth.sh` writes the first-party clients directly to the identity
database with the same `base64url(SHA-256(secret))` storage the provider uses.
It writes `~/.config/asynchrone-staging/oauth.env`; `patch-oauth.sh` adds
`asynchrone-copilot` and `asynchrone-control-tower` to the existing Secrets and
creates the six domain-app Secrets.

4. Restart Copilot and the control tower so they pick up the new OAuth keys:

```bash
kubectl --kubeconfig ~/.kube/staging-ovh.yaml -n asynchrone-space \
  rollout restart deploy/asynchrone-space-copilot \
  deploy/asynchrone-space-control-tower
```

The base values set `SIGNUP_INVITE_ONLY=true`; the bootstrap overlay opened
sign-up only for the first install. Re-run the Helm upgrade with only
`values-staging.yaml` after this step to restore invite-only.

## 5. Full stack

```bash
helm upgrade --install asynchrone-space charts/asynchrone-space \
  --namespace asynchrone-space \
  -f charts/asynchrone-space/values-staging.yaml \
  --kubeconfig ~/.kube/staging-ovh.yaml
```

This enables projects, calendars, files, messages, clients and employees at one
replica each. The migrate Job re-runs as a no-op before the pods roll.

After this upgrade, check `kubectl top node` and pod restarts. If the node is
saturated, stop and choose the capacity fallback (one `d2-8` or a second
`d2-4`).

## 6. Verification

```bash
kubectl --kubeconfig ~/.kube/staging-ovh.yaml -n asynchrone-space \
  get pods,ingress,certificate
kubectl --kubeconfig ~/.kube/staging-ovh.yaml top node
curl -I https://staging.asynchrone.space
curl -I https://copilot.staging.asynchrone.space/api/health
```

Then in the browser: sign in, switch organization, open each domain app, create
a calendar event, upload/download a file, open a conversation, and verify the
control-tower handoff.

## Notes

- The landing reuses the production image, so its **Sign in** link and
  canonical/sitemap URLs point at production. All staging ingresses send
  `X-Robots-Tag: noindex, nofollow`.
- All payment, email, captcha, social-login and assistant provider keys are
  empty. Email verification is disabled.
- The staging control tower has no platform operator until you run the
  cutover/grant scripts; it still requires its own login and TOTP.
- Delete the three DNS records and the floating IP if you decommission staging.
  The PostgreSQL PVC retains staging data until it is deleted.
