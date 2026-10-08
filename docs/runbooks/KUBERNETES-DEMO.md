# ЛР 3 — команди для демонстрації (Kubernetes / minikube)

Усі команди для **PowerShell**, з кореня репозиторію. Виконувати по порядку.

## 0. Підготовка

`kubectl` з Docker Desktop (1.34) стоїть у PATH раніше за встановлений через winget (1.37), тому на початку кожної сесії терміналу задаємо коротке ім'я на правильний:

```powershell
Set-Alias kubectl 'C:\Users\hp\AppData\Local\Microsoft\WinGet\Packages\Kubernetes.kubectl_Microsoft.Winget.Source_8wekyb3d8bbwe\kubectl.exe'
kubectl version
```

Docker Desktop має бути запущений.

```powershell
minikube start --driver=docker --cpus=4 --memory=6144
minikube addons enable metrics-server
minikube addons enable ingress
```

Пункт 2 (стан кластера):

```powershell
minikube status
kubectl get nodes -o wide
kubectl get pods -n kube-system
minikube addons list
```

У файлі `C:\Windows\System32\drivers\etc\hosts` (вже додано) має бути рядок:

```
127.0.0.1 relativa.local api.relativa.local mail.relativa.local
```

**Окреме вікно терміналу**, не закривати під час демонстрації (дає доступ до Ingress на 127.0.0.1):

```powershell
minikube tunnel
```

**Ще одне окреме вікно** — спостереження за подами gateway наживо (корисно для п. 6–7):

```powershell
kubectl get pods -n antoniuk -l app.kubernetes.io/name=gateway -o wide -w
```

## 5. Розгортання

Розгортання з нуля (якщо namespace вже є і треба почати чисто — `kubectl delete namespace antoniuk`, дочекатися видалення):

```powershell
kubectl apply -f k8s/
```

Дочекатися, поки всі поди стануть `Running` (міграція — `Completed`), ~3–4 хв:

```powershell
kubectl get pods -n antoniuk -w
```

**5b.** Перелік об'єктів:

```powershell
kubectl get pods,deployments,replicasets,services -n antoniuk -o wide
kubectl get pvc,ingress,jobs,configmap,secret -n antoniuk
kubectl top pods -n antoniuk
```

**5c.** Браузер:

- http://relativa.local — застосунок (логін засідженим акаунтом)
- http://mail.relativa.local — MailHog (коди підтвердження email)
- http://api.relativa.local/scalar/v1 — Scalar (група *Gateway* → `/version`)

```powershell
curl.exe -s http://api.relativa.local/version
```

**5d.** Значення з ConfigMap і Secret у контейнері:

```powershell
kubectl get configmap relativa-config -n antoniuk -o jsonpath='{.data}'
kubectl describe secret relativa-secrets -n antoniuk
kubectl exec -n antoniuk deploy/auth -c auth -- printenv DB_HOST DB_NAME JWT_ISSUER SMTP_HOST APP_FRONTEND_BASE_URL
kubectl exec -n antoniuk deploy/auth -c auth -- printenv DB_PASS JWT_SECRET
kubectl exec -n antoniuk deploy/auth -c auth -- printenv ConnectionStrings__Default
kubectl exec -n antoniuk deploy/client -- printenv VITE_GATEWAY_URL
```

## 6. Керування життєвим циклом (на gateway)

**6a. Самовідновлення** — підставити ім'я одного з подів із `get pods`:

```powershell
kubectl get pods -n antoniuk -l app.kubernetes.io/name=gateway
kubectl delete pod <ім'я-пода-gateway> -n antoniuk
kubectl get pods -n antoniuk -l app.kubernetes.io/name=gateway
kubectl get events -n antoniuk --field-selector involvedObject.kind=ReplicaSet --sort-by=.lastTimestamp
```

**6b. Масштабування і розподіл трафіку:**

```powershell
kubectl scale deployment gateway --replicas=4 -n antoniuk
kubectl rollout status deployment/gateway -n antoniuk
kubectl get pods -n antoniuk -l app.kubernetes.io/name=gateway -o wide
1..40 | ForEach-Object { (curl.exe -s http://api.relativa.local/version | ConvertFrom-Json).instance } | Group-Object | Select-Object Count, Name
kubectl scale deployment gateway --replicas=2 -n antoniuk
```

