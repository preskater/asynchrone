"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
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
import { Textarea } from "@workspace/ui/components/textarea"
import { unwrapActionResult, type ActionResult } from "@workspace/core/action"
import { FEEDBACK_CATEGORIES, FEEDBACK_IMPACTS } from "@workspace/core/feedback"
import { useErrorTranslator } from "@workspace/i18n/errors"
import { useEnumLabel } from "@workspace/i18n/labels"
import { Link, useRouter } from "@workspace/i18n/navigation"

import {
  CLIENT_FEEDBACK_ENVIRONMENTS,
  CLIENT_FEEDBACK_OPEN_STATUSES,
  CLIENT_FEEDBACK_STATUSES,
  CLIENT_RELEASE_STATUSES,
  type ClientAccessData,
  type ClientContactData,
  type ClientFeedbackData,
  type ClientMemberOptionData,
  type ClientProjectOptionData,
  type ClientReleaseData,
  type ClientReleaseGroupData,
} from "../types"
import { useClientActions } from "./actions"
import { useClientFormat } from "./use-clients"

const ALL = "all"
const NONE = "none"

/** Set on the per-company page; the cross-client page only triages. */
export interface FeedbackBoardClient {
  id: string
  name: string
  contacts: ClientContactData[]
  projects: ClientProjectOptionData[]
}

type Option = { value: string; label: string }

function isOpen(status: string) {
  return (CLIENT_FEEDBACK_OPEN_STATUSES as readonly string[]).includes(status)
}

function impactVariant(impact: string) {
  if (impact === "critical") return "destructive" as const
  if (impact === "high") return "default" as const
  return "secondary" as const
}

/** `datetime-local` value in the viewer's zone for an ISO timestamp. */
function toLocalInput(iso: string) {
  const date = new Date(iso)
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return shifted.toISOString().slice(0, 16)
}

