# Relativa Helm chart

Helm 3 chart for the full Relativa stack: the seven application services (gateway, auth, core, graph, audit, ml, client), the migration Job, and the infrastructure they need (PostgreSQL, RabbitMQ, MailHog). It packages the same objects as the plain manifests in [`k8s/`](../../k8s/) (Lab 3), with names, image tags, replicas, resources and configuration taken from values.

## Install

Prerequisites: Helm 3 (tested with 3.20), a cluster with a default StorageClass (minikube: `minikube start --driver=docker --cpus=4 --memory=6144`), and for production values the ingress-nginx controller (`minikube addons enable ingress`). Images are public on GHCR, no pull secret needed.

**Development** (1 replica each, no Ingress, about half the memory of production):

```powershell
helm install relativa helm/relativa -n antoniuk --create-namespace -f helm/relativa/values-dev.yaml --wait --timeout 10m
kubectl port-forward -n antoniuk svc/relativa-client 3000:3000
kubectl port-forward -n antoniuk svc/relativa-gateway 8080:8080
```

Run each `port-forward` in its own terminal and open http://localhost:3000.

**Production** (2 replicas, Ingress, ~2.5 GB RAM as measured for `k8s/`):

```powershell
helm install relativa helm/relativa -n antoniuk --create-namespace -f helm/relativa/values-prod.yaml --wait --timeout 10m
minikube tunnel
```

Map `127.0.0.1 relativa.local api.relativa.local mail.relativa.local` in the hosts file and open http://relativa.local.

Either way one command creates everything on a clean cluster; the first install takes 2–4 minutes, mostly image pulls. `NOTES.txt` prints the access commands for the chosen mode. Seeded demo accounts (e.g. `admin@relativa.com`) log in with `Demo1234!`.

Switch an installed release to the other environment with `helm upgrade relativa helm/relativa -n antoniuk -f helm/relativa/values-prod.yaml --wait`.

## Parameters

