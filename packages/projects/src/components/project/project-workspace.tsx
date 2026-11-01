"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { FolderXIcon } from "lucide-react"

import { ProjectView } from "./project-view"
import { DashboardEmpty } from "../empty-state"
import { Button } from "@workspace/ui/components/button"

import { Link } from "@workspace/i18n/navigation"
import { useProjectStore } from "../../ui/store"
import { useOrgSlug } from "@workspace/organization/use-org-slug"

export function ProjectWorkspace({ projectId }: { projectId: string }) {
  const t = useTranslations("Projects")
  const { getProject, ensureProjectData } = useProjectStore()
  const orgSlug = useOrgSlug()
  const project = getProject(projectId)

  React.useEffect(() => {
    ensureProjectData()
  }, [ensureProjectData])

  if (!project) {
    return (
      <div className="flex flex-1 flex-col px-4 py-4 md:py-6 lg:px-6">
        <DashboardEmpty
          icon={FolderXIcon}
          title={t("notFoundTitle")}
          description={t("notFoundDescription")}
          className="flex-1 border"
          action={
            <Button
              render={<Link href={`/${orgSlug}/projects`} />}
              nativeButton={false}
            >
              {t("backToProjects")}
            </Button>
          }
        />
      </div>
    )
  }

  return <ProjectView project={project} />
}
