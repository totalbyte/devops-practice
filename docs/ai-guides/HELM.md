# Helm -- Chart Internals and Conventions

> **Last verified:** 2026-10-28 (Chart 0.2.0: `progressDeadlineSeconds` + per-service override; the chart is deployed by Argo CD from the `relativa-gitops` copy, see [GITOPS.md](GITOPS.md).) Earlier: 2026-10-22 (Initial chart `helm/relativa` 0.1.0, appVersion 1.1.0: `k8s/` as templates, dev/prod values, pre-upgrade backup hook, release tests; Helm 3.20.)

> **Maintenance obligation:** If you change anything under `helm/relativa/` -- templates, helpers, values keys or defaults, `Chart.yaml` -- update this file and its "Last verified" date, the parameter table in [helm/relativa/README.md](../../helm/relativa/README.md), and bump `version` in `Chart.yaml` (SemVer: template fix = patch, new value = minor, renamed/removed value = major). A change to a service's env vars, ports, probes or images usually has to be made **both** in `k8s/` and in the matching chart template. See [AI-GUIDES-INDEX.md](../../AI-GUIDES-INDEX.md) for the full update matrix.

> **Note:** Operator commands (install per environment, parameters, value precedence, lifecycle, troubleshooting) are in [helm/relativa/README.md](../../helm/relativa/README.md); the Lab 4 demo sequence is in [docs/runbooks/HELM-LAB4.md](../runbooks/HELM-LAB4.md). This guide explains how the chart is built and why.

---

## Relation to `k8s/`

The chart renders the same workloads as the plain manifests in `k8s/` ([KUBERNETES.md](KUBERNETES.md) explains the topology, start-up order, probes and SignalR affinity -- all of it applies unchanged). Both are kept:

- `k8s/` -- the Lab 3 deliverable, fixed names in namespace `antoniuk`, `kubectl apply -f k8s/`.
- `helm/relativa/` -- the same objects as templates; with `values-prod.yaml` the rendered set equals `k8s/` minus the Namespace (28 vs 29 objects).

Do not deploy both into one namespace: the `k8s/` objects have unprefixed names (`gateway`, `migration`, …) and would run next to the chart's `relativa-*` objects.

---

## Layout

```
helm/relativa/
├── Chart.yaml              # apiVersion v2, version (chart), appVersion (Relativa release)
├── values.yaml             # defaults = development environment
├── values-dev.yaml         # explicit dev knobs (renders identically to the defaults)
├── values-prod.yaml        # prod: 2 replicas, k8s/ resources, tag 1.0.0, Ingress on
├── README.md               # operator docs + parameter table
└── templates/
    ├── _helpers.tpl        # all named templates (see below)
    ├── NOTES.txt           # access instructions, branches on ingress.enabled
    ├── configmap.yaml, secret.yaml
    ├── migration-waiter-{serviceaccount,role,rolebinding}.yaml
    ├── {postgres,rabbitmq,mailhog}-{deployment,service}.yaml, postgres-pvc.yaml
    ├── migration-job.yaml  # also defines relativa.migration.jobSpec
    ├── {gateway,auth,core,graph,audit,ml,client}-{deployment,service}.yaml
    ├── ingress.yaml
    ├── backup-pvc.yaml, backup-hook-job.yaml
    └── tests/test-{services,gateway}.yaml
```

One object per template file, like `k8s/`. No Namespace template: the release namespace comes from `-n … --create-namespace`, and every object sets `namespace: {{ .Release.Namespace }}` so `helm template` output is self-contained.

---

## Named templates (`_helpers.tpl`)