**6c + 6e. Rolling update під навантаженням.** Спершу в **окремому вікні** запустити k6 (100 с, 10 запитів/с на `/version`):

```powershell
$env:DURATION = '100s'; k6 run tests/load/rollout-availability.js
```

Через ~10 с в основному вікні:

```powershell
kubectl set image deployment/gateway gateway=ghcr.io/totalbyte/relativa-gateway:1.1.0 -n antoniuk
kubectl annotate deployment/gateway kubernetes.io/change-cause="update to 1.1.0" --overwrite -n antoniuk
kubectl rollout status deployment/gateway -n antoniuk
kubectl get replicasets -n antoniuk -l app.kubernetes.io/name=gateway -o wide
curl.exe -s http://api.relativa.local/version
```

**6d. Історія і відкат** (поки k6 ще працює):

```powershell
kubectl rollout history deployment/gateway -n antoniuk
kubectl rollout history deployment/gateway -n antoniuk --revision=<номер ревізії з 1.1.0>
kubectl rollout undo deployment/gateway -n antoniuk
kubectl rollout status deployment/gateway -n antoniuk
kubectl rollout history deployment/gateway -n antoniuk
curl.exe -s http://api.relativa.local/version
```

**6e.** У підсумку k6 дивитися на `http_req_failed: 0.00%` і `checks 100%`, а також `responses_v1_0_0` / `responses_v1_1_0` — обидві версії відповідали, жоден запит не впав.

Необов'язково — оновити клієнт, щоб побачити `v1.1.0` внизу сторінки логіну (повернути: `kubectl apply -f k8s/42-client-deployment.yaml`):

```powershell
kubectl set image deployment/client client=ghcr.io/totalbyte/relativa-client:1.1.0 -n antoniuk
kubectl rollout status deployment/client -n antoniuk
kubectl exec -n antoniuk deploy/client -- printenv VITE_APP_VERSION
```

## 7. Діагностика

**7a. Неіснуючий тег → ImagePullBackOff:**

```powershell
kubectl set image deployment/gateway gateway=ghcr.io/totalbyte/relativa-gateway:9.9.9 -n antoniuk
kubectl annotate deployment/gateway kubernetes.io/change-cause="broken: nonexistent tag 9.9.9" --overwrite -n antoniuk
kubectl get pods -n antoniuk -l app.kubernetes.io/name=gateway
curl.exe -s http://api.relativa.local/version
```

Новий под — `ErrImagePull` → `ImagePullBackOff`; старі поди працюють (`maxUnavailable: 0`), тому `/version` відповідає.

**7b. Причина через describe і події** — підставити ім'я зламаного пода:

```powershell
kubectl describe pod <ім'я-зламаного-пода> -n antoniuk
kubectl get events -n antoniuk --field-selector involvedObject.name=<ім'я-зламаного-пода> --sort-by=.lastTimestamp
```

Шукати: `Failed to pull image "...:9.9.9": ... not found`.

**7c. Логи і вхід у контейнер:**

```powershell
kubectl logs <ім'я-зламаного-пода> -n antoniuk
kubectl logs <ім'я-робочого-пода-gateway> -n antoniuk --tail=20
kubectl exec -it <ім'я-робочого-пода-gateway> -n antoniuk -- bash
```

Усередині контейнера:

```bash
hostname
echo $APP_VERSION
printenv | grep -i jwt
ls /app | head
exit
```

**7d. Виправлення — повернути стан із маніфесту:**

```powershell
kubectl apply -f k8s/40-gateway-deployment.yaml
kubectl annotate deployment/gateway kubernetes.io/change-cause="fix: back to 1.0.0 from k8s/ manifest" --overwrite -n antoniuk
kubectl rollout status deployment/gateway -n antoniuk
kubectl get pods -n antoniuk
kubectl rollout history deployment/gateway -n antoniuk
curl.exe -s http://api.relativa.local/version
```

## Прибирання

```powershell
kubectl delete namespace antoniuk
minikube stop
```

`minikube delete` видаляє кластер повністю (разом з даними PVC).
