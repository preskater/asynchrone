"use client"

import {
  ProjectStoreProvider,
  type ProjectLive,
} from "@workspace/projects/store"
import type { Comment, ProjectData } from "@workspace/projects/types"
import { openLiveStream } from "@workspace/realtime/client"

/**
 * The projects app's binding of the project store: the server actions from
 * the layout plus the browser-side real-time reads (#98), which are plain
 * route handlers so a hint can never abort a navigation.
 */
const projectLive: ProjectLive = {
  subscribe: (onChange) => openLiveStream("/api/projects/stream", onChange),
  async taskComments(taskId) {
    const response = await fetch(
      `/api/tasks/${encodeURIComponent(taskId)}/comments`,
      { cache: "no-store", headers: { Accept: "application/json" } }
    )
    if (!response.ok)
      throw new Error(`Comments read failed: ${response.status}`)
    return (await response.json()) as Comment[]
  },
}

export function ProjectStoreShellProvider(
  props: Omit<React.ComponentProps<typeof ProjectStoreProvider>, "live">
) {
  return <ProjectStoreProvider {...props} live={projectLive} />
}
