"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import {
  FolderKanbanIcon,
  PlusIcon,
  SearchIcon,
  UnlinkIcon,
} from "lucide-react"
import { toast } from "sonner"

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
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { Spinner } from "@workspace/ui/components/spinner"

import { useClientActions } from "./actions"
import { Link, useRouter } from "@workspace/i18n/navigation"
import { unwrapActionResult } from "@workspace/core/action"
import type {
  ClientProjectLinkOptionData,
  ClientProjectOptionData,
} from "../types"
import { useErrorTranslator } from "@workspace/i18n/errors"
import { useEnumLabel } from "@workspace/i18n/labels"

/** Projects linked to one company, with link/unlink actions. */
export function ProjectsCard({
  orgSlug,
  clientId,
  projects,
  canEdit,
}: {
  orgSlug: string
  clientId: string
  projects: ClientProjectOptionData[]
  canEdit: boolean
}) {
  const t = useTranslations("Clients")
  const tT = useTranslations("Toasts")
  const te = useErrorTranslator()
  const L = useEnumLabel()
  const router = useRouter()
  const { unlinkProjectAction } = useClientActions()

  async function handleUnlink(project: ClientProjectOptionData) {
    try {
      unwrapActionResult(
        await unlinkProjectAction({ clientId, projectId: project.id })
      )
      toast.success(tT("projectUnlinked"))
      router.refresh()
    } catch (error) {
      toast.error(te(error, "internal"))
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">
            {t("clients.related.projects")}
          </CardTitle>
          {canEdit ? (
            <LinkProjectDialog
              clientId={clientId}
              linkedProjectIds={projects.map((project) => project.id)}
              trigger={
                <Button type="button" size="sm" variant="outline">
                  <PlusIcon data-icon="inline-start" />
                  {t("projectLinks.add")}
                </Button>
              }
            />
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        {projects.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("clients.related.noProjects")}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {projects.map((project) => (
              <li
                key={project.id}
                className="flex items-center justify-between gap-2"
              >
                <Link
                  href={`/${orgSlug}/projects/${project.id}`}
                  prefetch={false}
                  className="flex min-w-0 items-center gap-2 text-sm font-medium hover:underline"
                >
                  <FolderKanbanIcon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{project.name}</span>
                </Link>
                <span className="flex items-center gap-2">
                  <Badge variant="outline">
                    {L.projectStatus(project.status)}
                  </Badge>
                  {canEdit ? (
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label={t("projectLinks.unlink")}
                      onClick={() => void handleUnlink(project)}
                    >
                      <UnlinkIcon className="size-4" />
                    </Button>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

/** Dialog to link one or more existing projects to a company. */
export function LinkProjectDialog({
  clientId,
  linkedProjectIds,
  trigger,
}: {
  clientId: string
  linkedProjectIds: string[]
  trigger: React.ReactElement
}) {
  const t = useTranslations("Clients")
  const tT = useTranslations("Toasts")
  const te = useErrorTranslator()
  const L = useEnumLabel()
  const router = useRouter()
  const { fetchClientProjectOptionsAction, linkProjectAction } =
    useClientActions()

  const [open, setOpen] = React.useState(false)
  const [projects, setProjects] = React.useState<
    ClientProjectLinkOptionData[] | null
  >(null)
  const [loading, setLoading] = React.useState(false)
  const [query, setQuery] = React.useState("")
  const [selected, setSelected] = React.useState<string[]>([])
  const [submitting, setSubmitting] = React.useState(false)

  async function loadProjects() {
    setLoading(true)
    try {
      const list = unwrapActionResult(await fetchClientProjectOptionsAction())
      setProjects(list)
    } catch (error) {
      toast.error(te(error, "internal"))
    } finally {
      setLoading(false)
    }
  }

  const available = (projects ?? []).filter(
    (project) =>
      !linkedProjectIds.includes(project.id) &&
      project.name.toLowerCase().includes(query.trim().toLowerCase())
  )

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (selected.length === 0) return
    setSubmitting(true)
    let linked = 0
    let failed = 0
    for (const projectId of selected) {
      try {
        unwrapActionResult(await linkProjectAction({ clientId, projectId }))
        linked += 1
      } catch (error) {
        failed += 1
        if (failed === 1 && linked === 0) {
          toast.error(te(error, "internal"))
        }
      }
    }
    if (linked > 0) toast.success(tT("projectLinked"))
    setSubmitting(false)
    if (linked > 0) {
      setOpen(false)
      router.refresh()
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) {
          setSelected([])
          setQuery("")
          void loadProjects()
        }
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("projectLinks.dialogTitle")}</DialogTitle>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="client-project-link-search">
                {t("clients.related.projects")}
              </FieldLabel>
              <div className="relative">
                <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="client-project-link-search"
                  value={query}
                  placeholder={t("projectLinks.search")}
                  className="pl-9"
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
              <div className="flex max-h-56 flex-col gap-2 overflow-y-auto rounded-md border p-3">
                {loading ? (
                  <div className="flex justify-center py-4">
                    <Spinner className="size-4" />
                  </div>
                ) : available.length === 0 ? (
                  <p className="py-2 text-center text-sm text-muted-foreground">
                    {projects &&
                    projects.every((project) =>
                      linkedProjectIds.includes(project.id)
                    )
                      ? t("projectLinks.allLinked")
                      : t("projectLinks.empty")}
                  </p>
                ) : (
                  available.map((project) => (
                    <label
                      key={project.id}
                      className="flex items-center gap-2 text-sm"
                    >
                      <Checkbox
                        checked={selected.includes(project.id)}
                        onCheckedChange={(checked) =>
                          setSelected((prev) =>
                            checked === true
                              ? [...prev, project.id]
                              : prev.filter((id) => id !== project.id)
                          )
                        }
                      />
                      <FolderKanbanIcon className="size-4 shrink-0 text-muted-foreground" />
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate">{project.name}</span>
                        <span className="truncate text-xs text-muted-foreground">
                          {[
                            L.projectStatus(project.status),
                            project.clientName
                              ? t("projectLinks.linkedTo", {
                                  name: project.clientName,
                                })
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                    </label>
                  ))
                )}
              </div>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="submit"
              disabled={submitting || selected.length === 0}
            >
              {submitting ? <Spinner className="size-4" /> : null}
              {t("projectLinks.linkSelected", { count: selected.length })}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
