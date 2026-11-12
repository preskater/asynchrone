"use client"

import * as React from "react"
import { useLocale, useTranslations } from "next-intl"
import { CheckIcon, CopyIcon, KeyRoundIcon, PlusIcon } from "lucide-react"
import { toast } from "sonner"

import {
  createApiTokenAction,
  listApiTokensAction,
  revokeApiTokenAction,
} from "@/actions/api-tokens"
import type { ApiTokenSummary } from "@/lib/api-tokens/service"
import {
  API_TOKEN_EXPIRY_PRESETS,
  API_TOKEN_MAX_DAYS,
  API_TOKEN_SCOPES,
  type ApiTokenScope,
} from "@/lib/api-tokens/scopes"
import { unwrapActionResult } from "@workspace/core/action"
import { useErrorTranslator } from "@workspace/i18n/errors"
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
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

const DAY_MS = 24 * 60 * 60 * 1000

const SCOPE_KEYS = {
  "projects:read": "projects_read",
  "members:read": "members_read",
  "tasks:read": "tasks_read",
  "tasks:write": "tasks_write",
} as const satisfies Record<ApiTokenScope, string>

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10)
}

export function ApiTokensPanel({
  currentUserId,
  showOwner,
}: {
  currentUserId: string
  /** Admins see every member's tokens; show whose each one is. */
  showOwner: boolean
}) {
  const t = useTranslations("Org.apiTokens")
  const te = useErrorTranslator()
  const locale = useLocale()
  const [tokens, setTokens] = React.useState<ApiTokenSummary[] | null>(null)

  const load = React.useCallback(async () => {
    try {
      setTokens(unwrapActionResult(await listApiTokensAction()))
    } catch (error) {
      toast.error(te(error, "internal"))
      setTokens([])
    }
  }, [te])

  React.useEffect(() => {
    void load()
  }, [load])

  async function revoke(token: ApiTokenSummary) {
    try {
      unwrapActionResult(await revokeApiTokenAction(token.id))
      toast.success(t("revoked"))
      await load()
    } catch (error) {
      toast.error(te(error, "internal"))
    }
  }

  function formatDate(value: Date | string) {
    return new Date(value).toLocaleDateString(locale, {
      year: "numeric",
      month: "short",
      day: "numeric",
    })
  }

  function status(token: ApiTokenSummary) {
    if (token.revokedAt)
      return <Badge variant="outline">{t("statusRevoked")}</Badge>
    if (new Date(token.expiresAt) <= new Date())
      return <Badge variant="outline">{t("statusExpired")}</Badge>
    return <Badge variant="secondary">{t("statusActive")}</Badge>
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <CardTitle className="flex items-center gap-2">
              <KeyRoundIcon className="size-4" />
              {t("title")}
            </CardTitle>
            <CardDescription>{t("description")}</CardDescription>
          </div>
          <CreateApiTokenDialog onCreated={load} />
        </div>
      </CardHeader>
      <CardContent className="px-0">
        {tokens === null ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : tokens.length === 0 ? (
          <Empty className="mx-6 border border-dashed">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <KeyRoundIcon />
              </EmptyMedia>
              <EmptyTitle>{t("emptyTitle")}</EmptyTitle>
              <EmptyDescription>{t("emptyDescription")}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("name")}</TableHead>
                {showOwner ? <TableHead>{t("owner")}</TableHead> : null}
                <TableHead className="hidden md:table-cell">
                  {t("scopes")}
                </TableHead>
                <TableHead className="hidden sm:table-cell">
                  {t("expires")}
                </TableHead>
                <TableHead className="hidden lg:table-cell">
                  {t("lastUsed")}
                </TableHead>
                <TableHead>{t("status")}</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {tokens.map((token) => (
                <TableRow key={token.id}>
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">{token.name}</span>
                      <code className="text-xs text-muted-foreground">
                        {token.prefix}
                      </code>
                    </div>
                  </TableCell>
                  {showOwner ? (
                    <TableCell className="text-muted-foreground">
                      {token.owner.id === currentUserId
                        ? t("you")
                        : token.owner.name}
                    </TableCell>
                  ) : null}
                  <TableCell className="hidden md:table-cell">
                    <div className="flex flex-wrap gap-1">
                      {token.scopes.map((scope) => (
                        <Badge key={scope} variant="outline">
                          {scope}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground sm:table-cell">
                    {formatDate(token.expiresAt)}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground lg:table-cell">
                    {token.lastUsedAt
                      ? formatDate(token.lastUsedAt)
                      : t("never")}
                  </TableCell>
                  <TableCell>{status(token)}</TableCell>
                  <TableCell className="text-right">
                    {token.revokedAt ? null : (
                      <AlertDialog>
                        <AlertDialogTrigger
                          render={<Button variant="ghost" size="sm" />}
                        >
                          {t("revoke")}
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              {t("revokeTitle", { name: token.name })}
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              {t("revokeDescription")}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
                            <AlertDialogAction
                              variant="destructive"
                              onClick={() => revoke(token)}
                            >
                              {t("revoke")}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

function CreateApiTokenDialog({ onCreated }: { onCreated: () => void }) {
  const t = useTranslations("Org.apiTokens")
  const te = useErrorTranslator()
  const [open, setOpen] = React.useState(false)
  const [name, setName] = React.useState("")
  const [scopes, setScopes] = React.useState<ApiTokenScope[]>(["tasks:read"])
  const [expiry, setExpiry] = React.useState("90")
  const [customDate, setCustomDate] = React.useState("")
  const [submitting, setSubmitting] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [secret, setSecret] = React.useState<string | null>(null)
  const [copied, setCopied] = React.useState(false)

  React.useEffect(() => {
    if (!open) {
      setName("")
      setScopes(["tasks:read"])
      setExpiry("90")
      setCustomDate("")
      setError(null)
      setSecret(null)
      setCopied(false)
    }
  }, [open])

  const today = new Date()
  const minDate = isoDate(new Date(today.getTime() + 2 * DAY_MS))
  const maxDate = isoDate(
    new Date(today.getTime() + API_TOKEN_MAX_DAYS * DAY_MS)
  )
  const expiryItems = [
    ...API_TOKEN_EXPIRY_PRESETS.map((days) => ({
      value: String(days),
      label: t("expiresInDays", { days }),
    })),
    { value: "custom", label: t("customDate") },
  ]

  function toggleScope(scope: ApiTokenScope, checked: boolean) {
    setScopes((current) =>
      checked ? [...current, scope] : current.filter((item) => item !== scope)
    )
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const expiresAt =
      expiry === "custom"
        ? customDate
          ? new Date(`${customDate}T23:59:59`)
          : null
        : new Date(Date.now() + Number(expiry) * DAY_MS)
    if (!name.trim() || scopes.length === 0 || !expiresAt) {
      setError(t("formIncomplete"))
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const { token } = unwrapActionResult(
        await createApiTokenAction({
          name,
          scopes,
          expiresAt: expiresAt.toISOString(),
        })
      )
      setSecret(token)
      onCreated()
    } catch (caught) {
      setError(te(caught, "internal"))
    } finally {
      setSubmitting(false)
    }
  }

  async function copy() {
    if (!secret) return
    await navigator.clipboard.writeText(secret)
    setCopied(true)
    toast.success(t("copied"))
    setTimeout(() => setCopied(false), 2000)
  }

  const apiUrl = typeof window === "undefined" ? "" : window.location.origin

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>
        <PlusIcon data-icon="inline-start" />
        {t("create")}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{secret ? t("createdTitle") : t("create")}</DialogTitle>
          <DialogDescription>
            {secret ? t("createdDescription") : t("createDescription")}
          </DialogDescription>
        </DialogHeader>

        {secret ? (
          <div className="flex min-w-0 flex-col gap-4">
            <Field>
              <FieldLabel htmlFor="api-token-secret">{t("token")}</FieldLabel>
              <div className="flex items-center gap-2">
                <Input
                  id="api-token-secret"
                  value={secret}
                  readOnly
                  className="font-mono"
                  onFocus={(event) => event.currentTarget.select()}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={copy}
                  aria-label={t("copy")}
                >
                  {copied ? <CheckIcon /> : <CopyIcon />}
                </Button>
              </div>
            </Field>
            <Field>
              <FieldLabel>{t("tryIt")}</FieldLabel>
              <pre className="overflow-x-auto rounded-md bg-muted p-3 text-xs">
                {`curl ${apiUrl}/api/v1/projects \\\n  -H "Authorization: Bearer ${secret}"`}
              </pre>
            </Field>
            <DialogFooter>
              <DialogClose render={<Button />}>{t("done")}</DialogClose>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-4">
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="api-token-name">{t("name")}</FieldLabel>
                <Input
                  id="api-token-name"
                  value={name}
                  maxLength={80}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={t("namePlaceholder")}
                  autoFocus
                />
              </Field>
              <FieldSet>
                <FieldLegend variant="label">{t("scopes")}</FieldLegend>
                {API_TOKEN_SCOPES.map((scope) => (
                  <Field key={scope} orientation="horizontal">
                    <Checkbox
                      id={`api-token-scope-${scope}`}
                      checked={scopes.includes(scope)}
                      onCheckedChange={(checked) =>
                        toggleScope(scope, checked === true)
                      }
                    />
                    <FieldLabel
                      htmlFor={`api-token-scope-${scope}`}
                      className="font-normal"
                    >
                      <code>{scope}</code>
                      <span className="text-muted-foreground">
                        {t(`scopeDescriptions.${SCOPE_KEYS[scope]}`)}
                      </span>
                    </FieldLabel>
                  </Field>
                ))}
              </FieldSet>
              <Field>
                <FieldLabel htmlFor="api-token-expiry">
                  {t("expiry")}
                </FieldLabel>
                <Select
                  items={expiryItems}
                  value={expiry}
                  onValueChange={(value) => setExpiry(value as string)}
                >
                  <SelectTrigger id="api-token-expiry" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {expiryItems.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
                {expiry === "custom" ? (
                  <Input
                    type="date"
                    aria-label={t("customDate")}
                    value={customDate}
                    min={minDate}
                    max={maxDate}
                    onChange={(event) => setCustomDate(event.target.value)}
                  />
                ) : null}
                <FieldDescription>
                  {t("expiryHint", { max: API_TOKEN_MAX_DAYS })}
                </FieldDescription>
              </Field>
              {error ? (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              ) : null}
            </FieldGroup>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" type="button" />}>
                {t("cancel")}
              </DialogClose>
              <Button type="submit" disabled={submitting}>
                {submitting ? <Spinner /> : null}
                {t("create")}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
