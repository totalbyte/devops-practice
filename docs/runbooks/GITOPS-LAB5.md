# ЛР 5 — команди для демонстрації (GitOps, Argo CD)

Усі команди для **PowerShell**. Два репозиторії поруч:

- `devops-practice` — застосунок, CI, чарт `helm/relativa` (ЛР 1–4);
- `relativa-gitops` — опис розгортання, з якого Argo CD бере все: [github.com/totalbyte/relativa-gitops](https://github.com/totalbyte/relativa-gitops).

Як це влаштовано і чому — [docs/ai-guides/GITOPS.md](../ai-guides/GITOPS.md). Позначка 📸 — місце для скріншота.

## 0. Підготовка терміналу

На початку кожної сесії (як у ЛР 3–4):

```powershell
Set-Alias kubectl "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\Kubernetes.kubectl_Microsoft.Winget.Source_8wekyb3d8bbwe\kubectl.exe"
```

Порти на хості: **8443** — Argo CD, **8080** — gateway, **3000** — client. Argo CD не можна вішати на 8080, як в офіційному getting started: SPA звертається до gateway саме на `localhost:8080`.

## 1. Репозиторій конфігурації (варіант a)

**1a.** Структура:

```powershell
cd "D:\1Uni\4 course\1 semester\devops\relativa-gitops"
tree /F /A bootstrap argocd-apps
Get-Content bootstrap\root.yaml
Get-Content argocd-apps\relativa.yaml
Get-Content charts\relativa\values-minikube.yaml
```

📸 дерево і три файли.

**1b.** Чарт — та сама копія, що в `helm/relativa` (ЛР4 + `progressDeadlineSeconds`):

```powershell
git diff --no-index --stat --ignore-cr-at-eol ..\devops-practice\helm\relativa charts\relativa 2>$null
```

Очікувано один рядок: `/dev/null => charts/relativa/values-minikube.yaml | 37 +++`, тобто решта файлів однакові.

**1c.** Паролів у Git немає: Secret не рендериться, Deployment посилається на `relativa-secrets`:

```powershell
helm template relativa charts/relativa -n antoniuk -f charts/relativa/values-minikube.yaml --skip-tests | Select-String '^kind: Secret'
helm template relativa charts/relativa -n antoniuk -f charts/relativa/values-minikube.yaml --skip-tests --show-only templates/auth-deployment.yaml | Select-String -Context 1,1 'relativa-secrets' | Select-Object -First 2
```

Перша команда нічого не виводить.

**1d.** Публікація (один раз):

```powershell
git add .
git commit -m "Deploy relativa via Argo CD"
gh repo create totalbyte/relativa-gitops --public --source . --remote origin --push
git log --oneline
```

## 2. Образ у реєстрі, версія

**2a.** Образи `1.1.0` уже в GHCR (з ЛР3) і публічні. Нова версія `1.2.0` (версія в бічній панелі після входу) збирається CI з тегу:

```powershell
cd "D:\1Uni\4 course\1 semester\devops\devops-practice"
git checkout main
git pull
git tag v1.2.0
git push origin v1.2.0
gh run watch
```

Тег ставиться на `main` після злиття PR `feature/lab5-gitops`. 📸 запуск CI з `Publish · …`, сторінка пакета в GHCR з тегом `1.2.0`.

**2b.** Образ публічний: кластер тягне його без `imagePullSecrets` і без `minikube image load`:

```powershell
docker manifest inspect ghcr.io/totalbyte/relativa-gateway:1.2.0 | Select-String mediaType | Select-Object -First 1
```

Версію показують: `GET /version` у gateway (`{"service":"relativa-gateway","version":"1.1.0",…}`), футер сторінки входу (`v1.1.0`) і, з `1.2.0`, бічна панель (`Relativa v1.2.0`). Версія вшита в образ при збірці (`APP_VERSION` = тег релізу).

## 3. Встановлення Argo CD

**3a.** Кластер і стан після ЛР4 (namespace `antoniuk` порожній або відсутній, релізів Helm немає):

```powershell
minikube start --driver=docker --cpus=4 --memory=6144
kubectl get nodes
helm list -A
kubectl get all,pvc -n antoniuk
```

**3b.** Argo CD (версія зафіксована, `stable` = v3.5.6 на 28.10.2026):

```powershell
kubectl create namespace argocd
kubectl apply -n argocd --server-side --force-conflicts -f https://raw.githubusercontent.com/argoproj/argo-cd/v3.5.6/manifests/install.yaml
kubectl -n argocd get pods -w
```

Дочекатися `Running` / `1/1` у всіх семи подів (~2 хв), `Ctrl+C`. 📸 `kubectl -n argocd get pods`.

**3c.** CLI (після встановлення відкрити **новий** термінал, щоб оновився PATH):

```powershell
winget install --id argoproj.argocd --version 3.5.6
argocd version --client
```

**3d.** Вхід і зміна пароля. Окреме вікно на весь час роботи:

```powershell
kubectl -n argocd port-forward svc/argocd-server 8443:443
```

В основному:

```powershell
argocd admin initial-password -n argocd
argocd login localhost:8443 --username admin --insecure
argocd account update-password
kubectl -n argocd delete secret argocd-initial-admin-secret
```

`update-password` питає поточний (початковий) пароль і новий. Інтерфейс: https://localhost:8443 (браузер попередить про самопідписаний сертифікат → «Додатково» → «Перейти»), вхід `admin` / новий пароль. 📸 сторінка входу, порожній список Applications.

Репозиторій публічний — `argocd repo add` не потрібен.

## 4. Застосунок під керуванням Argo CD (App of Apps)

**4a.** Secret — єдиний об'єкт у `antoniuk`, який створюється вручну (паролі генеруються тут і ніде не зберігаються):

```powershell
kubectl create namespace antoniuk
function New-Pass { -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 40 | ForEach-Object { [char]$_ }) }
kubectl -n antoniuk create secret generic relativa-secrets "--from-literal=DB_PASS=$(New-Pass)" "--from-literal=RABBITMQ_PASS=$(New-Pass)" "--from-literal=JWT_SECRET=$(New-Pass)"
kubectl -n antoniuk get secret relativa-secrets
```

Якщо namespace лишився з ЛР4 — `AlreadyExists` для першої команди нормальний.

**4b.** Єдиний ручний `apply`:

```powershell
cd "D:\1Uni\4 course\1 semester\devops\relativa-gitops"
kubectl apply -f bootstrap/root.yaml
argocd app list
```

`root` з'являється одразу, `relativa` — через кілька секунд (його створює `root` з `argocd-apps/`). Окреме вікно:

```powershell
kubectl -n antoniuk get pods -w
```

Перший запуск ~2–4 хв: postgres/rabbitmq → Job міграції → бекенди. Потім:

```powershell
argocd app list
argocd app get relativa
kubectl -n antoniuk get pods,jobs
helm list -n antoniuk
```

Очікувано: обидва `Synced` / `Healthy`; `helm list` порожній — Argo CD лише рендерить шаблони, релізу Helm немає. 📸 `argocd app list`, у UI: плитки `root` і `relativa`, `root` → дерево з `relativa`, `relativa` → дерево об'єктів (Deployments → ReplicaSets → Pods, Job, Services, PVC), усе зелене.

**4c.** Доступ — кожна команда в окремому вікні:

```powershell
kubectl -n antoniuk port-forward svc/relativa-gateway 8080:8080
kubectl -n antoniuk port-forward svc/relativa-client 3000:3000
```

```powershell
curl.exe -s http://localhost:8080/version
```

`"version":"1.1.0"`. http://localhost:3000 — у футері `v1.1.0`, вхід `admin@relativa.com` / `Demo1234!`; у бічній панелі версії ще немає. 📸

## 5. Оновлення через Git

У `charts/relativa/values-minikube.yaml` (у редакторі) змінити `tag: "1.1.0"` → `tag: "1.2.0"` у блоці `image:`.

```powershell
git diff
git commit -am "Release relativa 1.2.0"
git push
argocd app get relativa --refresh
```

У вікні `-w` — нові поди всіх семи сервісів і новий Job міграції, старі зникають (~1.5 хв). В UI: Refresh → `OutOfSync` → синхронізація сама → `Synced` / `Healthy`, у дереві нові ReplicaSet-и. 📸 UI під час і після.

Port-forward-и обриваються, коли под замінено, — перезапустити обидва, потім:

```powershell
argocd app get relativa
kubectl -n antoniuk get deploy -o custom-columns=NAME:.metadata.name,IMAGE:.spec.template.spec.containers[0].image
curl.exe -s http://localhost:8080/version
```

`"version":"1.2.0"`; http://localhost:3000 (Ctrl+F5) — після входу в бічній панелі під іменем користувача `Relativa v1.2.0`. 📸

## 6. Дрейф, Health і відкат

Окреме вікно на весь пункт:

```powershell
kubectl -n antoniuk get pods -l app.kubernetes.io/component=gateway -w
```

**6a.** Без `selfHeal`:

```powershell
kubectl -n antoniuk scale deployment relativa-gateway --replicas=5
argocd app get relativa --refresh
argocd app diff relativa
kubectl -n antoniuk get deploy relativa-gateway
```

`Sync Status: OutOfSync`, у diff — `replicas: 1` проти `5`, реплік лишається 5 (автосинхронізація реагує лише на зміни в Git). 📸 UI: `relativa` жовтий `OutOfSync`, Deployment `relativa-gateway` позначений.

У `argocd-apps/relativa.yaml` (у редакторі):

```yaml
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
```

```powershell
git diff
git commit -am "Enable selfHeal for relativa"
git push
argocd app get root --refresh
```

`root` застосовує змінений `Application` сам, і `relativa` одразу повертає наявний дрейф: 5 → 1 (у вікні `-w` чотири поди `Terminating`). Повторити ручну зміну:

```powershell
kubectl -n antoniuk scale deployment relativa-gateway --replicas=5
kubectl -n antoniuk get deploy relativa-gateway
argocd app get relativa
```

За ~1 с знову 1 репліка: нові поди з'являються й одразу зникають у вікні `-w`. 📸 вікно `-w` і `Synced`.

**6b.** Неіснуючий тег (лише для gateway, щоб решта стеку не зачіпалась). У `values-minikube.yaml` у блоці `gateway:` змінити `tag: ""` → `tag: "9.9.9"`:

```powershell
git diff
git commit -am "Release gateway 9.9.9"
git push
argocd app get relativa --refresh
```

Через ~1 хв (`gateway.progressDeadlineSeconds: 60`):

```powershell
argocd app get relativa
kubectl -n antoniuk get pods -l app.kubernetes.io/component=gateway
curl.exe -s http://localhost:8080/version
```

`Sync Status: Synced` (маніфест у кластері = Git), `Health Status: Degraded`; новий под `ImagePullBackOff`, старий `Running` — `curl` усе ще відповідає `1.2.0` (`maxUnavailable: 0`). До спливання дедлайну — `Progressing`. 📸 UI: `Synced` + червоне серце `Degraded`, под з `ImagePullBackOff` у дереві.

**6c.** Відкат — комітом, не кластером:

```powershell
git log --oneline
git revert --no-edit HEAD
git push
argocd app get relativa --refresh
argocd app history relativa
git log --oneline
curl.exe -s http://localhost:8080/version
```

`Synced` / `Healthy` за кілька секунд, под з `9.9.9` прибрано. `history` — по рядку на кожну синхронізацію з SHA коміту, ті самі SHA, що в `git log`. 📸 `git log` і `argocd app history` поруч.

`argocd app rollback` з увімкненою автосинхронізацією Argo CD не виконує, а без неї повернув би стан із Git при наступній синхронізації, тому відкат — тільки комітом.

## 7. Захист: порядок показу

Перед парою: `minikube start`, `Set-Alias kubectl …`, вікна з port-forward на 8443, 8080, 3000, `argocd login localhost:8443 --username admin --insecure`. Образи `1.1.0` і `1.2.0` уже в GHCR.

1. UI: `root` → `relativa` → дерево, `Synced` / `Healthy`.
2. Реліз: тег у `values-minikube.yaml` → commit → push → Refresh → `curl.exe -s http://localhost:8080/version`. На захисті можна перемикати `1.2.0` ↔ `1.1.0`.
3. `kubectl scale … --replicas=5` → повертається до 1 (`selfHeal`).
4. `gateway.image.tag: "9.9.9"` → `Synced` + `Degraded` → `git revert` → `Healthy`.

Якщо попросять змінити інше значення — усе в `charts/relativa/values-minikube.yaml`, далі `commit` → `push` → `argocd app get relativa --refresh`:

| Що змінити | Як | Перевірка |
|---|---|---|
| Репліки | `client:` → `replicaCount: 2` | `kubectl -n antoniuk get deploy relativa-client` |
| Змінна оточення | додати `config:` → `smtp:` → `fromName: Relativa CRM` | `kubectl -n antoniuk get configmap relativa-config -o jsonpath='{.data.SMTP_FROM_NAME}'`; поди з цією ConfigMap перезапускаються (анотація `checksum/config`) |
| Тег одного сервісу | `<service>:` → `image:` → `tag: "1.1.0"` | `kubectl -n antoniuk get deploy -o custom-columns=NAME:.metadata.name,IMAGE:.spec.template.spec.containers[0].image` |

## Типові проблеми

- **Зміна не приїхала.** Push не в `main` (`targetRevision`), або Argo CD ще не опитав Git (до 3 хв) — `argocd app get relativa --refresh` / кнопка Refresh.
- **`argocd: command not found`** після `winget install` — новий термінал.
- **`argocd login` висить або `connection refused`** — не запущено port-forward на 8443; якщо gRPC не проходить — додати `--grpc-web`.
- **Поди бекендів у `CreateContainerConfigError`** — немає Secret `relativa-secrets` або в ньому не ті ключі (`DB_PASS`, `RABBITMQ_PASS`, `JWT_SECRET`).
- **Ручний `helm install` / `kubectl apply -f k8s/` поруч з Argo CD** — два джерела правди; у `antoniuk` має працювати лише Argo CD.
