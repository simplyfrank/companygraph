{{/*
Expand the name of the chart.
*/}}
{{- define "companygraph.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "companygraph.fullname" -}}
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

{{/*
Chart name and version as used by the chart label.
*/}}
{{- define "companygraph.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels.
*/}}
{{- define "companygraph.labels" -}}
helm.sh/chart: {{ include "companygraph.chart" . }}
{{ include "companygraph.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: companygraph
{{- end }}

{{/*
Selector labels (must be stable — no version/chart churn).
*/}}
{{- define "companygraph.selectorLabels" -}}
app.kubernetes.io/name: {{ include "companygraph.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
ServiceAccount name.
*/}}
{{- define "companygraph.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "companygraph.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Name of the Secret the workloads consume — an externally-managed Secret when
secret.existingSecret is set, otherwise the chart-managed one.
*/}}
{{- define "companygraph.secretName" -}}
{{- if .Values.secret.existingSecret }}
{{- .Values.secret.existingSecret }}
{{- else }}
{{- printf "%s-secrets" (include "companygraph.fullname" .) }}
{{- end }}
{{- end }}

{{/*
ConfigMap name.
*/}}
{{- define "companygraph.configMapName" -}}
{{- printf "%s-config" (include "companygraph.fullname" .) }}
{{- end }}

{{/*
Component object names.
*/}}
{{- define "companygraph.api.fullname" -}}
{{- printf "%s-api" (include "companygraph.fullname" .) }}
{{- end }}
{{- define "companygraph.pwa.fullname" -}}
{{- printf "%s-pwa" (include "companygraph.fullname" .) }}
{{- end }}
{{- define "companygraph.neo4j.fullname" -}}
{{- printf "%s-neo4j" (include "companygraph.fullname" .) }}
{{- end }}
{{- define "companygraph.postgres.fullname" -}}
{{- printf "%s-postgres" (include "companygraph.fullname" .) }}
{{- end }}

{{/*
Resolved image references — component tag falls back to the chart appVersion.
*/}}
{{- define "companygraph.api.image" -}}
{{- printf "%s:%s" .Values.api.image.repository (default .Chart.AppVersion .Values.api.image.tag) }}
{{- end }}
{{- define "companygraph.pwa.image" -}}
{{- printf "%s:%s" .Values.pwa.image.repository (default .Chart.AppVersion .Values.pwa.image.tag) }}
{{- end }}

{{/*
Neo4j bolt URI the API connects to (in-chart service unless overridden).
*/}}
{{- define "companygraph.neo4jUri" -}}
{{- if .Values.neo4j.uri }}
{{- .Values.neo4j.uri }}
{{- else }}
{{- printf "bolt://%s:7687" (include "companygraph.neo4j.fullname" .) }}
{{- end }}
{{- end }}

{{/*
Postgres URI the API connects to. Uses the in-chart Postgres service when the
chart deploys Postgres; otherwise expects secret.postgres-uri to be provided.
*/}}
{{- define "companygraph.postgresUri" -}}
{{- printf "postgresql://%s:%s@%s:5432/%s" .Values.postgres.auth.user .Values.postgres.auth.password (include "companygraph.postgres.fullname" .) .Values.postgres.auth.database }}
{{- end }}
