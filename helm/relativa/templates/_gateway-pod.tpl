{{- define "relativa.gateway.podTemplate" -}}
metadata:
  labels:
    {{- include "relativa.podLabels" (list . "gateway") | nindent 4 }}
  annotations:
    {{- include "relativa.checksums" . | nindent 4 }}
spec:
  containers:
    - name: gateway
      image: {{ include "relativa.appImage" (list . .Values.gateway.image) }}
      imagePullPolicy: {{ .Values.image.pullPolicy }}
      ports:
        - name: http
          containerPort: 8080
      envFrom:
        - configMapRef:
            name: {{ include "relativa.configMapName" . }}
      env:
        {{- include "relativa.secretEnv" (list . "JWT_SECRET" "JWT_SECRET") | nindent 8 }}
        - name: ASPNETCORE_URLS
          value: http://+:8080
        - name: Jwt__SecretKey
          value: $(JWT_SECRET)
        - name: Jwt__Issuer
          value: $(JWT_ISSUER)
        - name: Jwt__Audience
          value: $(JWT_AUDIENCE)
        - name: Cors__Origins__0
          value: $(CORS_ORIGIN)
        - name: Cors__AllowAnyOriginForDev
          value: "false"
        - name: Gateway__PublicBaseUrl
          value: $(GATEWAY_PUBLIC_URL)
        {{- range $component := list "auth" "core" "graph" "ml" "audit" }}
        - name: ReverseProxy__Clusters__{{ $component }}__Destinations__d1__Address
          value: http://{{ include "relativa.componentName" (list $ $component) }}:{{ (index $.Values $component).service.port }}/
        {{- end }}
      resources:
        {{- toYaml .Values.gateway.resources | nindent 8 }}
      readinessProbe:
        httpGet:
          path: /health
          port: http
        initialDelaySeconds: 3
        periodSeconds: 3
        timeoutSeconds: 3
        failureThreshold: 2
      livenessProbe:
        httpGet:
          path: /health
          port: http
        initialDelaySeconds: 15
        periodSeconds: 10
        timeoutSeconds: 3
        failureThreshold: 3
{{- end }}
