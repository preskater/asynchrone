{{/*
Expand the name of the app. Each umbrella dependency alias sets
`nameOverride` to the app key (copilot, projects, ...), so the rendered
resource names stay `asynchrone-space-<app>`.
*/}}
{{- define "asynchrone-space-app.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "asynchrone-space-app.fullname" -}}
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
{{- define "asynchrone-space-app.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels.
*/}}
{{- define "asynchrone-space-app.labels" -}}
helm.sh/chart: {{ include "asynchrone-space-app.chart" . }}
{{ include "asynchrone-space-app.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels.
*/}}
{{- define "asynchrone-space-app.selectorLabels" -}}
app.kubernetes.io/name: {{ include "asynchrone-space-app.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the name of the service account to use.
*/}}
{{- define "asynchrone-space-app.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "asynchrone-space-app.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Fully qualified image reference. `image.tag` wins over `global.imageTag` so the
chart can be installed standalone as well as from the umbrella chart.
*/}}
{{- define "asynchrone-space-app.image" -}}
{{- $repository := required "asynchrone-space-app.image.repository is required" .Values.image.repository -}}
{{- $tag := .Values.image.tag -}}
{{- if not $tag }}
{{- $global := index .Values "global" | default dict -}}
{{- $tag = index $global "imageTag" | default "" -}}
{{- end }}
{{- if not $tag }}
{{- fail "asynchrone-space-app.image.tag or global.imageTag must be set" -}}
{{- end }}
{{- printf "%s:%s" $repository $tag -}}
{{- end }}

{{/*
Merged image pull secrets from the local chart values and the umbrella
chart's global values.
*/}}
{{- define "asynchrone-space-app.imagePullSecrets" -}}
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

{{/*
Next.js incremental/image cache path. Every app has its own output directory;
derive it from the app name unless the values override it.
*/}}
{{- define "asynchrone-space-app.cacheMountPath" -}}
{{- if .Values.cache.mountPath }}
{{- .Values.cache.mountPath }}
{{- else }}
{{- printf "/usr/src/asynchrone-space/apps/%s/.next/cache" (include "asynchrone-space-app.name" .) }}
{{- end }}
{{- end }}
