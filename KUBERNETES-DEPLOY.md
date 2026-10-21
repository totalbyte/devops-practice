# Relativa Kubernetes Manual (minikube)

This manual runs the full Relativa stack in a local **minikube** cluster from the manifests in [`k8s/`](k8s/). The stack uses the release images published by CI to GHCR (`ghcr.io/totalbyte/relativa-<service>:<version>`), so nothing is built locally.

For the architecture behind the manifests (objects, start-up order, probes, affinity) see [docs/ai-guides/KUBERNETES.md](docs/ai-guides/KUBERNETES.md). For Docker Compose see [DOCKER-BUILD.md](DOCKER-BUILD.md).

## Quick Start

```powershell
minikube start --driver=docker --cpus=4 --memory=6144
minikube addons enable metrics-server
minikube addons enable ingress
kubectl apply -f k8s/
kubectl get pods -n antoniuk -w
```

In a second terminal (keep it open):

```powershell
minikube tunnel
```

Add to `C:\Windows\System32\drivers\etc\hosts` (as administrator) or `/etc/hosts`:

```
127.0.0.1 relativa.local api.relativa.local mail.relativa.local
```

Open **http://relativa.local**.

## Prerequisites

| Tool | Version | Install (Windows) |
|---|---|---|
| Docker Desktop | 4.x (WSL 2 engine) | — |
| minikube | 1.39+ | `winget install Kubernetes.minikube` |
| kubectl | within one minor version of the cluster (1.36–1.38 for Kubernetes 1.37) | `winget install Kubernetes.kubectl` |
| k6 (optional, availability check) | 1.x | [grafana.com/docs/k6 → Install](https://grafana.com/docs/k6/latest/set-up/install-k6/) |

The cluster needs about **2.5 GB** of RAM for the stack itself; `--memory=6144` leaves room for rolling updates. Docker Desktop's WSL 2 VM gets 50 % of host RAM by default, which is enough for 6 GB.

**kubectl version on Windows.** Docker Desktop ships its own `kubectl` (1.34) in `C:\Program Files\Docker\Docker\resources\bin`, which comes first in `PATH` and is too old for Kubernetes 1.37. Either move `%LOCALAPPDATA%\Microsoft\WinGet\Links` above it in `PATH`, or alias it per session:

```powershell
Set-Alias kubectl "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\Kubernetes.kubectl_Microsoft.Winget.Source_8wekyb3d8bbwe\kubectl.exe"
kubectl version
```

## 1) Start the cluster

```powershell
minikube start --driver=docker --cpus=4 --memory=6144
minikube addons enable metrics-server
minikube addons enable ingress
kubectl get nodes
kubectl get pods -n kube-system
```

`metrics-server` enables `kubectl top`; `ingress` installs the ingress-nginx controller used by `k8s/50-ingress.yaml`.

## 2) Deploy

```powershell
kubectl apply -f k8s/
```

One command creates everything in the `antoniuk` namespace. Files are numbered, so the namespace, ConfigMap, Secret and RBAC objects are applied first. Expected start-up (~3–4 min on a fresh cluster, mostly image pulls):

1. `postgres`, `rabbitmq`, `mailhog` start.
2. Job `migration` waits for Postgres, applies EF migrations + seed data, completes.
3. `auth`, `core`, `graph`, `audit`, `ml` wait in their init containers for the Job and RabbitMQ, then start.
4. `gateway` and `client` start immediately (they have no data dependencies).

```powershell
kubectl get pods -n antoniuk -w
kubectl get pods,deployments,replicasets,services,ingress -n antoniuk
```

Done when every pod is `1/1 Running` and `migration-*` is `Completed`.

## 3) Access

`minikube tunnel` (keep the terminal open) exposes the Ingress on `127.0.0.1:80`. With the hosts entries above:

| URL | What |
|---|---|
| http://relativa.local | Vue SPA |
| http://api.relativa.local | Gateway (all API calls) |
| http://api.relativa.local/scalar/v1 | Scalar API docs |
| http://api.relativa.local/version | Release version + serving pod |
| http://mail.relativa.local | MailHog inbox (email verification codes) |

New accounts must verify their email: the code arrives in MailHog. The seeded demo accounts from the migration can log in directly.

## 4) Configuration

All settings live in [`k8s/01-configmap.yaml`](k8s/01-configmap.yaml) (`relativa-config`) and [`k8s/02-secret.yaml`](k8s/02-secret.yaml) (`relativa-secrets`); the full key list is in the README section *Kubernetes Deployment*. After editing either file:

```powershell
kubectl apply -f k8s/01-configmap.yaml -f k8s/02-secret.yaml
kubectl rollout restart deployment -n antoniuk
```

Environment variables are read at container start, so running pods only see the new values after the restart.

## 5) Updating and rolling back

Releases are immutable image tags (`1.0.0`, `1.1.0`, …) produced by pushing a `v*` git tag (see [CI-PIPELINE.md](docs/ai-guides/CI-PIPELINE.md)). The manifests in `k8s/` are the source of truth:

```powershell
kubectl apply -f k8s/40-gateway-deployment.yaml
kubectl rollout status deployment/gateway -n antoniuk
kubectl rollout history deployment/gateway -n antoniuk
kubectl rollout undo deployment/gateway -n antoniuk
```

`kubectl set image` / `scale` / `rollout undo` change the cluster without changing the files; the next `kubectl apply -f k8s/` puts the file state back. Make permanent changes in the manifest.

Check availability during a rollout with k6 (10 req/s to `/version`, fails on any error):

```powershell
$env:DURATION = '100s'; k6 run tests/load/rollout-availability.js
```

## 6) Stop / reset

```powershell
kubectl delete namespace antoniuk
minikube stop
minikube delete
```

| Command | Effect |
|---|---|
| `kubectl delete namespace antoniuk` | Removes the whole stack, including the Postgres PVC (data is lost) |
| `minikube stop` | Stops the cluster; everything (incl. data) is back after `minikube start` |
| `minikube delete` | Deletes the cluster and all data |

To re-run migrations on an existing database, delete and re-apply the Job (it is immutable):

```powershell
kubectl delete job migration -n antoniuk
kubectl apply -f k8s/20-migration-job.yaml
```

## 7) Troubleshooting

| Symptom | Check | Typical cause |
|---|---|---|
| Pod `ImagePullBackOff` / `ErrImagePull` | `kubectl describe pod <pod> -n antoniuk` → Events | Wrong image tag, or GHCR package not public |
| Backend stuck in `Init:0/2` | `kubectl logs <pod> -c wait-for-migration -n antoniuk` | Migration Job failed: `kubectl logs job/migration -n antoniuk` |
| Backend stuck in `Init:1/2` | `kubectl get pods -l app.kubernetes.io/name=rabbitmq -n antoniuk` | RabbitMQ not ready yet |
| Pod `0/1 Running` for a long time | `kubectl describe pod` → `Readiness probe failed` | Service cannot reach Postgres / startup too slow under CPU pressure |
| `relativa.local` does not open | `minikube tunnel` running? hosts entry present? `kubectl get ingress -n antoniuk` | Tunnel closed or hosts file missing the names |
| Browser shows CORS errors | `kubectl exec deploy/gateway -n antoniuk -- printenv Cors__Origins__0` | `CORS_ORIGIN` in the ConfigMap must equal the SPA origin |
| `kubectl` warns about version skew | `kubectl version` | Docker Desktop's old kubectl is first in `PATH` (see Prerequisites) |
| `minikube start` hangs on `Loading gcr.io/k8s-minikube/kicbase:... from local cache` | `docker image ls --digests` → which image ID `kicbase:v0.0.51` points to | Docker's containerd image store: the base image was reloaded from minikube's cache tarball under a different digest, so minikube no longer finds the pinned digest in the daemon and retries the (hanging) tarball load — see below |

### `minikube start` hangs while loading the base image

Docker Desktop with the containerd image store (`docker info` → `driver-type: io.containerd.snapshotter.v1`) gives an image loaded from a tarball a different digest than the same image pulled from the registry. minikube pins the base image by digest (`kicbase:v0.0.51@sha256:4a1c…`); once the `v0.0.51` tag points at a tarball-loaded copy, every `minikube start` misses the image in the daemon, falls back to loading `~\.minikube\cache\kic\...tar`, and hangs there.

Stop the hung start with Ctrl+C, then pull the pinned digest from the registry, point the tag back at it, and drop the cache tarball:

```powershell
docker pull gcr.io/k8s-minikube/kicbase:v0.0.51@sha256:4a1c825b61479e6c898851ea66f13c620aaeab6002746e95067fc2c4b38a0b24
docker tag gcr.io/k8s-minikube/kicbase:v0.0.51@sha256:4a1c825b61479e6c898851ea66f13c620aaeab6002746e95067fc2c4b38a0b24 gcr.io/k8s-minikube/kicbase:v0.0.51
Remove-Item "$env:USERPROFILE\.minikube\cache\kic\amd64\kicbase_v0.0.51*"
minikube start
```

The cluster's data is not affected (it lives in the `minikube` container and its volume). If `docker image ls --digests` still shows a second `kicbase` copy with another ID, remove it with `docker rmi <id>`. To avoid this: keep the registry-pulled `kicbase` image (no `docker image prune -a`), and run `minikube stop` before quitting Docker Desktop. The digest above is for minikube v1.39.0; other versions print theirs in the `Loading ...` line.

### Useful commands

```powershell
kubectl get events -n antoniuk --sort-by=.lastTimestamp
kubectl logs deploy/<service> -n antoniuk --tail=100
kubectl exec -it deploy/<service> -n antoniuk -- sh
kubectl top pods -n antoniuk
```