| Key | Default (`values.yaml`) | Description |
|---|---|---|
| `nameOverride` / `fullnameOverride` | `""` | Replace the chart name / the whole `<release>-relativa` prefix of object names |
| `image.registry` | `ghcr.io/totalbyte` | Registry and owner of the eight Relativa images |
| `image.tag` | `""` (→ `appVersion`) | Default tag for all Relativa images |
| `image.pullPolicy` | `IfNotPresent` | Pull policy for every container |
| `config.aspnetcoreEnvironment` | `Development` | `ASPNETCORE_ENVIRONMENT` of the .NET services (`Production` disables Graph's OpenAPI document, which the gateway's Scalar page aggregates) |
| `config.database.name` / `.user` | `relativa` / `relativa` | PostgreSQL database and user |
| `config.rabbitmq.user` | `relativa` | RabbitMQ user |
| `config.jwt.issuer` / `.audience` | `relativa-auth` / `relativa` | JWT claims (auth, gateway, audit) |
| `config.smtp.fromAddress` / `.fromName` / `.useSsl` | `noreply@relativa.com` / `Relativa` / `false` | Sender of e-mails (delivered to MailHog) |
| `config.urls.frontend` / `.gateway` | `http://localhost:3000` / `http://localhost:8080` | Browser-facing URLs when `ingress.enabled=false` (CORS origin, `VITE_GATEWAY_URL`, links in e-mails); with Ingress they are derived from `ingress.hosts` |
| `secrets.existingSecret` | `""` | Use an existing Secret (keys `DB_PASS`, `RABBITMQ_PASS`, `JWT_SECRET`) instead of rendering one |
| `secrets.dbPassword` / `.rabbitmqPassword` / `.jwtSecret` | `""` | Passwords; empty means generated on install (48 random characters) and kept on every upgrade |
| `ingress.enabled` | `false` | Create the Ingress |
| `ingress.className` | `nginx` | IngressClass |
| `ingress.annotations` | cookie affinity, 3600 s proxy timeouts | Kept from `k8s/` for SignalR (see [KUBERNETES.md](../../docs/ai-guides/KUBERNETES.md)) |
| `ingress.hosts.client` / `.gateway` / `.mailhog` | `relativa.local` / `api.relativa.local` / `mail.relativa.local` | Ingress hosts |
| `<service>.replicaCount` | `1` | Replicas of `gateway`, `auth`, `core`, `graph`, `audit`, `ml`, `client` |
| `<service>.image.repository` | `relativa-<service>` | Image name under `image.registry` |
| `<service>.image.tag` | `""` (→ `image.tag`) | Per-service tag override |
| `<service>.service.type` / `.port` | `ClusterIP` / 8080, 8081, 8082, 8083, 8086, 8084, 3000 | Service type and port |
| `core.service.sessionAffinity`, `graph.service.sessionAffinity` | `ClientIP` | Sticky SignalR connections from the gateway |
| `<service>.resources` | see `values.yaml` | Requests and limits |
| `migration.image.repository` / `.tag` | `relativa-migration` / `""` | Migration image |
| `migration.backoffLimit` | `6` | Retries of the migration Job |
| `migration.resources` | 100m/256Mi → 1/768Mi | Requests and limits |
| `postgres.image.repository` / `.tag` | `postgres` / `16-alpine` | PostgreSQL image |
| `postgres.replicaCount` | `1` | Must stay 1 (a `ReadWriteOnce` volume) |
| `postgres.service.type` / `.port` | `ClusterIP` / `5432` | Service |
| `postgres.persistence.enabled` | `true` | PVC for the data; `false` uses `emptyDir` (data lost with the pod) |
| `postgres.persistence.size` / `.accessMode` / `.storageClass` | `2Gi` / `ReadWriteOnce` / `""` (default class) | PVC settings |
| `rabbitmq.image.repository` / `.tag` | `rabbitmq` / `3.13-management-alpine` | RabbitMQ image; `replicaCount` must stay 1 |
| `rabbitmq.service.ports.amqp` / `.management` | `5672` / `15672` | Service ports |
| `mailhog.image.repository` / `.tag` | `mailhog/mailhog` / `v1.0.1` | MailHog image |
| `mailhog.service.ports.smtp` / `.http` | `1025` / `8025` | Service ports |
| `backup.enabled` | `true` | Pre-upgrade database dump (hook Job + PVC, see below) |
| `backup.keep` | `5` | Dumps kept on the volume |
| `backup.persistence.size` / `.accessMode` / `.storageClass` | `1Gi` / `ReadWriteOnce` / `""` | Backup PVC |
| `backup.resources`, `tests.resources` | see `values.yaml` | Requests and limits of the hook Job and the test pods |
| `initImages.kubectl` / `initImages.busybox` | `registry.k8s.io/kubectl:v1.37.1` / `busybox:1.37` | Init containers (wait for the migration Job / RabbitMQ) and test pods |
| `initResources.kubectl` / `.busybox` / `.postgres` | see `values.yaml` | Requests and limits of the init containers |

Container ports (8080–8086, 3000, 5432, …) are fixed by the images and stay in the templates.

## Objects

| Template | Object | Name (release `relativa`) |
|---|---|---|
| `configmap.yaml` | ConfigMap | `relativa-config` |
| `secret.yaml` | Secret (unless `secrets.existingSecret`) | `relativa-secrets` |
| `migration-waiter-*.yaml` | ServiceAccount, Role, RoleBinding | `relativa-migration-waiter` |
| `postgres-pvc.yaml` | PVC (if `postgres.persistence.enabled`) | `relativa-postgres` |
| `postgres-*`, `rabbitmq-*`, `mailhog-*` | Deployment + Service each | `relativa-postgres`, … |
| `migration-job.yaml` | Job | `relativa-migration-<hash>` |
| `<service>-deployment.yaml`, `<service>-service.yaml` | Deployment + Service for the seven app services | `relativa-gateway`, … |
| `ingress.yaml` | Ingress (if `ingress.enabled`) | `relativa` |
| `backup-pvc.yaml` | PVC (if `backup.enabled`) | `relativa-backups` |
| `backup-hook-job.yaml` | Job, `pre-upgrade` hook (if `backup.enabled`) | `relativa-backup` |
| `tests/test-*.yaml` | Pods, `test` hook | `relativa-test-services`, `relativa-test-gateway` |

