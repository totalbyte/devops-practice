# ЛР 4 — команди для демонстрації (Helm-чарт)

Усі команди для **PowerShell**, з кореня репозиторію. Виконувати по порядку. Чарт — [`helm/relativa/`](../../helm/relativa/), опис параметрів — [helm/relativa/README.md](../../helm/relativa/README.md).

## 0. Підготовка терміналу

На початку кожної сесії (як у ЛР3 — `kubectl` з Docker Desktop застарий):

```powershell
Set-Alias kubectl "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\Kubernetes.kubectl_Microsoft.Winget.Source_8wekyb3d8bbwe\kubectl.exe"
```

Файли для `git diff` записувати через `Out-File -Encoding utf8`: у Windows PowerShell 5.1 оператор `>` пише UTF-16, і git вважає такий файл двійковим.

## 1. Середовище

**1a.** Helm 3 (winget за замовчуванням ставить 4.x, тому версія вказана явно; `pin` не дає `winget upgrade` підняти її до 4):

```powershell
winget install --id Helm.Helm --version 3.20.0
winget pin add --id Helm.Helm --version 3.*
helm version
```

**1b.** Кластер:

```powershell
minikube start --driver=docker --cpus=4 --memory=6144
minikube addons enable metrics-server
minikube addons enable ingress
minikube status
kubectl get nodes -o wide
```

**1c.** Маніфести ЛР3 розгортаються і працюють:

```powershell
kubectl apply -f k8s/
kubectl wait --for=condition=available deployment --all -n antoniuk --timeout=8m
kubectl get pods -n antoniuk
```

