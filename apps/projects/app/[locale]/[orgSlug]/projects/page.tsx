import { getTranslations } from "next-intl/server"

import { ProjectFormDialog } from "@workspace/projects/components/project/project-dialog"
import { ProjectsGrid } from "@workspace/projects/components/project/projects-grid"
import { Button } from "@workspace/ui/components/button"

/**
 * The projects list.
 *
 * The shell already loaded projects, members, labels and templates
 * (`listShell` in the layout); the grid reads them from the store and loads
 * tasks on demand.
 */
export default async function ProjectsPage() {
  const t = await getTranslations("AppPages")
  return (
    <div className="flex flex-1 flex-col gap-4 px-4 py-4 md:py-6 lg:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">{t("projectsTitle")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("projectsDescription")}
          </p>
        </div>
        <ProjectFormDialog trigger={<Button>{t("createProject")}</Button>} />
      </div>
      <ProjectsGrid />
    </div>
  )
}