Every name comes from `relativa.componentName` (`<fullname>-<component>`), and every selector includes `app.kubernetes.io/instance: <release>`, so two releases fit into one cluster or even one namespace (Ingress hosts must differ, or Ingress stay off). Labels follow the Helm convention: `app.kubernetes.io/name: relativa`, `instance`, `component: <service>`, `version`, `managed-by: Helm`, `helm.sh/chart`, `part-of: relativa`.

Design notes:

- **Migration Job name carries a hash of its own spec.** A Job's pod template is immutable, so a fixed name would make `helm upgrade` fail as soon as the migration image changed. A new image now means a new Job (Helm deletes the old one); upgrades that do not touch the migration keep the same Job. The backend init containers `kubectl wait` for exactly that name, so a new migration also rolls the backends after it completes.
- **Config changes roll the pods.** App pods carry `checksum/config` (rendered ConfigMap) and `checksum/secret` (the `secrets` values), so `helm upgrade` restarts what reads a changed setting -- no `kubectl rollout restart` needed. PostgreSQL and RabbitMQ have no checksums: they read their user and password only on first initialisation, and restarting them for a URL change would only cause downtime.
- **Generated passwords survive upgrades.** `secret.yaml` uses `lookup` to reuse the values in the live Secret. `helm template` and `--dry-run=client` have no cluster access, so they show new random values every run.

## Hook and tests

**Pre-upgrade backup.** Before every `helm upgrade` Helm runs the Job `relativa-backup`: `pg_dump -Fc` of the database into `/backups/<release>-before-rev<N>-<timestamp>.dump` on the PVC `relativa-backups`, keeping the newest `backup.keep` files. If the dump fails, the upgrade does not start. The PostgreSQL pod mounts the same volume read-only at `/backups`:

```powershell
kubectl get jobs -n antoniuk -w
kubectl exec -n antoniuk deploy/relativa-postgres -- ls -l /backups
kubectl exec -n antoniuk deploy/relativa-postgres -- pg_restore -l /backups/<file>.dump
```

To restore a dump: `kubectl exec -n antoniuk deploy/relativa-postgres -- pg_restore -U relativa -d relativa --clean --if-exists /backups/<file>.dump`.

**Release tests.** `helm test relativa -n antoniuk` runs two pods:

| Test | Checks |
|---|---|
| `relativa-test-services` | `GET` the health endpoint of auth, core, graph, audit and ml directly through their Services |
| `relativa-test-gateway` | gateway `/health`; `/version` reports exactly the gateway tag from values (catches changes made outside Helm, e.g. `kubectl set image`); a login with a wrong password through the gateway returns 401 (gateway → auth → database); the client serves the SPA |

Both the hook Job and the test pods use `helm.sh/hook-delete-policy: before-hook-creation,hook-succeeded`. Helm does not delete hook resources on `helm uninstall`, so anything left behind would outlive the release; with this policy they disappear after success. A failed test pod stays for inspection -- read it with `kubectl logs -n antoniuk relativa-test-gateway` (`helm test --logs` stops at the first pod that was already deleted), and the next successful `helm test` removes it.

## Lifecycle

```powershell
helm upgrade relativa helm/relativa -n antoniuk --reuse-values --set gateway.image.tag=1.0.0 --wait
helm upgrade relativa helm/relativa -n antoniuk -f helm/relativa/values-prod.yaml --wait
helm history relativa -n antoniuk
helm get values relativa -n antoniuk --revision 2
helm get manifest relativa -n antoniuk --revision 2
helm rollback relativa 2 -n antoniuk --wait
helm uninstall relativa -n antoniuk --wait
```

