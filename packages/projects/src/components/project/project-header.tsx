"use client"

import * as React from "react"
import {
  Building2Icon,
  EllipsisIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react"
import { useLocale, useTranslations } from "next-intl"

import { MemberAvatar } from "../task/member-avatar"
import { TaskFormDialog } from "../task/task-dialog"
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
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@workspace/ui/components/breadcrumb"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"

import { Link } from "@workspace/i18n/navigation"
import { useProjectStore } from "../../ui/store"
import { useOrgSlug } from "@workspace/organization/use-org-slug"
import { useEnumLabel } from "@workspace/i18n/labels"
import { formatDate, type Project } from "../../types"

export function ProjectHeader({
  project,
  onDeleted,
}: {
  project: Project
  onDeleted: () => void
}) {
  const t = useTranslations("Projects")
  const locale = useLocale()
  const L = useEnumLabel()
  const { getMember, deleteProject } = useProjectStore()
  const orgSlug = useOrgSlug()
  const [editOpen, setEditOpen] = React.useState(false)
  const [deleteOpen, setDeleteOpen] = React.useState(false)
  const members = project.memberIds
    .map((id) => getMember(id))
    .filter((member) => member !== undefined)

  return (
    <div className="flex flex-col gap-4">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<Link href={`/${orgSlug}/projects`} />}>
              {t("projects")}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{project.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold">{project.name}</h2>
            <Badge variant="outline">{L.projectStatus(project.status)}</Badge>
            {project.clientId ? (
              <Link
                href={`/${orgSlug}/clients/${project.clientId}`}
                className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:underline"
                title={t("client")}
              >
                <Building2Icon className="size-3.5" />
                {project.clientName ?? t("client")}
              </Link>
            ) : null}
          </div>
          <p className="max-w-2xl text-sm text-muted-foreground">
            {project.description ?? t("noDescription")}
          </p>
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <div className="flex -space-x-2">
                {members.slice(0, 5).map((member) => (
                  <Tooltip key={member.id}>
                    <TooltipTrigger render={<span className="inline-flex" />}>
                      <MemberAvatar member={member} size="sm" />
                    </TooltipTrigger>
                    <TooltipContent>{member.name}</TooltipContent>
                  </Tooltip>
                ))}
              </div>
              <span>{t("memberCount", { count: members.length })}</span>
            </div>
            {project.dueDate ? (
              <span>
                {t("target", {
                  date: formatDate(project.dueDate, locale) ?? "",
                })}
              </span>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <TaskFormDialog
            projectId={project.id}
            trigger={
              <Button>
                <PlusIcon data-icon="inline-start" />
                {t("createTask")}
              </Button>
            }
          />
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="outline" size="icon" />}
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
      </div>

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
              {t("deleteProjectDescription", { name: project.name })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                deleteProject(project.id)
                onDeleted()
              }}
            >
              {t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