| Template | Argument | Result |
|---|---|---|
| `relativa.name` | root | chart name or `nameOverride` |
| `relativa.fullname` | root | `<release>-relativa`, or just `<release>` if it already contains `relativa`, or `fullnameOverride` (max 63 chars) |
| `relativa.componentName` | `(list $ "gateway")` | `<fullname>-gateway` -- every object name and every in-cluster host name (ConfigMap `DB_HOST`, YARP destinations, init-container targets) |
| `relativa.labels` / `relativa.selectorLabels` | root | standard `app.kubernetes.io/*` + `helm.sh/chart` / only `name` + `instance` |
| `relativa.componentLabels` / `componentSelectorLabels` / `podLabels` | `(list $ "<component>")` | the above plus `app.kubernetes.io/component`; pod templates use `podLabels` (selector labels + `part-of`, no version, so a chart bump does not roll pods) |
| `relativa.configMapName`, `relativa.secretName`, `relativa.migrationWaiterName` | root | `<fullname>-config`, `<fullname>-secrets` (or `secrets.existingSecret`), `<fullname>-migration-waiter` |
| `relativa.migrationJobName` | root | `<fullname>-migration-<sha256(jobSpec)[:8]>` |
| `relativa.imageTag` / `relativa.appImage` | `(list $ .Values.<svc>.image)` | tag fallback `<svc>.image.tag` → `image.tag` → `.Chart.AppVersion`; full `registry/repository:tag` |
| `relativa.image` | `{repository, tag}` | `repository:tag` for third-party images |
| `relativa.frontendUrl` / `relativa.gatewayUrl` | root | `http://<ingress host>` if `ingress.enabled`, else `config.urls.*` |
| `relativa.secretValue` | `(list $ "<KEY>" <value>)` | the value, else the live Secret's value (`lookup`), else `randAlphaNum 48` |
| `relativa.configChecksum` / `relativa.checksums` | root | `checksum/config` (rendered ConfigMap) / plus `checksum/secret` (hash of `.Values.secrets`) |
| `relativa.waitForMigration`, `relativa.waitForRabbitmq` | root | the two backend init containers |
| `relativa.secretEnv` | `(list $ "<ENV>" "<KEY>")` | one `env` entry with `secretKeyRef` |

Multi-argument helpers take a `list` (`index . 0` is the root context) rather than a `dict`, to keep call sites short.

---

## Decisions and their reasons

**Names from the release, selectors with `instance`.** Lab requirement: two installs in one cluster. Every selector is `name` + `instance` + `component`, so even two releases in one namespace do not share pods. `k8s/` used `app.kubernetes.io/name: <service>`; in the chart `name` is the chart (`relativa`) and the service is `component` -- filter pods with `-l app.kubernetes.io/component=gateway`.

**Migration Job hashing.** A Job's pod template is immutable; a fixed name breaks `helm upgrade` when the migration image changes (`field is immutable`). The Job spec lives in the named template `relativa.migration.jobSpec` (defined in `migration-job.yaml`); the Job name and the backends' `kubectl wait job/<name>` both use its hash. Consequences: unrelated upgrades leave the Job alone; a new migration image creates a new Job, Helm deletes the old one, and the five backends roll (their init container argument changed) and wait for the new migration. `jobSpec` must not include anything that changes on every render (checksums, revision), or every upgrade would re-run the migration. Migrations are idempotent EF migrations, so re-running an older image on a newer schema (rollback) is a no-op.

**Secrets.** `secret.yaml` renders `data:` from `relativa.secretValue`. `lookup` returns the live Secret during install/upgrade/rollback, so generated passwords survive upgrades; it returns nothing in `helm template` / `--dry-run=client`, which therefore show fresh random values. `checksum/secret` hashes `.Values.secrets`, not the rendered Secret -- hashing the render would differ between the first install (random) and the first upgrade (looked up) and roll every pod for nothing.

**Checksums only where they help.** App Deployments carry `checksum/config` (+ `checksum/secret` where a secret is used; the client reads no secret). PostgreSQL and RabbitMQ carry none: they read user/password only at first initialisation, and `Recreate` restarts would mean downtime on every URL change (dev ↔ prod switches the URLs). MailHog reads nothing.

**URLs follow Ingress.** The SPA calls the gateway from the browser, so `VITE_GATEWAY_URL`, `CORS_ORIGIN`, `GATEWAY_PUBLIC_URL` and `APP_FRONTEND_BASE_URL` must be browser-reachable: Ingress hosts in prod, `localhost` port-forwards in dev. `relativa.frontendUrl` / `gatewayUrl` pick one; NOTES derives the port-forward local ports from `config.urls.*`.

