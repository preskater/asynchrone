"use client"

import * as React from "react"
import { useTranslations } from "next-intl"

import { useRouter } from "@workspace/i18n/navigation"
import { ProjectFilters, defaultFilters, filterTasks, type TaskFilters } from "@/components/project/project-filters"
import { ProjectDiscussion } from "@/components/project/project-discussion"
import { ProjectHeader } from "@/components/project/project-header"
import { ProjectOverview } from "@/components/project/project-overview"
import { ProjectSettings } from "@/components/project/project-settings"
import { TaskBoard } from "@/components/task/task-board"
import { TaskCalendar } from "@/components/task/task-calendar"
import { TaskDetails } from "@/components/task/task-details"
import { TaskList } from "@/components/task/task-list"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"

import { useProjectStore } from "@/lib/projects/store"
import { useOrgSlug } from "@/lib/organization/use-org-slug"
import { useRecents } from "@workspace/app-shell/recents"
import type { Project } from "@/lib/projects/types"

export function ProjectView({ project }: { project: Project }) {
  const t = useTranslations("Projects")
  const router = useRouter()
  const orgSlug = useOrgSlug()
  const store = useProjectStore()
  const { record } = useRecents()
  const [filters, setFilters] = React.useState<TaskFilters>(defaultFilters)
  const [activeTaskId, setActiveTaskId] = React.useState<string | undefined>()
  const [detailsOpen, setDetailsOpen] = React.useState(false)
  const [tab, setTab] = React.useState("overview")

  const currentUserId = store.members[0]?.id ?? "u_aria"
  const projectTasks = store.tasksForProject(project.id)
  const filteredTasks = filterTasks(projectTasks, filters, currentUserId)

  React.useEffect(() => {
    record("projects", {
      id: project.id,
      label: project.name,
      hint: t("taskCount", { count: projectTasks.length }),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id])

  function openTask(taskId: string) {
    setActiveTaskId(taskId)
    setDetailsOpen(true)
  }

  return (
    <div className="flex flex-1 flex-col gap-4 px-4 py-4 md:py-6 lg:px-6">
      <ProjectHeader
        project={project}
        onDeleted={() => router.push(`/${orgSlug}/projects`)}
      />

      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as string)}
        className="flex flex-1 flex-col gap-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList variant="line">
            <TabsTrigger value="overview">{t("overview")}</TabsTrigger>
            <TabsTrigger value="board">{t("board")}</TabsTrigger>
            <TabsTrigger value="list">{t("list")}</TabsTrigger>
            <TabsTrigger value="calendar">{t("calendar")}</TabsTrigger>
            <TabsTrigger value="discussion">{t("discussion")}</TabsTrigger>
            <TabsTrigger value="settings">{t("settings")}</TabsTrigger>
          </TabsList>
        </div>

        {tab !== "overview" && tab !== "settings" && tab !== "discussion" ? (
          <ProjectFilters filters={filters} onChange={setFilters} />
        ) : null}

        <TabsContent value="overview">
          <ProjectOverview project={project} />
        </TabsContent>

        <TabsContent value="board">
          <TaskBoard
            projectId={project.id}
            tasks={filteredTasks}
            onOpen={openTask}
          />
        </TabsContent>

        <TabsContent value="list">
          <TaskList tasks={filteredTasks} onOpen={openTask} />
        </TabsContent>

        <TabsContent value="calendar">
          <TaskCalendar tasks={filteredTasks} onOpen={openTask} />
        </TabsContent>

        <TabsContent value="discussion">
          <ProjectDiscussion projectId={project.id} />
        </TabsContent>

        <TabsContent value="settings">
          <ProjectSettings project={project} />
        </TabsContent>
      </Tabs>

      <TaskDetails
        taskId={activeTaskId}
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
      />
    </div>
  )
}
