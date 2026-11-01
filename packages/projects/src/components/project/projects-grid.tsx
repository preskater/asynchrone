"use client"

import * as React from "react"
import { EllipsisIcon, FolderIcon, PencilIcon, Trash2Icon } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"

import { DashboardEmpty } from "../empty-state"
import { MemberAvatar } from "../task/member-avatar"
import { ProjectFormDialog } from "./project-dialog"
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
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { Progress } from "@workspace/ui/components/progress"

import { Link } from "@workspace/i18n/navigation"
import { useProjectStore } from "../../ui/store"
import { useOrgSlug } from "@workspace/organization/use-org-slug"
import { useEnumLabel } from "@workspace/i18n/labels"
import { formatDate, type Project } from "../../types"

function ProjectCard({ project }: { project: Project }) {
  const t = useTranslations("Projects")
  const locale = useLocale()
  const L = useEnumLabel()
  const orgSlug = useOrgSlug()
  const { tasksForProject, getMember, deleteProject, tasksLoaded } =
    useProjectStore()
  const [editOpen, setEditOpen] = React.useState(false)
  const [deleteOpen, setDeleteOpen] = React.useState(false)
  const tasks = tasksForProject(project.id)
  const total = tasksLoaded ? tasks.length : (project.taskCount ?? 0)
  const done = tasksLoaded
    ? tasks.filter((task) => task.status === "done").length
    : (project.doneTaskCount ?? 0)
  const progress = total ? Math.round((done / total) * 100) : 0
  const members = project.memberIds
    .map((id) => getMember(id))
    .filter((member) => member !== undefined)

  return (
    <Card className="group/card relative transition-colors hover:ring-foreground/20">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <CardTitle className="line-clamp-1">
              <Link href={`/${orgSlug}/projects/${project.id}`}>
                <span className="absolute inset-0" />
                {project.name}
              </Link>
            </CardTitle>
            <CardDescription className="line-clamp-2">
              {project.description ?? t("noDescription")}
            </CardDescription>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="relative z-10 shrink-0"
                />
              }
            >
              <EllipsisIcon />
              <span className="sr-only">{t("projectActions")}</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuGroup>
                <DropdownMenuItem onClick={() => setEditOpen(true)}>
                  <PencilIcon />
                  {t("editProject")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={() => setDeleteOpen(true)}
                >
                  <Trash2Icon />
                  {t("deleteProject")}
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-2">
          <Badge variant="outline">{L.projectStatus(project.status)}</Badge>
          <span className="text-xs text-muted-foreground">
            {t("tasksDone", { done, total })}
          </span>
        </div>
        <Progress value={progress} />
        <div className="flex items-center justify-between gap-2">
          <div className="flex -space-x-2">
            {members.slice(0, 4).map((member) => (
              <MemberAvatar key={member.id} member={member} size="sm" />
            ))}
          </div>
          {project.dueDate ? (
            <span className="text-xs text-muted-foreground">
              {t("due", { date: formatDate(project.dueDate, locale) ?? "" })}
            </span>
          ) : null}
        </div>
      </CardContent>

      <ProjectFormDialog
        project={project}
        open={editOpen}
        onOpenChange={setEditOpen}
      />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteProjectQuestion")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteProjectTasksDescription", {
                name: project.name,
                count: total,
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => deleteProject(project.id)}
            >
              {t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}

export function ProjectsGrid() {
  const t = useTranslations("Projects")
  const { projects, ensureProjectData } = useProjectStore()

  React.useEffect(() => {
    ensureProjectData()
  }, [ensureProjectData])

  if (projects.length === 0) {
    return (
      <DashboardEmpty
        icon={FolderIcon}
        title={t("noProjectsTitle")}
        description={t("noProjectsDescription")}
        className="flex-1 border"
        action={
          <ProjectFormDialog trigger={<Button>{t("createProject")}</Button>} />
        }
      />
    )
  }

  return (
    <div className="grid grid-cols-1 gap-4 @3xl/main:grid-cols-2 @5xl/main:grid-cols-3">
      {projects.map((project) => (
        <ProjectCard key={project.id} project={project} />
      ))}
    </div>
  )
}