**`ASPNETCORE_ENVIRONMENT` stays `Development`.** It is a value, but `Production` makes Graph skip `MapOpenApi()`, and the gateway's aggregated Scalar document would lose the Graph group. Both environment files leave it at the default.

**Progress deadline is a value.** `progressDeadlineSeconds` and `<service>.progressDeadlineSeconds` (both unset by default: the field is not rendered and Kubernetes uses 600 s, so the default render is unchanged) set how long a rollout may stall before the Deployment reports `ProgressDeadlineExceeded`. Argo CD maps that condition to health `Degraded`; before it the app is only `Progressing`. The GitOps values shorten it for the gateway only (60 s): a global short deadline marks the first install `Degraded` while backends wait for the migration and pull images.

**Container ports stay literal.** Client (Vite `--port 3000`) and ML (gunicorn script) fix their ports in the image; the .NET ports are set with `ASPNETCORE_URLS` and kept literal for symmetry. Service ports are values; YARP destinations and tests use the Service port values.

---

## Under Argo CD

Argo CD renders the chart with `helm template` and applies the result itself (no Helm release, `helm list` is empty). What that changes, and how the `relativa-gitops` values handle it, is in [GITOPS.md](GITOPS.md): `lookup` returns nothing (so `secrets.existingSecret` is required), `pre-upgrade` becomes a `PreSync` hook that also runs on the first sync (so `backup.enabled: false`), and test hooks are skipped with `helm.skipTests`.

## Hook and tests

| Resource | Hook | Delete policy | Notes |
|---|---|---|---|
| Job `<fullname>-backup` | `pre-upgrade`, weight 0 | `before-hook-creation,hook-succeeded` | `pg_dump -Fc` → PVC `<fullname>-backups`; keeps `backup.keep` newest dumps; `backoffLimit: 1`; failure aborts the upgrade |
| Pod `<fullname>-test-services` | `test`, weight 0 | `before-hook-creation,hook-succeeded` | busybox `wget` on each backend's health path through its Service |
| Pod `<fullname>-test-gateway` | `test`, weight 1 | `before-hook-creation,hook-succeeded` | gateway `/health`; `/version` must equal `relativa.imageTag` for the gateway; wrong-password login → 401; client `/` with `Host: localhost` contains `id="app"` |

- **Why `hook-succeeded`:** Helm 3 does not delete hook resources on `helm uninstall` (verified: a test pod with only `before-hook-creation` outlived the release). With `hook-succeeded` nothing is left after success; a failed hook/test resource stays for debugging and is replaced by the next run.
- **`helm test --logs` does not work** with `hook-succeeded` (the pod is gone before Helm reads its log, and Helm stops at that error). Read a failed test with `kubectl logs`.
- **Backup only pre-upgrade, not pre-rollback:** rollback hooks come from the target revision's stored manifest, so the file name would carry the old revision number.
- **Backup PVC is a regular release resource** (created on install, deleted on uninstall). Enabling `backup` on an existing release deadlocks the first hook (PVC not yet created) -- upgrade once with `--no-hooks`.
- **Vite host check:** Vite 6 answers 403 to a `Host` it does not know. Allowed are `localhost` and IP addresses by default (that is why kubelet probes work) plus `relativa.local` from `server.allowedHosts` in `Client/vite.config.ts`. Anything calling the client by Service name must send an allowed `Host`.

---

## Verified behaviour (minikube, Kubernetes 1.37, Helm 3.20)

- Clean install of dev values: all pods ready in ~2.5 min; login through the gateway returns a JWT, core answers with it.
- Upgrade `--set gateway.image.tag=…` replaces only the gateway pod; the manifest diff between the two revisions is the single `image:` line.
- Upgrade dev → prod: 2 replicas, new migration Job, Ingress created, the SPA served on `relativa.local`.
- Pre-upgrade hook: one dump per upgrade on the backup volume; the hook Job is gone after success.
- `kubectl set image` drift makes `test-gateway` fail; `helm upgrade` with the same values restores the image.
- `helm uninstall --wait` leaves only `kube-root-ca.crt` and the `default` ServiceAccount in the namespace.
