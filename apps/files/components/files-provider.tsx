"use client"

import * as React from "react"

import * as filesActions from "@/actions/files"
import { FilesProvider } from "@workspace/files/store"
import type {
  FilesData,
  FilesMember,
  FilesNavigation,
  FileLocation,
} from "@workspace/files/types"

/**
 * The files app's binding of the files provider: it supplies the server
 * actions, the organization directory the share dialogs render and the
 * navigation state the files screens share with the sidebar.
 *
 * Copilot kept this state in its workspace store; the files host owns only
 * files, so the provider keeps it locally.
 */
export function FilesShellProvider({
  children,
  initialData,
  currentUserId,
  organizationId,
  storageQuotaBytes,
  members,
}: {
  children: React.ReactNode
  initialData: FilesData
  currentUserId: string
  organizationId: string
  storageQuotaBytes: number
  members: FilesMember[]
}) {
  const [location, setLocation] = React.useState<FileLocation>("my-files")
  const [folderId, setFolderId] = React.useState<string | null>(null)

  const navigation: FilesNavigation = React.useMemo(
    () => ({
      location,
      folderId,
      selectLocation: (next: FileLocation) => {
        setLocation(next)
        setFolderId(null)
      },
      openFolder: (next: string | null) => {
        setLocation("my-files")
        setFolderId(next)
      },
    }),
    [location, folderId]
  )

  return (
    <FilesProvider
      actions={filesActions}
      initialData={initialData}
      currentUserId={currentUserId}
      organizationId={organizationId}
      storageQuotaBytes={storageQuotaBytes}
      members={members}
      navigation={navigation}
    >
      {children}
    </FilesProvider>
  )
}