**1d.** Видалити реліз ЛР3 (інакше об'єкти без префікса `relativa-` лишаться поруч з чартом):

```powershell
kubectl delete namespace antoniuk
kubectl get namespaces
kubectl get pv
```

Якщо PV лишився `Released` — provisioner minikube після перезапуску не видаляє «чужі» томи: `kubectl delete pv <ім'я>` і `minikube ssh -- sudo rm -rf /tmp/hostpath-provisioner/antoniuk`.

## 2. Структура чарта

```powershell
tree /F helm\relativa
Get-Content helm\relativa\Chart.yaml
helm show chart helm/relativa
```

`version` vs `appVersion` — розділ *Chart version vs app version* у [README чарта](../../helm/relativa/README.md).

## 3–5. Шаблони, values.yaml, helpers, NOTES

Показати в редакторі: `templates/gateway-deployment.yaml` (імена через `include "relativa.componentName"`, `.Values.gateway.replicaCount`, образ через `relativa.appImage`), `templates/secret.yaml`, `values.yaml`, `templates/_helpers.tpl`.

У шаблонах немає жорстко прописаних тегів, реплік, namespace і реєстру (порожній вивід):

```powershell
Select-String -Path helm\relativa\templates\*.yaml -Pattern '1\.0\.0|1\.1\.0|replicas: \d|antoniuk|ghcr\.io'
```

NOTES.txt без встановлення:

```powershell
helm install relativa helm/relativa -n default --dry-run=server | Select-String -Pattern '^NOTES:' -Context 0,45
```

## 6. Два середовища

**6a.** `helm\relativa\values-dev.yaml` і `helm\relativa\values-prod.yaml`: тег (`1.1.0` / `1.0.0`), репліки (1 / 2), ресурси, `ingress.enabled` (false / true).

**6b.** Різниця без встановлення (паролі зафіксовано, бо без кластера `helm template` щоразу генерує нові):

```powershell
$same = 'secrets.dbPassword=x,secrets.rabbitmqPassword=x,secrets.jwtSecret=x'
helm template relativa helm/relativa -n antoniuk -f helm/relativa/values-dev.yaml --set $same | Out-File -Encoding utf8 $env:TEMP\relativa-dev.yaml
helm template relativa helm/relativa -n antoniuk -f helm/relativa/values-prod.yaml --set $same | Out-File -Encoding utf8 $env:TEMP\relativa-prod.yaml
git diff --no-index --stat $env:TEMP\relativa-dev.yaml $env:TEMP\relativa-prod.yaml
git diff --no-index $env:TEMP\relativa-dev.yaml $env:TEMP\relativa-prod.yaml
```

Очікувано `103 insertions(+), 50 deletions(-)`: URL у ConfigMap, `replicas`, `image`, `resources`, `checksum/config`, назва Job міграції, увесь Ingress (у переглядачі: пробіл — далі, `G` — у кінець, `q` — вихід).

**6c.** Пріоритет: `values.yaml` < файли `-f` (останній перемагає) < `--set` (завжди):

```powershell
function gw { helm template relativa helm/relativa @args --show-only templates/gateway-deployment.yaml | Select-String '^  replicas:|image: ghcr' }
gw
gw -f helm/relativa/values-prod.yaml
gw -f helm/relativa/values-prod.yaml -f helm/relativa/values-dev.yaml
gw --set gateway.replicaCount=3 -f helm/relativa/values-prod.yaml
```

Очікувано: 1/`1.1.0`, 2/`1.0.0`, 1/`1.1.0`, 3/`1.0.0`.

## 7. Перевірка і встановлення

**7a.**

```powershell
helm lint helm/relativa --strict -f helm/relativa/values-dev.yaml
helm lint helm/relativa --strict -f helm/relativa/values-prod.yaml
helm install relativa helm/relativa -n default -f helm/relativa/values-dev.yaml --dry-run=server
```

**7b.** Набір об'єктів проти ЛР3 (29 проти 28 — Namespace у Helm створює `--create-namespace`):

```powershell
$lab3 = kubectl create --dry-run=client -f k8s/ -o name
$chart = helm template relativa helm/relativa -n antoniuk -f helm/relativa/values-prod.yaml | kubectl create --dry-run=client -f - -o name
"ЛР3: $($lab3.Count) об'єктів, чарт: $($chart.Count)"
Compare-Object ($lab3 | % { ($_ -split '/')[0] }) ($chart | % { ($_ -split '/')[0] })
helm template relativa helm/relativa -n antoniuk -f helm/relativa/values-prod.yaml --show-only templates/gateway-deployment.yaml | Out-File -Encoding utf8 $env:TEMP\gw-chart.yaml
git diff --no-index k8s\40-gateway-deployment.yaml $env:TEMP\gw-chart.yaml
```

**7c.** Встановлення (dev):

```powershell
helm install relativa helm/relativa -n antoniuk --create-namespace -f helm/relativa/values-dev.yaml --wait --timeout 10m
kubectl get pods,svc,pvc,jobs -n antoniuk
```

Доступ — кожну команду в окремому вікні (вони «висять», поки тунель відкритий):

```powershell
kubectl port-forward -n antoniuk svc/relativa-client 3000:3000
kubectl port-forward -n antoniuk svc/relativa-gateway 8080:8080
```

http://localhost:8080/version (`1.1.0`), http://localhost:3000 (у футері `v1.1.0`), вхід `admin@relativa.com` / `Demo1234!`.

**7d.**

```powershell
helm list -n antoniuk
helm status relativa -n antoniuk
helm get values relativa -n antoniuk
helm get values relativa -n antoniuk --all
```

**7e.** Стан релізу — Secret на кожну ревізію:

```powershell
kubectl get secrets -n antoniuk -l owner=helm --show-labels
$b64 = kubectl get secret sh.helm.release.v1.relativa.v1 -n antoniuk -o jsonpath='{.data.release}'
$gz = [Convert]::FromBase64String([Text.Encoding]::ASCII.GetString([Convert]::FromBase64String($b64)))
$gs = New-Object IO.Compression.GZipStream((New-Object IO.MemoryStream(,$gz)), [IO.Compression.CompressionMode]::Decompress)
$rel = (New-Object IO.StreamReader($gs)).ReadToEnd() | ConvertFrom-Json
$rel | Select-Object name, namespace, version, @{n='status';e={$_.info.status}}, @{n='chart';e={$_.chart.metadata.name + '-' + $_.chart.metadata.version}}, @{n='appVersion';e={$_.chart.metadata.appVersion}}
$rel.config | ConvertTo-Json -Depth 5
```

## 8. Життєвий цикл релізу

Окреме вікно на весь пункт:

```powershell
kubectl get pods -n antoniuk -w
```

**8a.** `--set` (лише gateway → `1.0.0`; `--reuse-values` зберігає dev-значення):

```powershell
helm upgrade relativa helm/relativa -n antoniuk --reuse-values --set gateway.image.tag=1.0.0 --wait --description "8a: gateway image 1.0.0 via --set"
kubectl get deploy -n antoniuk -o custom-columns=NAME:.metadata.name,IMAGE:.spec.template.spec.containers[0].image
curl.exe -s http://localhost:8080/version
```

Тунель до gateway після заміни пода треба перезапустити.

**8b.** Файл іншого середовища (у окремому вікні `minikube tunnel`; у hosts — `127.0.0.1 relativa.local api.relativa.local mail.relativa.local`):

```powershell
helm upgrade relativa helm/relativa -n antoniuk -f helm/relativa/values-prod.yaml --wait --timeout 10m --description "8b: switch to values-prod.yaml"
kubectl get pods,jobs,ingress -n antoniuk
curl.exe -s http://api.relativa.local/version
```

http://relativa.local — client `1.0.0`, у футері версії немає (вона з'явилася в `1.1.0`).

**8c.** Історія і що змінювалось:

```powershell
helm history relativa -n antoniuk
helm get values relativa -n antoniuk --revision 1
helm get values relativa -n antoniuk --revision 2
helm get values relativa -n antoniuk --revision 3
helm get manifest relativa -n antoniuk --revision 1 | Out-File -Encoding utf8 $env:TEMP\rev1.yaml
helm get manifest relativa -n antoniuk --revision 2 | Out-File -Encoding utf8 $env:TEMP\rev2.yaml
git diff --no-index $env:TEMP\rev1.yaml $env:TEMP\rev2.yaml
```

1 → 2: лише рядок `image:` gateway. 2 → 3: репліки, ресурси, теги, Ingress, URL у ConfigMap, новий Job міграції.

**8d.** Відкат — нова ревізія 4 «Rollback to 2» з маніфестом ревізії 2, Ingress видаляється:

```powershell
helm rollback relativa 2 -n antoniuk --wait --timeout 10m
helm history relativa -n antoniuk
kubectl get pods,jobs,ingress -n antoniuk
kubectl get secrets -n antoniuk -l owner=helm
helm get manifest relativa -n antoniuk --revision 4 | Out-File -Encoding utf8 $env:TEMP\rev4.yaml
git diff --no-index $env:TEMP\rev2.yaml $env:TEMP\rev4.yaml
```

Останній diff порожній.

**8e.** Видалення однією командою:

```powershell
helm uninstall relativa -n antoniuk --wait
helm list -n antoniuk
kubectl get all,configmap,secret,pvc,ingress,serviceaccount,role,rolebinding -n antoniuk
kubectl get pv
```

Лишаються тільки `configmap/kube-root-ca.crt` і `serviceaccount/default` — Kubernetes створює їх у кожному namespace.

## 9. Хук і тест релізу (варіант b)

Показати в редакторі `templates/backup-hook-job.yaml` (`helm.sh/hook: pre-upgrade`, `pg_dump`) і `templates/tests/test-gateway.yaml` (`helm.sh/hook: test`).

```powershell
helm install relativa helm/relativa -n antoniuk -f helm/relativa/values-dev.yaml --wait --timeout 10m
helm test relativa -n antoniuk
```

Два `TEST SUITE`, обидва `Phase: Succeeded`.

Хук — у окремому вікні (`-w` приймає лише один тип ресурсу):

```powershell
kubectl get jobs -n antoniuk -w
```

В основному:

```powershell
helm upgrade relativa helm/relativa -n antoniuk --reuse-values --set gateway.image.tag=1.0.0 --wait
kubectl exec -n antoniuk deploy/relativa-postgres -- ls -l /backups
helm test relativa -n antoniuk
```

У вікні `-w`: `relativa-backup Running → Complete` до оновлення gateway; на томі — `relativa-before-rev2-<дата>.dump`. Якщо не встигли побачити Job (він видаляється після успіху):

```powershell
kubectl get events -n antoniuk --field-selector involvedObject.name=relativa-backup --sort-by=.lastTimestamp
```

Тест ловить зміну поза Helm:

```powershell
kubectl set image deployment/relativa-gateway gateway=ghcr.io/totalbyte/relativa-gateway:1.1.0 -n antoniuk
kubectl rollout status deployment/relativa-gateway -n antoniuk
helm test relativa -n antoniuk
kubectl logs -n antoniuk relativa-test-gateway
helm upgrade relativa helm/relativa -n antoniuk --reuse-values --wait
helm test relativa -n antoniuk
```

`Phase: Failed` і `FAIL: gateway should run 1.0.0`; `helm upgrade` повертає образ із маніфесту, тест знову проходить і прибирає впалий под.

Прибирання:

```powershell
helm uninstall relativa -n antoniuk --wait
minikube stop
```
