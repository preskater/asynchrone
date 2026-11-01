{{/*
Expand the name of the chart.
*/}}
{{- define "asynchrone-space-projects.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
We truncate at 63 chars because some Kubernetes name fields are limited to this
(by the DNS naming spec). If the release name already contains the chart name,
it is used as the full name.
*/}}
{{- define "asynchrone-space-projects.fullname" -}}
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
Create chart name and version as used by the chart label.
*/}}
{{- define "asynchrone-space-projects.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels.
*/}}
{{- define "asynchrone-space-projects.labels" -}}
helm.sh/chart: {{ include "asynchrone-space-projects.chart" . }}
{{ include "asynchrone-space-projects.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels.
*/}}
{{- define "asynchrone-space-projects.selectorLabels" -}}
app.kubernetes.io/name: {{ include "asynchrone-space-projects.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the name of the service account to use.
*/}}
{{- define "asynchrone-space-projects.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "asynchrone-space-projects.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Fully qualified image reference. `image.tag` wins over `global.imageTag` so the
chart can be installed standalone as well as from the umbrella chart.
*/}}
{{- define "asynchrone-space-projects.image" -}}
{{- $tag := .Values.image.tag -}}
{{- if not $tag }}
{{- $global := index .Values "global" | default dict -}}
{{- $tag = index $global "imageTag" | default "" -}}
{{- end }}
{{- if not $tag }}
{{- fail "asynchrone-space-projects.image.tag or global.imageTag must be set" -}}
{{- end }}
{{- printf "%s:%s" .Values.image.repository $tag -}}
{{- end }}

{{/*
Merged image pull secrets from the local chart values and the umbrella
chart's global values.
*/}}
{{- define "asynchrone-space-projects.imagePullSecrets" -}}
{{- $globalValues := index .Values "global" | default dict -}}
{{- $global := index $globalValues "imagePullSecrets" | default (list) -}}
{{- $local := .Values.imagePullSecrets | default (list) -}}
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
