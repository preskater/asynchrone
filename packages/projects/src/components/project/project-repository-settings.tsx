"use client"

import * as React from "react"
import {
  CopyIcon,
  ExternalLinkIcon,
  GitBranchIcon,
  RefreshCwIcon,
  UnplugIcon,
} from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"

import { Link } from "@workspace/i18n/navigation"
import { unwrapActionResult } from "@workspace/core/action"
import { useErrorTranslator } from "@workspace/i18n/errors"

import { useProjectActions } from "../../ui/actions"
import type {
  RepositoryConnectionView,
  RepositoryProvider,
  RepositorySyncSummary,
  UserRepositoryTokenStatus,
} from "../../integrations/types"
import { REPOSITORY_PROVIDERS } from "../../integrations/types"
import { formatDate, type Project } from "../../types"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@workspace/ui/components/alert-dialog"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Spinner } from "@workspace/ui/components/spinner"

const PROVIDER_NAMES: Record<RepositoryProvider, string> = {
  github: "GitHub",
  gitlab: "GitLab",
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const t = useTranslations("Projects")
  const tT = useTranslations("Toasts")
  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      aria-label={label}
      onClick={() => {
        void navigator.clipboard
          .writeText(value)
          .then(() => toast.success(tT("repositoryValueCopied")))
          .catch(() => toast.error(t("copyFailed")))
      }}
    >
      <CopyIcon />
    </Button>
  )
}