`helm rollback` creates a new revision with the manifest of the target one (history keeps all of them) and deletes objects the target did not have, e.g. the Ingress when rolling back from production to development values. `helm uninstall` deletes every object of the release, including both PVCs and their data; only the `kube-root-ca.crt` ConfigMap and the `default` ServiceAccount, which Kubernetes creates in every namespace, remain.

Helm keeps the release state in the release namespace: one Secret per revision, `sh.helm.release.v1.<release>.v<N>` (type `helm.sh/release.v1`, labels `owner=helm`, `name`, `status`, `version`), whose `release` field holds the gzipped, base64-encoded release JSON (chart, values, rendered manifest, status).

```powershell
kubectl get secrets -n antoniuk -l owner=helm --show-labels
```

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `helm upgrade` fails with `field is immutable` on a Job | Not expected with this chart (the migration Job name changes with its spec); a leftover Job from `k8s/` in the same namespace would collide -- install into a clean namespace |
| `helm upgrade` hangs on `relativa-backup` after enabling `backup` on an existing release | The hook runs before the backup PVC exists. Upgrade once with `--no-hooks`, then upgrade normally |
| `relativa-test-gateway` fails with `client did not serve the SPA` | Vite rejects unknown `Host` headers; the test sends `Host: localhost`. Check `kubectl logs -n antoniuk relativa-test-gateway` |
| `relativa-test-gateway` fails with `gateway should run X` | The gateway Deployment was changed outside Helm; `helm upgrade` with the same values restores it |
| `kubectl get pv` shows a `Released` volume after uninstall | minikube's hostpath provisioner only deletes volumes it created under its current identity; after the provisioner pod restarted, delete the PV by hand (`kubectl delete pv <name>`) |
| Login fails with `Invalid email or password` for a demo account | The seeded password is `Demo1234!` (`Admin1234!` in an older migration comment is outdated) |

## Chart version vs app version

`Chart.yaml` carries two independent versions:

| Field | Current | What it versions | When it changes |
|---|---|---|---|
| `version` | `0.1.0` | The **chart** itself: templates, `values.yaml` defaults, helpers, NOTES | Any change under `helm/relativa/`, following SemVer: a fix in a template is a patch, a new value is a minor, a renamed or removed value (breaks existing `-f` files / `--set` flags) is a major |
| `appVersion` | `1.1.0` | The **Relativa release** the chart deploys by default | A new git tag `v*` -- CI publishes `ghcr.io/totalbyte/relativa-<service>:<x.y.z>` for all eight images, and `appVersion` is set to that `x.y.z` |

For this project:

