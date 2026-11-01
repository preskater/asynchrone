"use client"

import * as filesActions from "@/actions/files"
import { FilesProvider } from "@workspace/files/store"
import type { FilesData } from "@workspace/files/types"

import { useProjectStore } from "@workspace/projects/store"
import { useWorkspaceNav } from "@/lib/workspace-nav/store"

/**
 * Copilot's binding of the files provider: it supplies the server actions,
 * the organization directory the share dialogs render and the workspace
 * navigation the files screens share with the shell.
 */
export function FilesShellProvider({
  children,
  initialData,
  currentUserId,
  organizationId,
  storageQuotaBytes,
}: {
  children: React.ReactNode
  initialData: FilesData
  currentUserId: string
  organizationId: string
  storageQuotaBytes: number
}) {
  const { members } = useProjectStore()
  const navigation = useWorkspaceNav()

  return (
    <FilesProvider
      actions={filesActions}
      initialData={initialData}
      currentUserId={currentUserId}
      organizationId={organizationId}
      storageQuotaBytes={storageQuotaBytes}
      members={members}
      navigation={{
        location: navigation.filesLocation,
        folderId: navigation.filesFolderId,
        selectLocation: navigation.selectFileLocation,
        openFolder: navigation.openFileFolder,
      }}
    >
      {children}
    </FilesProvider>
  )
}
