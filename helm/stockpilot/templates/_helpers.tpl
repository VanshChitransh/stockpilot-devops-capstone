{{/* common labels; component is passed in as "backend", "frontend" or "postgres" */}}
{{- define "stockpilot.labels" -}}
app.kubernetes.io/name: stockpilot
app.kubernetes.io/instance: {{ .root.Release.Name }}
app.kubernetes.io/component: {{ .component }}
app.kubernetes.io/version: {{ .root.Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .root.Release.Service }}
helm.sh/chart: {{ .root.Chart.Name }}-{{ .root.Chart.Version }}
{{- end }}

{{/* selector labels must never change after install, so they're kept minimal */}}
{{- define "stockpilot.selector" -}}
app.kubernetes.io/name: stockpilot
app.kubernetes.io/instance: {{ .root.Release.Name }}
app.kubernetes.io/component: {{ .component }}
{{- end }}

{{- define "stockpilot.podSecurity" -}}
securityContext:
  runAsNonRoot: true
  seccompProfile: {type: RuntimeDefault}
{{- end }}

{{- define "stockpilot.containerSecurity" -}}
securityContext:
  allowPrivilegeEscalation: false
  capabilities: {drop: [ALL]}
{{- end }}