function OptionSelect({
  id,
  items,
  value,
  onChange,
  label,
  className = "w-full",
}: {
  id?: string
  items: Option[]
  value: string
  onChange: (value: string) => void
  label?: string
  className?: string
}) {
  return (
    <Select
      items={items}
      value={value}
      onValueChange={(next) => onChange((next as string | null) ?? "")}
    >
      <SelectTrigger id={id} aria-label={label} className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}

export function FeedbackBoard({
  orgSlug,
  groups,
  access,
  members,
  client,
}: {
  orgSlug: string
  groups: ClientReleaseGroupData[]
  access: ClientAccessData
  members: ClientMemberOptionData[]
  client?: FeedbackBoardClient
}) {
  const t = useTranslations("Clients")
  const L = useEnumLabel()

  const [status, setStatus] = React.useState(ALL)
  const [category, setCategory] = React.useState(ALL)
  const [impact, setImpact] = React.useState(ALL)
  const [tester, setTester] = React.useState(ALL)
  const [sort, setSort] = React.useState("newest")

  const all = { value: ALL, label: t("common.all") }
  const testers = new Map<string, string>()
  for (const group of groups) {
    for (const item of group.feedback) {
      if (item.contactId && item.contactName) {
        testers.set(item.contactId, item.contactName)
      }
    }
  }
  const filtering =
    status !== ALL || category !== ALL || impact !== ALL || tester !== ALL

  const visible = groups.flatMap((group) => {
    const feedback = group.feedback
      .filter(
        (item) =>
          (status === ALL || item.status === status) &&
          (category === ALL || item.category === category) &&
          (impact === ALL || item.impact === impact) &&
          (tester === ALL || item.contactId === tester)
      )
      .sort((a, b) =>
        sort === "newest"
          ? b.testedAt.localeCompare(a.testedAt)
          : a.testedAt.localeCompare(b.testedAt)
      )
    // A filtered triage pass only needs the releases with a match.
    if (filtering && feedback.length === 0) return []
    return [{ release: group.release, feedback }]
  })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <FilterField label={t("feedback.fields.status")}>
          <OptionSelect
            label={t("feedback.fields.status")}
            className="w-40"
            value={status}
            onChange={setStatus}
            items={[
              all,
              ...CLIENT_FEEDBACK_STATUSES.map((value) => ({
                value,
                label: L.clientFeedbackStatus(value),
              })),
            ]}
          />
        </FilterField>
        <FilterField label={t("feedback.fields.category")}>
          <OptionSelect
            label={t("feedback.fields.category")}
            className="w-40"
            value={category}
            onChange={setCategory}
            items={[
              all,
              ...FEEDBACK_CATEGORIES.map((value) => ({
                value,
                label: L.feedbackCategory(value),
              })),
            ]}
          />
        </FilterField>
        <FilterField label={t("feedback.fields.impact")}>
          <OptionSelect
            label={t("feedback.fields.impact")}
            className="w-36"
            value={impact}
            onChange={setImpact}
            items={[
              all,
              ...FEEDBACK_IMPACTS.map((value) => ({
                value,
                label: L.feedbackImpact(value),
              })),
            ]}
          />
        </FilterField>
        <FilterField label={t("feedback.fields.tester")}>
          <OptionSelect
            label={t("feedback.fields.tester")}
            className="w-44"
            value={tester}
            onChange={setTester}
            items={[
              all,
              ...[...testers].map(([value, label]) => ({ value, label })),
            ]}
          />
        </FilterField>
        <FilterField label={t("feedback.filters.sort")}>
          <OptionSelect
            label={t("feedback.filters.sort")}
            className="w-40"
            value={sort}
            onChange={setSort}
            items={[
              { value: "newest", label: t("feedback.filters.newest") },
              { value: "oldest", label: t("feedback.filters.oldest") },
            ]}
          />
        </FilterField>
        {client && access.canEdit ? (
          <ReleaseDialog
            client={client}
            trigger={
              <Button type="button" size="sm" className="ml-auto">
                <PlusIcon data-icon="inline-start" />
                {t("feedback.newRelease")}
              </Button>
            }
          />
        ) : null}
      </div>

      {visible.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {filtering
              ? t("feedback.empty.noMatch")
              : client
                ? t("feedback.empty.noReleases")
                : t("feedback.empty.noReleasesAnywhere")}
          </CardContent>
        </Card>
      ) : (
        visible.map((group) => (
          <ReleaseCard
            key={group.release.id}
            orgSlug={orgSlug}
            release={group.release}
            feedback={group.feedback}
            releases={groups.map((item) => item.release)}
            access={access}
            members={members}
            client={client}
          />
        ))
      )}
    </div>
  )
}