- `appVersion` is the default image tag for every Relativa image (gateway, auth, core, graph, audit, ml, client, migration). An empty `image.tag` in values falls back to it, so bumping `appVersion` from `1.1.0` to `1.2.0` moves the whole stack to the next release in one line.
- An image tag set in values wins over `appVersion`. The production values pin `1.0.0` while the chart's `appVersion` stays `1.1.0`; `helm list` still prints `APP VERSION 1.1.0` for such a release, because that column comes from `Chart.yaml`, not from the running images.
- The two move independently: changing a default replica count or a probe is a new chart `version` with the same `appVersion`; a new Relativa release is a new `appVersion` and at least a patch bump of `version` (the chart's content changed).
- Infrastructure images (`postgres:16-alpine`, `rabbitmq:3.13-management-alpine`, `mailhog/mailhog:v1.0.1`) have their own tags in values and are not tied to `appVersion`.

```powershell
helm show chart helm/relativa
helm list -n antoniuk
```

`helm list` shows both: `CHART relativa-0.1.0` and `APP VERSION 1.1.0`.

## Environments

`values.yaml` holds the defaults, and they are the development environment: installing without `-f` gives the same manifests as `-f values-dev.yaml`. The two environment files set the keys that differ between environments:

| Setting | `values-dev.yaml` | `values-prod.yaml` |
|---|---|---|
| Relativa image tag (`image.tag`) | `1.1.0` | `1.0.0` |
| Replicas of each app service | 1 | 2 |
| App resources (.NET services, requests → limits) | 25m/96Mi → 500m/320Mi | 50m/128Mi → 500m/384Mi (as in `k8s/`) |
| Ingress (`ingress.enabled`) | off -- `kubectl port-forward` to `localhost:3000` / `localhost:8080` | on -- `relativa.local`, `api.relativa.local`, `mail.relativa.local` |
| Browser-facing URLs (CORS, `VITE_GATEWAY_URL`, e-mail links) | `config.urls.*` (`http://localhost:...`) | derived from the Ingress hosts |

With the production values the chart renders the same set of objects as `k8s/` (except the Namespace, which `--create-namespace` creates). Infrastructure (PostgreSQL, RabbitMQ, MailHog) is identical in both environments and always runs one replica.

Compare the environments without installing anything -- render both and diff the output. The fixed `--set secrets.*` keeps the generated passwords out of the diff (without a cluster `helm template` generates new ones on every run):

```powershell
$same = 'secrets.dbPassword=x,secrets.rabbitmqPassword=x,secrets.jwtSecret=x'
helm template relativa helm/relativa -n antoniuk -f helm/relativa/values-dev.yaml --set $same | Out-File -Encoding utf8 $env:TEMP\relativa-dev.yaml
helm template relativa helm/relativa -n antoniuk -f helm/relativa/values-prod.yaml --set $same | Out-File -Encoding utf8 $env:TEMP\relativa-prod.yaml
git diff --no-index $env:TEMP\relativa-dev.yaml $env:TEMP\relativa-prod.yaml
```

Windows PowerShell 5.1 writes `>` redirections as UTF-16, which `git diff` treats as binary -- hence `Out-File -Encoding utf8`.

The diff shows: replicas `1` → `2`, image tags `1.1.0` → `1.0.0`, resources, the four URLs in the ConfigMap, a new `checksum/config` on the pods (the ConfigMap changed), a new migration Job name (its spec contains the image tag), and the whole Ingress object that only production renders.

## Value precedence

Helm merges values from lowest to highest priority:

1. `values.yaml` inside the chart (defaults);
2. files passed with `-f` / `--values`, in the order given -- a later file overrides an earlier one;
3. `--set` / `--set-string` / `--set-file` flags, in the order given -- they override every file, wherever they stand on the command line.

Maps are merged key by key, so a file or flag overrides only the keys it names; lists and scalars are replaced as a whole. The gateway Deployment for different combinations:

| Command | Replicas | Gateway image | Why |
|---|---|---|---|
| *(no flags)* | 1 | `1.1.0` | defaults from `values.yaml` |
| `-f values-prod.yaml` | 2 | `1.0.0` | the file overrides the defaults |
| `-f values-prod.yaml -f values-dev.yaml` | 1 | `1.1.0` | the last file wins |
| `--set gateway.replicaCount=3 -f values-prod.yaml` | 3 | `1.0.0` | `--set` beats every file, even one listed after it |
| `-f values-prod.yaml --set image.tag=1.1.0` | 2 | `1.1.0` | only the named key changes |
| `-f values-prod.yaml --set image.tag=1.1.0 --set gateway.image.tag=1.0.0` | 2 | `1.0.0` | a per-service tag beats the global `image.tag` (template fallback: `<service>.image.tag` → `image.tag` → `appVersion`) |

```powershell
helm template relativa helm/relativa -f helm/relativa/values-prod.yaml --set gateway.replicaCount=3 --show-only templates/gateway-deployment.yaml
```

On `helm upgrade` with any `-f` or `--set`, the previous revision's values are not carried over: the new revision gets `values.yaml` plus only the overrides on that command line. `--reuse-values` (or `--reset-then-reuse-values`) merges the new overrides into the previous revision's values instead; an upgrade with no overrides at all keeps the previous values. `helm get values <release> --revision <n>` shows what a revision was installed with.
