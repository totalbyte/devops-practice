{{- define "relativa.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "relativa.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{- define "relativa.componentName" -}}
{{- $root := index . 0 }}
{{- printf "%s-%s" (include "relativa.fullname" $root) (index . 1) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "relativa.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "relativa.selectorLabels" -}}
app.kubernetes.io/name: {{ include "relativa.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{- define "relativa.labels" -}}
helm.sh/chart: {{ include "relativa.chart" . }}
{{ include "relativa.selectorLabels" . }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: relativa
{{- end }}

{{- define "relativa.componentSelectorLabels" -}}
{{ include "relativa.selectorLabels" (index . 0) }}
app.kubernetes.io/component: {{ index . 1 }}
{{- end }}

{{- define "relativa.componentLabels" -}}
{{ include "relativa.labels" (index . 0) }}
app.kubernetes.io/component: {{ index . 1 }}
{{- end }}

{{- define "relativa.podLabels" -}}
{{ include "relativa.componentSelectorLabels" . }}
app.kubernetes.io/part-of: relativa
{{- end }}

{{- define "relativa.configMapName" -}}
{{- include "relativa.componentName" (list . "config") }}
{{- end }}

{{- define "relativa.secretName" -}}
{{- default (include "relativa.componentName" (list . "secrets")) .Values.secrets.existingSecret }}
{{- end }}

{{- define "relativa.migrationWaiterName" -}}
{{- include "relativa.componentName" (list . "migration-waiter") }}
{{- end }}

{{- define "relativa.migrationJobName" -}}
{{- $hash := include "relativa.migration.jobSpec" . | sha256sum | trunc 8 }}
{{- printf "%s-%s" (include "relativa.componentName" (list . "migration") | trunc 54 | trimSuffix "-") $hash }}
{{- end }}

{{- define "relativa.imageTag" -}}
{{- $root := index . 0 }}
{{- (index . 1).tag | default $root.Values.image.tag | default $root.Chart.AppVersion }}
{{- end }}

{{- define "relativa.appImage" -}}
{{- $root := index . 0 }}
{{- $image := index . 1 }}
{{- printf "%s/%s:%s" $root.Values.image.registry $image.repository (include "relativa.imageTag" .) }}
{{- end }}

{{- define "relativa.image" -}}
{{- printf "%s:%s" .repository .tag }}
{{- end }}

{{- define "relativa.frontendUrl" -}}
{{- if .Values.ingress.enabled }}
{{- printf "http://%s" .Values.ingress.hosts.client }}
{{- else }}
{{- .Values.config.urls.frontend }}
{{- end }}
{{- end }}

{{- define "relativa.gatewayUrl" -}}
{{- if .Values.ingress.enabled }}
{{- printf "http://%s" .Values.ingress.hosts.gateway }}
{{- else }}
{{- .Values.config.urls.gateway }}
{{- end }}
{{- end }}

{{- define "relativa.secretValue" -}}
{{- $root := index . 0 }}
{{- $key := index . 1 }}
{{- $value := index . 2 }}
{{- if $value }}
{{- $value }}
{{- else }}
{{- $existing := lookup "v1" "Secret" $root.Release.Namespace (include "relativa.secretName" $root) }}
{{- if and $existing $existing.data (hasKey $existing.data $key) }}
{{- index $existing.data $key | b64dec }}
{{- else }}
{{- randAlphaNum 48 }}
{{- end }}
{{- end }}
{{- end }}

{{- define "relativa.configChecksum" -}}
checksum/config: {{ include (print .Template.BasePath "/configmap.yaml") . | sha256sum }}
{{- end }}

{{- define "relativa.checksums" -}}
{{ include "relativa.configChecksum" . }}
checksum/secret: {{ toJson .Values.secrets | sha256sum }}
{{- end }}

{{- define "relativa.waitForMigration" -}}
- name: wait-for-migration
  image: {{ include "relativa.image" .Values.initImages.kubectl }}
  imagePullPolicy: {{ .Values.image.pullPolicy }}
  args: ["wait", "--for=condition=complete", "job/{{ include "relativa.migrationJobName" . }}", "--timeout=10m"]
  resources:
    {{- toYaml .Values.initResources.kubectl | nindent 4 }}
{{- end }}

{{- define "relativa.waitForRabbitmq" -}}
- name: wait-for-rabbitmq
  image: {{ include "relativa.image" .Values.initImages.busybox }}
  imagePullPolicy: {{ .Values.image.pullPolicy }}
  command: ["sh", "-c", "until nc -z \"$RABBITMQ_HOST\" \"$RABBITMQ_PORT\"; do sleep 2; done"]
  envFrom:
    - configMapRef:
        name: {{ include "relativa.configMapName" . }}
  resources:
    {{- toYaml .Values.initResources.busybox | nindent 4 }}
{{- end }}

{{- define "relativa.secretEnv" -}}
- name: {{ index . 1 }}
  valueFrom:
    secretKeyRef:
      name: {{ include "relativa.secretName" (index . 0) }}
      key: {{ index . 2 }}
{{- end }}