function FilterField({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}

function ReleaseCard({
  orgSlug,
  release,
  feedback,
  releases,
  access,
  members,
  client,
}: {
  orgSlug: string
  release: ClientReleaseData
  feedback: ClientFeedbackData[]
  releases: ClientReleaseData[]
  access: ClientAccessData
  members: ClientMemberOptionData[]
  client?: FeedbackBoardClient
}) {
  const t = useTranslations("Clients")
  const L = useEnumLabel()
  const { day, dateTime } = useClientFormat()
  const [deleting, setDeleting] = React.useState(false)
  const { deleteReleaseAction } = useClientActions()

  const tested = !release.testedFrom
    ? t("feedback.meta.notTested")
    : release.testedFrom === release.testedTo
      ? t("feedback.meta.testedOnce", { date: dateTime(release.testedFrom) })
      : t("feedback.meta.tested", {
          from: dateTime(release.testedFrom),
          to: dateTime(release.testedTo),
        })

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-baseline gap-2">
              <CardTitle className="text-2xl tabular-nums">
                {release.version}
              </CardTitle>
              {release.label ? (
                <span className="text-sm text-muted-foreground">
                  {release.label}
                </span>
              ) : null}
              <Badge
                variant={
                  release.status === "rejected" ? "destructive" : "secondary"
                }
              >
                {L.clientReleaseStatus(release.status)}
              </Badge>
              {release.portalVisible ? (
                <Badge variant="outline">{t("feedback.meta.shared")}</Badge>
              ) : null}
            </div>
            {!client && release.clientName ? (
              <Link
                href={`/${orgSlug}/clients/${release.clientId}/feedback`}
                prefetch={false}
                className="text-sm font-medium hover:underline"
              >
                {release.clientName}
              </Link>
            ) : null}
            <p className="text-sm text-muted-foreground">
              {release.releasedAt
                ? t("feedback.meta.released", { date: day(release.releasedAt) })
                : t("feedback.meta.notReleased")}{" "}
              · {tested} ·{" "}
              {t("feedback.meta.counts", {
                open: release.openCount,
                count: release.feedbackCount,
              })}
            </p>
          </div>
          {client && access.canEdit ? (
            <div className="flex flex-wrap items-center gap-2">
              <FeedbackDialog
                client={client}
                releases={releases}
                members={members}
                defaultReleaseId={release.id}
                trigger={
                  <Button type="button" size="sm">
                    <PlusIcon data-icon="inline-start" />
                    {t("feedback.newFeedback")}
                  </Button>
                }
              />
              <ReleaseDialog
                client={client}
                release={release}
                trigger={
                  <Button type="button" size="sm" variant="outline">
                    <PencilIcon data-icon="inline-start" />
                    {t("common.edit")}
                  </Button>
                }
              />
              {access.canManage ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  aria-label={t("feedback.deleteRelease")}
                  onClick={() => setDeleting(true)}
                >
                  <Trash2Icon />
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        {feedback.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("feedback.empty.noFeedback")}
          </p>
        ) : (
          <ul className="flex flex-col divide-y">
            {feedback.map((item) => (
              <FeedbackRow
                key={item.id}
                item={item}
                access={access}
                members={members}
                client={client}
                releases={releases}
              />
            ))}
          </ul>
        )}
      </CardContent>
      <ConfirmDelete
        open={deleting}
        onOpenChange={setDeleting}
        title={t("feedback.deleteReleaseTitle", { version: release.version })}
        description={t("feedback.deleteReleaseDescription")}
        onConfirm={() => deleteReleaseAction(release.id)}
      />
    </Card>
  )
}

function FeedbackRow({
  item,
  access,
  members,
  client,
  releases,
}: {
  item: ClientFeedbackData
  access: ClientAccessData
  members: ClientMemberOptionData[]
  client?: FeedbackBoardClient
  releases: ClientReleaseData[]
}) {
  const t = useTranslations("Clients")
  const L = useEnumLabel()
  const te = useErrorTranslator()
  const router = useRouter()
  const { dateTime } = useClientFormat()
  const {
    setFeedbackStatusAction,
    assignFeedbackAction,
    deleteFeedbackAction,
  } = useClientActions()
  const [deleting, setDeleting] = React.useState(false)

  async function run(action: Promise<ActionResult<unknown>>, message: string) {
    try {
      unwrapActionResult(await action)
      toast.success(message)
      router.refresh()
    } catch (error) {
      toast.error(te(error, "internal"))
    }
  }

  const title = <span className="font-medium">{item.title}</span>

  return (
    <li className="flex flex-col gap-3 py-3 md:flex-row md:items-start md:justify-between">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {client && access.canEdit ? (
            <FeedbackDialog
              client={client}
              releases={releases}
              members={members}
              feedback={item}
              trigger={
                <button type="button" className="text-left hover:underline">
                  {title}
                </button>
              }
            />
          ) : (
            title
          )}
          <Badge variant="outline">{L.feedbackCategory(item.category)}</Badge>
          <Badge variant={impactVariant(item.impact)}>
            {L.feedbackImpact(item.impact)}
          </Badge>
          <Badge variant="outline">
            {L.clientFeedbackEnvironment(item.environment)}
          </Badge>
        </div>
        <p className="line-clamp-2 text-sm whitespace-pre-wrap text-muted-foreground">
          {item.body}
        </p>
        <p className="text-xs text-muted-foreground">
          {[
            item.contactName,
            dateTime(item.testedAt),
            t("feedback.meta.recordedBy", { name: item.authorName }),
            item.version !==
            releases.find((r) => r.id === item.releaseId)?.version
              ? t("feedback.meta.reportedOn", { version: item.version })
              : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {access.canEdit ? (
          <>
            <OptionSelect
              label={t("feedback.fields.status")}
              className="w-36"
              value={item.status}
              onChange={(value) =>
                void run(
                  setFeedbackStatusAction({ id: item.id, status: value }),
                  t("feedback.toasts.statusChanged")
                )
              }
              items={CLIENT_FEEDBACK_STATUSES.map((value) => ({
                value,
                label: L.clientFeedbackStatus(value),
              }))}
            />
            <OptionSelect
              label={t("feedback.fields.assignee")}
              className="w-40"
              value={item.assigneeId ?? NONE}
              onChange={(value) =>
                void run(
                  assignFeedbackAction({
                    id: item.id,
                    assigneeId: value === NONE ? null : value,
                  }),
                  t("feedback.toasts.assigned")
                )
              }
              items={[
                { value: NONE, label: t("common.unassigned") },
                ...members.map((member) => ({
                  value: member.id,
                  label: member.name,
                })),
              ]}
            />
            {access.canManage ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                aria-label={t("feedback.deleteFeedback")}
                onClick={() => setDeleting(true)}
              >
                <Trash2Icon />
              </Button>
            ) : null}
          </>
        ) : (
          <>
            <Badge variant={isOpen(item.status) ? "secondary" : "outline"}>
              {L.clientFeedbackStatus(item.status)}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {item.assigneeName ?? t("common.unassigned")}
            </span>
          </>
        )}
      </div>
      <ConfirmDelete
        open={deleting}
        onOpenChange={setDeleting}
        title={t("feedback.deleteFeedbackTitle", { title: item.title })}
        description={t("feedback.deleteFeedbackDescription")}
        onConfirm={() => deleteFeedbackAction(item.id)}
      />
    </li>
  )
}

function ConfirmDelete({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  onConfirm: () => Promise<ActionResult<unknown>>
}) {
  const t = useTranslations("Clients")
  const te = useErrorTranslator()
  const router = useRouter()

  async function confirm() {
    try {
      unwrapActionResult(await onConfirm())
      toast.success(t("feedback.toasts.deleted"))
      onOpenChange(false)
      router.refresh()
    } catch (error) {
      toast.error(te(error, "internal"))
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => void confirm()}
          >
            {t("common.delete")}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function ReleaseDialog({
  client,
  release,
  trigger,
}: {
  client: FeedbackBoardClient
  release?: ClientReleaseData
  trigger: React.ReactElement
}) {
  const t = useTranslations("Clients")
  const L = useEnumLabel()
  const te = useErrorTranslator()
  const router = useRouter()
  const { saveReleaseAction } = useClientActions()

  const [open, setOpen] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)
  const [version, setVersion] = React.useState("")
  const [label, setLabel] = React.useState("")
  const [releasedAt, setReleasedAt] = React.useState("")
  const [status, setStatus] = React.useState<string>("planned")
  const [projectId, setProjectId] = React.useState(NONE)
  const [notes, setNotes] = React.useState("")
  const [portalVisible, setPortalVisible] = React.useState(false)

  function reset() {
    setVersion(release?.version ?? "")
    setLabel(release?.label ?? "")
    setReleasedAt(release?.releasedAt ?? "")
    setStatus(release?.status ?? "planned")
    setProjectId(release?.projectId ?? NONE)
    setNotes(release?.notes ?? "")
    setPortalVisible(release?.portalVisible ?? false)
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!version.trim()) return
    setSubmitting(true)
    try {
      unwrapActionResult(
        await saveReleaseAction({
          id: release?.id,
          clientId: client.id,
          version: version.trim(),
          label: label.trim() || null,
          releasedAt: releasedAt || null,
          status,
          projectId: projectId === NONE ? null : projectId,
          notes: notes.trim() || null,
          portalVisible,
        })
      )
      toast.success(t("feedback.toasts.releaseSaved"))
      setOpen(false)
      router.refresh()
    } catch (error) {
      toast.error(te(error, "internal"))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) reset()
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {release ? t("feedback.editRelease") : t("feedback.newRelease")}
          </DialogTitle>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="release-version">
                  {t("feedback.fields.version")}
                </FieldLabel>
                <Input
                  id="release-version"
                  value={version}
                  required
                  maxLength={40}
                  placeholder="1.4.2"
                  onChange={(event) => setVersion(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="release-date">
                  {t("feedback.fields.releasedAt")}
                </FieldLabel>
                <Input
                  id="release-date"
                  type="date"
                  value={releasedAt}
                  onChange={(event) => setReleasedAt(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="release-label">
                  {t("feedback.fields.label")}
                </FieldLabel>
                <Input
                  id="release-label"
                  value={label}
                  maxLength={120}
                  onChange={(event) => setLabel(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="release-status">
                  {t("feedback.fields.status")}
                </FieldLabel>
                <OptionSelect
                  id="release-status"
                  value={status}
                  onChange={setStatus}
                  items={CLIENT_RELEASE_STATUSES.map((value) => ({
                    value,
                    label: L.clientReleaseStatus(value),
                  }))}
                />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="release-project">
                {t("feedback.fields.project")}
              </FieldLabel>
              <OptionSelect
                id="release-project"
                value={projectId}
                onChange={setProjectId}
                items={[
                  { value: NONE, label: t("common.none") },
                  ...client.projects.map((project) => ({
                    value: project.id,
                    label: project.name,
                  })),
                ]}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="release-notes">
                {t("feedback.fields.notes")}
              </FieldLabel>
              <Textarea
                id="release-notes"
                value={notes}
                maxLength={4000}
                rows={3}
                onChange={(event) => setNotes(event.target.value)}
              />
            </Field>
            <Field orientation="horizontal">
              <Checkbox
                id="release-portal"
                checked={portalVisible}
                onCheckedChange={(checked) =>
                  setPortalVisible(checked === true)
                }
              />
              <div className="flex flex-col gap-1">
                <FieldLabel htmlFor="release-portal" className="font-normal">
                  {t("feedback.fields.portalVisible")}
                </FieldLabel>
                <FieldDescription>
                  {t("feedback.fields.portalVisibleHint")}
                </FieldDescription>
              </div>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>
              {t("common.cancel")}
            </DialogClose>
            <Button type="submit" disabled={submitting || !version.trim()}>
              {submitting ? <Spinner className="size-4" /> : null}
              {t("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function FeedbackDialog({
  client,
  releases,
  members,
  feedback,
  defaultReleaseId,
  trigger,
}: {
  client: FeedbackBoardClient
  releases: ClientReleaseData[]
  members: ClientMemberOptionData[]
  feedback?: ClientFeedbackData
  defaultReleaseId?: string
  trigger: React.ReactElement
}) {
  const t = useTranslations("Clients")
  const L = useEnumLabel()
  const te = useErrorTranslator()
  const router = useRouter()
  const { saveFeedbackAction } = useClientActions()

  const [open, setOpen] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)
  const [releaseId, setReleaseId] = React.useState("")
  const [title, setTitle] = React.useState("")
  const [body, setBody] = React.useState("")
  const [testedAt, setTestedAt] = React.useState("")
  const [environment, setEnvironment] = React.useState<string>("staging")
  const [category, setCategory] = React.useState<string>("bug")
  const [impact, setImpact] = React.useState<string>("medium")
  const [contactId, setContactId] = React.useState(NONE)
  const [assigneeId, setAssigneeId] = React.useState(NONE)

  function reset() {
    setReleaseId(
      feedback?.releaseId ?? defaultReleaseId ?? releases[0]?.id ?? ""
    )
    setTitle(feedback?.title ?? "")
    setBody(feedback?.body ?? "")
    setTestedAt(toLocalInput(feedback?.testedAt ?? new Date().toISOString()))
    setEnvironment(feedback?.environment ?? "staging")
    setCategory(feedback?.category ?? "bug")
    setImpact(feedback?.impact ?? "medium")
    setContactId(feedback?.contactId ?? NONE)
    setAssigneeId(feedback?.assigneeId ?? NONE)
  }

  const ready = Boolean(releaseId && title.trim() && body.trim() && testedAt)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!ready) return
    setSubmitting(true)
    try {
      unwrapActionResult(
        await saveFeedbackAction({
          id: feedback?.id,
          releaseId,
          title: title.trim(),
          body: body.trim(),
          // The input is in the viewer's zone; send an absolute instant.
          testedAt: new Date(testedAt).toISOString(),
          environment,
          category,
          impact,
          contactId: contactId === NONE ? null : contactId,
          assigneeId: assigneeId === NONE ? null : assigneeId,
          documentId: feedback?.documentId ?? null,
        })
      )
      toast.success(t("feedback.toasts.feedbackSaved"))
      setOpen(false)
      router.refresh()
    } catch (error) {
      toast.error(te(error, "internal"))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) reset()
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {feedback ? t("feedback.editFeedback") : t("feedback.newFeedback")}
          </DialogTitle>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="feedback-title">
                {t("feedback.fields.title")}
              </FieldLabel>
              <Input
                id="feedback-title"
                value={title}
                required
                maxLength={160}
                onChange={(event) => setTitle(event.target.value)}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="feedback-release">
                  {t("feedback.fields.release")}
                </FieldLabel>
                <OptionSelect
                  id="feedback-release"
                  value={releaseId}
                  onChange={setReleaseId}
                  items={releases.map((release) => ({
                    value: release.id,
                    label: release.version,
                  }))}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="feedback-tested-at">
                  {t("feedback.fields.testedAt")}
                </FieldLabel>
                <Input
                  id="feedback-tested-at"
                  type="datetime-local"
                  value={testedAt}
                  required
                  onChange={(event) => setTestedAt(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="feedback-category">
                  {t("feedback.fields.category")}
                </FieldLabel>
                <OptionSelect
                  id="feedback-category"
                  value={category}
                  onChange={setCategory}
                  items={FEEDBACK_CATEGORIES.map((value) => ({
                    value,
                    label: L.feedbackCategory(value),
                  }))}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="feedback-impact">
                  {t("feedback.fields.impact")}
                </FieldLabel>
                <OptionSelect
                  id="feedback-impact"
                  value={impact}
                  onChange={setImpact}
                  items={FEEDBACK_IMPACTS.map((value) => ({
                    value,
                    label: L.feedbackImpact(value),
                  }))}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="feedback-environment">
                  {t("feedback.fields.environment")}
                </FieldLabel>
                <OptionSelect
                  id="feedback-environment"
                  value={environment}
                  onChange={setEnvironment}
                  items={CLIENT_FEEDBACK_ENVIRONMENTS.map((value) => ({
                    value,
                    label: L.clientFeedbackEnvironment(value),
                  }))}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="feedback-tester">
                  {t("feedback.fields.tester")}
                </FieldLabel>
                <OptionSelect
                  id="feedback-tester"
                  value={contactId}
                  onChange={setContactId}
                  items={[
                    { value: NONE, label: t("common.none") },
                    ...client.contacts.map((contact) => ({
                      value: contact.id,
                      label: contact.fullName,
                    })),
                  ]}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="feedback-assignee">
                  {t("feedback.fields.assignee")}
                </FieldLabel>
                <OptionSelect
                  id="feedback-assignee"
                  value={assigneeId}
                  onChange={setAssigneeId}
                  items={[
                    { value: NONE, label: t("common.unassigned") },
                    ...members.map((member) => ({
                      value: member.id,
                      label: member.name,
                    })),
                  ]}
                />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="feedback-body">
                {t("feedback.fields.body")}
              </FieldLabel>
              <Textarea
                id="feedback-body"
                value={body}
                required
                maxLength={8000}
                rows={6}
                onChange={(event) => setBody(event.target.value)}
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>
              {t("common.cancel")}
            </DialogClose>
            <Button type="submit" disabled={submitting || !ready}>
              {submitting ? <Spinner className="size-4" /> : null}
              {t("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
