{{/*
Expand the name of the chart.
*/}}
{{- define "asynchrone-space.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "asynchrone-space.fullname" -}}
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
Chart name and version label.
*/}}
{{- define "asynchrone-space.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels.
*/}}
{{- define "asynchrone-space.labels" -}}
helm.sh/chart: {{ include "asynchrone-space.chart" . }}
{{ include "asynchrone-space.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels.
*/}}
{{- define "asynchrone-space.selectorLabels" -}}
app.kubernetes.io/name: {{ include "asynchrone-space.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Migration image. `migrate.image.tag` wins over `global.imageTag`.
*/}}
{{- define "asynchrone-space.migrate.image" -}}
{{- $tag := .Values.migrate.image.tag -}}
{{- if not $tag }}
{{- $global := index .Values "global" | default dict -}}
{{- $tag = index $global "imageTag" | default "" -}}
{{- end }}
{{- if not $tag }}
{{- fail "migrate.image.tag or global.imageTag must be set" -}}
{{- end }}
{{- printf "%s:%s" .Values.migrate.image.repository $tag -}}
{{- end }}

{{/*
Merged image pull secrets from the local chart values and global values.
*/}}
{{- define "asynchrone-space.imagePullSecrets" -}}
{{- $globalValues := index .Values "global" | default dict -}}
{{- $global := index $globalValues "imagePullSecrets" | default (list) -}}
{{- $local := .Values.migrate.imagePullSecrets | default (list) -}}
{{- $merged := concat $global $local | uniq -}}
{{- $normalized := list -}}
{{- range $merged -}}
{{- if kindIs "string" . -}}
{{- $normalized = append $normalized (dict "name" .) -}}
{{- else -}}
{{- $normalized = append $normalized . -}}
{{- end -}}
{{- end -}}
{{- if $normalized }}
{{- toYaml $normalized -}}
{{- end }}
{{- end }}

{{/*
Service account used by the migration Job.
*/}}
{{- define "asynchrone-space.migrate.serviceAccountName" -}}
{{- if .Values.migrate.serviceAccount.create }}
{{- default (printf "%s-migrate" (include "asynchrone-space.fullname" .)) .Values.migrate.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.migrate.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Secret that holds DATABASE_URL for migrations.
*/}}
{{- define "asynchrone-space.migrate.secretName" -}}
{{- $copilotSecret := "" -}}
{{- $copilot := index .Values "asynchrone-space-copilot" | default dict -}}
{{- $copilotSecretConfig := index $copilot "secret" | default dict -}}
{{- $copilotSecret = index $copilotSecretConfig "existingSecret" | default "" -}}
{{- default $copilotSecret .Values.migrate.existingSecret -}}
{{- end }}
