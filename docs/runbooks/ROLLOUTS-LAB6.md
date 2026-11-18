# ЛР 6 — команди для демонстрації (Argo Rollouts, canary)

Усі команди для **PowerShell**. Продовження ЛР 5: Argo CD бере все з [github.com/totalbyte/relativa-gitops](https://github.com/totalbyte/relativa-gitops), застосунок у namespace `antoniuk`.

Як це влаштовано і чому — [docs/ai-guides/GITOPS.md](../ai-guides/GITOPS.md) → «Progressive delivery», шаблон `Rollout` у чарті — [docs/ai-guides/HELM.md](../ai-guides/HELM.md). Позначка 📸 — місце для скріншота.

## 0. Підготовка терміналу

У кожному новому вікні:

```powershell
Set-Alias kubectl "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\Kubernetes.kubectl_Microsoft.Winget.Source_8wekyb3d8bbwe\kubectl.exe"
```

Окреме вікно на весь час роботи, потім вхід:

```powershell
kubectl -n argocd port-forward svc/argocd-server 8443:443
```

```powershell
argocd login localhost:8443 --username admin --insecure
```

Порти: **8443** — Argo CD, **8080** — gateway, **3000** — client, **3100** — дашборд Rollouts.

## 1. Контролер Argo Rollouts через Argo CD

**1a.** Версія чарту:

```powershell
helm repo add argo https://argoproj.github.io/argo-helm
helm search repo argo/argo-rollouts
```

`2.43.12` / `v1.10.2` — у `targetRevision` файлу `argocd-apps/argo-rollouts.yaml` (sync-wave `-1`, `controller.replicas: 1`). У `argocd-apps/relativa.yaml` додано `retry`, щоб застосунок сам дотягнувся, якщо прийде раніше за CRD.

**1b.** Окремим комітом, до `Rollout` у чарті:

```powershell
cd "D:\1Uni\4 course\1 semester\devops\relativa-gitops"
git add argocd-apps; git commit -m "Add Argo Rollouts controller"; git push
argocd app get root --refresh
argocd app get argo-rollouts
kubectl -n argo-rollouts get pods
kubectl get crd | Select-String argoproj
```

`argo-rollouts` — `Synced` / `Healthy`, под `1/1 Running`, нові CRD `rollouts`, `analysistemplates`, `analysisruns`, `experiments`, `clusteranalysistemplates`. Попередження `missing the kubectl.kubernetes.io/last-applied-configuration annotation` для агрегованих ClusterRole нешкідливі. 📸 вивід, UI: `root` → `argo-rollouts` і `relativa`.

**1c.** Плагін (`C:\Users\hp\.local\bin` є в PATH):

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.local\bin"
curl.exe -L -o "$env:USERPROFILE\.local\bin\kubectl-argo-rollouts.exe" https://github.com/argoproj/argo-rollouts/releases/download/v1.10.2/kubectl-argo-rollouts-windows-amd64
kubectl argo rollouts version
```

## 2–3. Rollout у чарті, стратегія canary

Чарт 0.3.0: `templates/gateway-rollout.yaml` (умова `gateway.rollout.enabled`), `gateway-deployment.yaml` обгорнутий в `if not`, спільний шаблон пода — `templates/_gateway-pod.tpl`. Стратегія — у `charts/relativa/values-minikube.yaml`:

```yaml
gateway:
  replicaCount: 5
  rollout:
    enabled: true
    strategy:
      canary:
        maxSurge: 1
        maxUnavailable: 0
        steps:
          - setWeight: 20
          - pause: {}
          - setWeight: 60
          - pause: {duration: 30s}
          - setWeight: 80
          - pause: {duration: 30s}
```

Перевірка до коміту:

```powershell
git diff --no-index --stat=200 --ignore-cr-at-eol ..\devops-practice\helm\relativa charts\relativa 2>$null
git --no-pager diff charts\relativa\values-minikube.yaml
helm template relativa charts/relativa -n antoniuk -f charts/relativa/values-minikube.yaml --skip-tests | Select-String '^kind: (Deployment|Rollout)' -Context 0,2 | ForEach-Object { $_.Line + '   ' + $_.Context.PostContext[1].Trim() }
```

Перша команда — лише `values-minikube.yaml`; остання — 9 Deployment-ів і `kind: Rollout   name: relativa-gateway`.

Перехід (вікно `-w` окремо):

```powershell
kubectl -n antoniuk get pods -l app.kubernetes.io/component=gateway -w
```

```powershell
git add charts; git commit -m "Run gateway as an Argo Rollout (canary)"; git push
argocd app get relativa --refresh
kubectl -n antoniuk get deploy,rollout -l app.kubernetes.io/component=gateway
kubectl argo rollouts get rollout relativa-gateway -n antoniuk
```

Deployment зник, Rollout 5/5, `Healthy`, `Step 6/6` (перша ревізія йде без кроків). Інші поди теж перезапускаються: нова версія чарту змінює checksum ConfigMap. Короткий простій gateway на переході нормальний. 📸 вікно `-w`, вивід плагіна, UI: фільтр Name `gateway` → Rollout → ReplicaSet → 5 подів.

**Чому canary.** Gateway — єдина точка входу API: canary віддає нову версію спершу 20 % запитів і зупиняється, blue-green перемикає все одразу. Gateway stateless, обидві версії працюють з тими самими бекендами — змішаний трафік безпечний. Canary потребує одного додаткового пода, blue-green — другого повного набору. Без service mesh вага = частка подів: 20/60/80 % при 5 репліках — рівно 1/3/4 нових поди. Blue-green краще пасував би до `client` (SPA), де сторінка однієї версії не повинна тягнути файли іншої.

## 4. Реліз через Git

Образи `1.3.0` і `1.4.0` збирає CI з тегів (код той самий, версія в `/version` — з тегу):

```powershell
cd "D:\1Uni\4 course\1 semester\devops\devops-practice"
git fetch origin; git tag v1.3.0 origin/main; git tag v1.4.0 origin/main
git push origin v1.3.0 v1.4.0
gh run list --limit 4
```

Окремі вікна:

```powershell
kubectl argo rollouts get rollout relativa-gateway -n antoniuk --watch
```

```powershell
kubectl argo rollouts dashboard
```

```powershell
kubectl -n antoniuk run curl --rm -it --restart=Never --image=curlimages/curl -- sh -c 'while true; do curl -s http://relativa-gateway:8080/version; echo; sleep 0.5; done'
```

Дашборд — http://localhost:3100. Запити тільки з поду: `port-forward` з'єднується з одним подом і розподілу не покаже.

У `relativa-gitops` у `charts/relativa/values-minikube.yaml` у блоці `gateway:` → `image:` змінити `tag: ""` → `tag: "1.3.0"`:

```powershell
cd "D:\1Uni\4 course\1 semester\devops\relativa-gitops"
git diff
git commit -am "Release gateway 1.3.0"; git push
argocd app get relativa --refresh
```

Пауза на `pause: {}`: `Step 1/6`, `SetWeight 20`, 1 под `canary` (1.3.0) + 4 `stable` (1.2.0); у циклі приблизно кожна п'ята відповідь — `"version":"1.3.0"`.

```powershell
argocd app get relativa | Select-Object -First 14
```

`Sync Status: Synced`, `Health Status: Suspended`. 📸 `--watch`, цикл запитів, дашборд, UI (фіолетова пауза).

```powershell
kubectl argo rollouts promote relativa-gateway -n antoniuk
```

60 % → 30 с → 80 % → 30 с → `Healthy` (~1 хв), у циклі лише `1.3.0`. В UI те саме — меню `Rollout` → `Resume` / `Promote-Full`. 📸 `Healthy`, `1.3.0 (stable)`.

## 5. Скасування релізу

`tag: "1.3.0"` → `tag: "1.4.0"`:

```powershell
git commit -am "Release gateway 1.4.0"; git push
argocd app get relativa --refresh
```

На першій паузі:

```powershell
kubectl argo rollouts abort relativa-gateway -n antoniuk
kubectl argo rollouts get rollout relativa-gateway -n antoniuk
argocd app get relativa | Select-Object -First 14
```

Rollout `Degraded` (`RolloutAborted`), canary ReplicaSet `ScaledDown`, усі 5 подів на `1.3.0`; Argo CD `Synced` / `Degraded`. 📸 вивід і UI.

**Чому `Synced` + `Degraded`.** `abort` змінює лише `status` Rollout-а, не `spec`: маніфест у кластері, як і раніше, дорівнює Git (там `1.4.0`) — `Synced`. Але бажана версія не розгорнута, кластер навмисно працює на старій — `Degraded`. `selfHeal` нічого не виправляє, бо розбіжності з Git немає. Завершуємо через Git:

```powershell
git log --oneline -3
git revert --no-edit HEAD; git push
argocd app get relativa --refresh
kubectl argo rollouts get rollout relativa-gateway -n antoniuk
```

`Healthy`, `1.3.0 (stable)` за кілька секунд, поди не перезапускаються. 📸 `git log`, `Healthy`.

Альтернатива: `kubectl argo rollouts retry rollout relativa-gateway -n antoniuk` — повторити той самий реліз з кроку 1, якщо проблему виправлено поза образом.

## 6. Захист: порядок показу

Перед парою: `minikube start`, port-forward на 8443, `argocd login`, вікна `--watch`, цикл `curl`, дашборд. Образи `1.2.0`, `1.3.0`, `1.4.0` у GHCR.

1. Реліз комітом → пауза (`Suspended`, 1/5 подів, змішані відповіді) → `promote` → `Healthy`.
2. Новий реліз → `abort` → `Synced` + `Degraded` → `git revert` → `Healthy`.

Наступний реліз на захисті — будь-який інший тег з трьох (`1.2.0` ↔ `1.3.0` ↔ `1.4.0`).

## Типові проблеми

- **`no matches for kind "Rollout"` / `SyncFailed`.** `relativa` синхронізувався раніше за CRD. Дочекатися `argo-rollouts` `Healthy`; `retry` дотягне сам, або `argocd app sync relativa`.
- **Реліз не стартує.** Rollout реагує лише на зміну шаблону пода (образ, змінні, мітки), не на `replicas` чи стратегію; push не в `main` або не натиснуто Refresh.
- **Canary «не ділить» трафік.** Запити через `port-forward` ідуть в один под — цикл тільки з поду в кластері.
- **`kubectl argo rollouts`: unknown command.** Плагін не в PATH або старий термінал — новий термінал і `Set-Alias`.
- **Canary-под `ImagePullBackOff`.** Тегу немає в GHCR — дочекатися зеленого CI для тегу.