function ConnectRepositoryForm({
  project,
  onConnected,
}: {
  project: Project
  onConnected: (
    connection: RepositoryConnectionView,
    summary: RepositorySyncSummary
  ) => void
}) {
  const t = useTranslations("Projects")
  const tT = useTranslations("Toasts")
  const te = useErrorTranslator()
  const actions = useProjectActions()
  const [provider, setProvider] = React.useState<RepositoryProvider>("github")
  const [owner, setOwner] = React.useState("")
  const [repo, setRepo] = React.useState("")
  const [baseUrl, setBaseUrl] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [tokens, setTokens] = React.useState<UserRepositoryTokenStatus | null>(
    null
  )

  React.useEffect(() => {
    let active = true
    async function load() {
      try {
        const status = unwrapActionResult(
          await actions.listUserRepositoryTokens()
        )
        if (active) setTokens(status)
      } catch {
        if (active) setTokens(null)
      }
    }
    void load()
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const providerItems = REPOSITORY_PROVIDERS.map((value) => ({
    value,
    label: PROVIDER_NAMES[value],
  }))
  const canSubmit = owner.trim().length > 0 && repo.trim().length > 0
  const providerLabel = PROVIDER_NAMES[provider]
  const hasToken = tokens?.[provider] ?? true

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!canSubmit) return
    setBusy(true)
    try {
      const result = unwrapActionResult(
        await actions.connectRepository({
          projectId: project.id,
          provider,
          owner: owner.trim(),
          repo: repo.trim(),
          baseUrl: baseUrl.trim() || undefined,
        })
      )
      onConnected(result.connection, result.summary)
      toast.success(tT("repositoryConnected"))
    } catch (error) {
      toast.error(te(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("repository")}</CardTitle>
        <CardDescription>{t("repositoryConnectDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="repository-provider">
                {t("repositoryProvider")}
              </FieldLabel>
              <Select
                items={providerItems}
                value={provider}
                onValueChange={(value) =>
                  setProvider(value as RepositoryProvider)
                }
              >
                <SelectTrigger id="repository-provider" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {providerItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="repository-owner">
                {t("repositoryOwner")}
              </FieldLabel>
              <Input
                id="repository-owner"
                value={owner}
                onChange={(event) => setOwner(event.target.value)}
                placeholder={t("repositoryOwnerPlaceholder")}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="repository-name">
                {t("repositoryName")}
              </FieldLabel>
              <Input
                id="repository-name"
                value={repo}
                onChange={(event) => setRepo(event.target.value)}
                placeholder={t("repositoryNamePlaceholder")}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="repository-base-url">
                {t("repositoryBaseUrl")}
              </FieldLabel>
              <Input
                id="repository-base-url"
                value={baseUrl}
                onChange={(event) => setBaseUrl(event.target.value)}
                placeholder={t("repositoryBaseUrlPlaceholder")}
              />
              <FieldDescription>{t("repositoryBaseUrlHint")}</FieldDescription>
            </Field>
            <FieldDescription>
              {t("repositoryProfileTokenHint", { provider: providerLabel })}
            </FieldDescription>
            {!hasToken ? (
              <p className="text-sm text-destructive">
                {t("repositoryNoUserToken", { provider: providerLabel })}{" "}
                <Link
                  href="/settings/account"
                  className="underline underline-offset-4"
                >
                  {t("repositoryGoToAccount")}
                </Link>
              </p>
            ) : null}
            <Field orientation="horizontal">
              <Button type="submit" disabled={!canSubmit || busy}>
                {busy ? <Spinner /> : null}
                {busy ? t("repositoryConnecting") : t("repositoryConnect")}
              </Button>
            </Field>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}

function ConnectedRepositoryCard({
  project,
  connection,
  summary,
  onDisconnected,
  onSynced,
}: {
  project: Project
  connection: RepositoryConnectionView
  summary: RepositorySyncSummary | null
  onDisconnected: () => void
  onSynced: (summary: RepositorySyncSummary) => void
}) {
  const t = useTranslations("Projects")
  const tT = useTranslations("Toasts")
  const te = useErrorTranslator()
  const actions = useProjectActions()
  const locale = useLocale()
  const [busy, setBusy] = React.useState<"sync" | "disconnect" | null>(null)
  const providerName = PROVIDER_NAMES[connection.provider]

  async function handleSync() {
    setBusy("sync")
    try {
      const result = unwrapActionResult(
        await actions.syncRepository(project.id)
      )
      onSynced(result)
      toast.success(tT("repositorySyncDone"))
    } catch (error) {
      toast.error(te(error))
    } finally {
      setBusy(null)
    }
  }

  async function handleDisconnect() {
    setBusy("disconnect")
    try {
      unwrapActionResult(await actions.disconnectRepository(project.id))
      onDisconnected()
      toast.success(tT("repositoryDisconnected"))
    } catch (error) {
      toast.error(te(error))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <CardTitle>{t("repository")}</CardTitle>
            <CardDescription>
              <a
                href={connection.repoUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 underline-offset-4 hover:underline"
              >
                <GitBranchIcon className="size-3.5" />
                {connection.owner}/{connection.repo}
                <ExternalLinkIcon className="size-3" />
              </a>
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{providerName}</Badge>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy !== null}
              onClick={handleSync}
            >
              {busy === "sync" ? (
                <Spinner />
              ) : (
                <RefreshCwIcon data-icon="inline-start" />
              )}
              {t("repositorySyncNow")}
            </Button>
            <AlertDialog>
              <AlertDialogTrigger
                render={
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy !== null}
                  />
                }
              >
                <UnplugIcon data-icon="inline-start" />
                {t("repositoryDisconnect")}
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {t("repositoryDisconnectQuestion")}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {t("repositoryDisconnectDescription")}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    onClick={handleDisconnect}
                  >
                    {t("repositoryDisconnect")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span>
            {connection.lastSyncedAt
              ? t("repositoryLastSynced", {
                  date: formatDate(connection.lastSyncedAt, locale) ?? "",
                })
              : t("repositoryNeverSynced")}
          </span>
          {summary ? (
            <span>
              {t("repositoryImportSummary", {
                issues: summary.issuesImported + summary.issuesUpdated,
                tasks: summary.tasksPushed,
              })}
            </span>
          ) : null}
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="repository-webhook-url">
              {t("repositoryWebhookUrl")}
            </FieldLabel>
            <div className="flex items-center gap-2">
              <Input
                id="repository-webhook-url"
                readOnly
                value={connection.webhookUrl}
                className="font-mono text-xs"
              />
              <CopyButton
                value={connection.webhookUrl}
                label={t("repositoryCopyWebhookUrl")}
              />
            </div>
          </Field>
          <Field>
            <FieldLabel htmlFor="repository-webhook-secret">
              {t("repositoryWebhookSecret")}
            </FieldLabel>
            <div className="flex items-center gap-2">
              <Input
                id="repository-webhook-secret"
                readOnly
                value={connection.webhookSecret}
                className="font-mono text-xs"
              />
              <CopyButton
                value={connection.webhookSecret}
                label={t("repositoryCopyWebhookSecret")}
              />
            </div>
          </Field>
        </div>
        <p className="text-sm text-muted-foreground">
          {connection.provider === "github"
            ? t("repositoryWebhookHintGithub")
            : t("repositoryWebhookHintGitlab")}
        </p>
      </CardContent>
    </Card>
  )
}

/**
 * Project settings → Repository: connect GitHub/GitLab, expose the webhook
 * endpoints, and drive a manual sync. Owner/admin only (the settings tab
 * itself is gated, and the server re-checks the role).
 */
export function ProjectRepositorySettings({ project }: { project: Project }) {
  const t = useTranslations("Projects")
  const te = useErrorTranslator()
  const actions = useProjectActions()
  const [connection, setConnection] = React.useState<
    RepositoryConnectionView | null | undefined
  >(undefined)
  const [summary, setSummary] = React.useState<RepositorySyncSummary | null>(
    null
  )

  React.useEffect(() => {
    let active = true
    async function load() {
      try {
        const view = unwrapActionResult(
          await actions.getRepositoryConnection(project.id)
        )
        if (active) setConnection(view)
      } catch (error) {
        if (active) {
          setConnection(null)
          toast.error(te(error))
        }
      }
    }
    void load()
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id])

  if (connection === undefined) {
    return (
      <Card>
        <CardContent className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Spinner />
          {t("repositoryLoading")}
        </CardContent>
      </Card>
    )
  }

  if (!connection) {
    return (
      <ConnectRepositoryForm
        project={project}
        onConnected={(view, result) => {
          setConnection(view)
          setSummary(result)
        }}
      />
    )
  }

  return (
    <ConnectedRepositoryCard
      project={project}
      connection={connection}
      summary={summary}
      onDisconnected={() => {
        setConnection(null)
        setSummary(null)
      }}
      onSynced={(result) => {
        setSummary(result)
        setConnection((previous) =>
          previous
            ? { ...previous, lastSyncedAt: new Date().toISOString() }
            : previous
        )
      }}
    />
  )
}
