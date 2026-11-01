"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

import {
  addShareAction,
  bulkDeleteAction,
  bulkRestoreAction,
  bulkTrashAction,
  createFolderAction,
  deleteFileAction,
  duplicateFileAction,
  listFilesAction,
  moveFileAction,
  removeShareAction,
  renameFileAction,
  restoreFileAction,
  setFileRestrictedAction,
  toggleStarAction,
  trashFileAction,
  updateShareAction,
} from "@/actions/files"
import { unwrapActionResult } from "@workspace/core/action"
import { useErrorTranslator } from "@workspace/i18n/errors"
import { uploadFile } from "@/lib/files/upload-client"
import type { Member } from "@/lib/projects/types"
import { useProjectStore } from "@/lib/projects/store"

import { kindFromName } from "./file-utils"
import type {
  FileLocation,
  FileNode,
  FilesData,
  ShareEntry,
  SharePermission,
  UploadItem,
} from "./types"

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`
}

interface FilesStore extends FilesData {
  members: Member[]
  currentUserId: string
  organizationId: string
  storageQuotaBytes: number
  uploads: UploadItem[]
  filesLoaded: boolean
  /** Load the file tree the first time a files screen is opened. */
  ensureFilesLoaded: () => void
  getMember: (id?: string) => Member | undefined
  getFile: (id?: string) => FileNode | undefined
  breadcrumbFor: (folderId: string | null) => FileNode[]
  childrenOf: (
    location: FileLocation,
    folderId: string | null,
    query?: string
  ) => FileNode[]
  sharesFor: (id: string) => ShareEntry[]
  locationCounts: Record<FileLocation, number>
  createFolder: (parentId: string | null, name: string) => void
  renameFile: (id: string, name: string) => void
  moveFile: (id: string, parentId: string | null) => void
  duplicateFile: (id: string) => void
  toggleStar: (id: string) => void
  trashFile: (id: string) => void
  restoreFile: (id: string) => void
  deleteForever: (id: string) => void
  moveToTrashMany: (ids: string[]) => void
  restoreMany: (ids: string[]) => void
  deleteMany: (ids: string[]) => void
  addShare: (id: string, memberId: string, permission: SharePermission) => void
  setPermission: (
    id: string,
    memberId: string,
    permission: SharePermission
  ) => void
  removeShare: (id: string, memberId: string) => void
  setRestricted: (id: string, restricted: boolean) => void
  enqueueUploads: (files: File[], parentId: string | null) => void
  removeUpload: (id: string) => void
  clearCompletedUploads: () => void
}

const FilesContext = React.createContext<FilesStore | null>(null)

export function FilesProvider({
  children,
  initialData,
  currentUserId,
  organizationId,
  storageQuotaBytes,
  members: initialMembers = [],
}: {
  children: React.ReactNode
  initialData: FilesData
  currentUserId: string
  organizationId: string
  storageQuotaBytes: number
  members?: Member[]
}) {
  const projectMembers = useProjectStore().members
  const members = initialMembers.length > 0 ? initialMembers : projectMembers

  const t = useTranslations("Toasts")
  const te = useErrorTranslator()
  const [files, setFiles] = React.useState<FileNode[]>(initialData.files)
  const [shares, setShares] = React.useState<Record<string, ShareEntry[]>>(
    initialData.shares
  )
  const [versions, setVersions] = React.useState<
    Record<string, FilesData["versions"][string]>
  >(initialData.versions)
  const [activities, setActivities] = React.useState<
    Record<string, FilesData["activities"][string]>
  >(initialData.activities)
  const [uploads, setUploads] = React.useState<UploadItem[]>([])
  const [filesLoaded, setFilesLoaded] = React.useState(
    initialData.files.length > 0
  )
  const filesLoadedRef = React.useRef(filesLoaded)

  React.useEffect(() => {
    if (filesLoadedRef.current) return
    setFiles(initialData.files)
    setShares(initialData.shares)
    setVersions(initialData.versions)
    setActivities(initialData.activities)
  }, [initialData])

  const ensureFilesLoaded = React.useCallback(() => {
    if (filesLoadedRef.current) return
    filesLoadedRef.current = true
    setFilesLoaded(true)
    void listFilesAction()
      .then((result) => {
        const data = unwrapActionResult(result)
        setFiles(data.files)
        setShares(data.shares)
        setVersions(data.versions)
        setActivities(data.activities)
      })
      .catch(() => {
        filesLoadedRef.current = false
        setFilesLoaded(false)
      })
  }, [])

  const store = React.useMemo<FilesStore>(() => {
    const getMember = (id?: string) =>
      id ? members.find((member) => member.id === id) : undefined
    const getFile = (id?: string) =>
      id ? files.find((file) => file.id === id) : undefined

    const breadcrumbFor = (folderId: string | null) => {
      const trail: FileNode[] = []
      let current = folderId ? getFile(folderId) : undefined
      while (current) {
        trail.unshift(current)
        current = current.parentId ? getFile(current.parentId) : undefined
      }
      return trail
    }

    const matches = (file: FileNode, query: string) =>
      !query || file.name.toLowerCase().includes(query.toLowerCase())

    const childrenOf = (
      location: FileLocation,
      folderId: string | null,
      query = ""
    ) => {
      let list: FileNode[]
      if (location === "trash") {
        list = files.filter((file) => file.trashed)
      } else if (location === "favorites") {
        list = files.filter(
          (file) => !file.trashed && file.starred && file.kind !== "folder"
        )
      } else if (location === "shared") {
        list = files.filter(
          (file) =>
            !file.trashed &&
            file.kind !== "folder" &&
            (file.ownerId !== currentUserId || file.shared)
        )
      } else if (location === "recent") {
        list = files
          .filter((file) => !file.trashed && file.kind !== "folder")
          .sort(
            (a, b) =>
              new Date(b.modifiedAt).getTime() -
              new Date(a.modifiedAt).getTime()
          )
      } else {
        list = files.filter(
          (file) => !file.trashed && file.parentId === folderId
        )
      }
      return list
        .filter((file) => matches(file, query))
        .sort((a, b) => {
          if (a.kind === "folder" && b.kind !== "folder") return -1
          if (b.kind === "folder" && a.kind !== "folder") return 1
          return a.name.localeCompare(b.name)
        })
    }

    const locationCounts: Record<FileLocation, number> = {
      "my-files": files.filter(
        (file) => !file.trashed && file.kind !== "folder"
      ).length,
      shared: files.filter(
        (file) =>
          !file.trashed &&
          file.kind !== "folder" &&
          (file.ownerId !== currentUserId || file.shared)
      ).length,
      recent: files.filter((file) => !file.trashed && file.kind !== "folder")
        .length,
      favorites: files.filter(
        (file) => !file.trashed && file.starred && file.kind !== "folder"
      ).length,
      trash: files.filter((file) => file.trashed).length,
    }

    function logActivity(id: string, action: string) {
      setActivities((prev) => ({
        ...prev,
        [id]: [
          {
            id: uid("t"),
            memberId: currentUserId,
            action,
            at: new Date().toISOString(),
          },
          ...(prev[id] ?? []),
        ],
      }))
    }

    function trashIds(ids: string[]) {
      const set = new Set(ids)
      setFiles((prev) =>
        prev.map((file) =>
          set.has(file.id)
            ? { ...file, trashed: true, trashedAt: new Date().toISOString() }
            : file
        )
      )
    }

    function updateUpload(id: string, patch: Partial<UploadItem>) {
      setUploads((prev) =>
        prev.map((item) => (item.id === id ? { ...item, ...patch } : item))
      )
    }

    async function uploadOne(
      item: UploadItem,
      file: File,
      parentId: string | null
    ) {
      try {
        updateUpload(item.id, { status: "uploading" })
        const created = await uploadFile(file, {
          parentId,
          onProgress: ({ percentage }) => {
            updateUpload(item.id, {
              progress: Math.round(percentage),
              status: "uploading",
            })
          },
        })
        setFiles((prev) => [created, ...prev])
        updateUpload(item.id, { progress: 100, status: "done" })
      } catch (error) {
        updateUpload(item.id, { status: "error" })
        toast.error(te(error, "uploadFailed"))
      }
    }

    return {
      files,
      shares,
      versions,
      activities,
      members,
      uploads,
      currentUserId,
      organizationId,
      storageQuotaBytes,
      filesLoaded,
      ensureFilesLoaded,
      getMember,
      getFile,
      breadcrumbFor,
      childrenOf,
      sharesFor: (id) => shares[id] ?? [],
      locationCounts,
      createFolder: (parentId, name) => {
        const optimistic: FileNode = {
          id: uid("folder"),
          name: name.trim(),
          kind: "folder",
          parentId,
          ownerId: currentUserId,
          modifiedAt: new Date().toISOString(),
          starred: false,
          trashed: false,
          shared: false,
          restricted: false,
        }
        setFiles((prev) => [...prev, optimistic])
        void createFolderAction({ parentId, name })
          .then((result) => {
            const folder = unwrapActionResult(result)
            setFiles((prev) =>
              prev.map((item) => (item.id === optimistic.id ? folder : item))
            )
            toast.success(t("folderCreated", { name: folder.name }))
          })
          .catch((error) => {
            setFiles((prev) => prev.filter((item) => item.id !== optimistic.id))
            toast.error(te(error, "createFolderFailed"))
          })
      },
      renameFile: (id, name) => {
        setFiles((prev) =>
          prev.map((file) =>
            file.id === id
              ? {
                  ...file,
                  name: name.trim(),
                  modifiedAt: new Date().toISOString(),
                }
              : file
          )
        )
        logActivity(id, "renamedThisFile")
        void renameFileAction(id, { name })
          .then((result) => {
            unwrapActionResult(result)
            toast.success(t("fileRenamed"))
          })
          .catch((error) => toast.error(te(error, "renameFailed")))
      },
      moveFile: (id, parentId) => {
        setFiles((prev) =>
          prev.map((file) =>
            file.id === id
              ? { ...file, parentId, modifiedAt: new Date().toISOString() }
              : file
          )
        )
        void moveFileAction(id, { parentId })
          .then((result) => {
            unwrapActionResult(result)
            toast.success(t("fileMoved"))
          })
          .catch((error) => toast.error(te(error, "moveFailed")))
      },
      duplicateFile: (id) => {
        const source = getFile(id)
        if (!source) return
        const dotIndex = source.name.lastIndexOf(".")
        const copyName =
          dotIndex > 0
            ? `${source.name.slice(0, dotIndex)} (copy)${source.name.slice(dotIndex)}`
            : `${source.name} (copy)`
        const optimistic: FileNode = {
          ...source,
          id: uid("file"),
          name: copyName,
          ownerId: currentUserId,
          modifiedAt: new Date().toISOString(),
          starred: false,
          trashed: false,
        }
        setFiles((prev) => [...prev, optimistic])
        void duplicateFileAction(id)
          .then((result) => {
            const file = unwrapActionResult(result)
            setFiles((prev) =>
              prev.map((item) => (item.id === optimistic.id ? file : item))
            )
            toast.success(t("duplicateCreated"))
          })
          .catch((error) => {
            setFiles((prev) => prev.filter((item) => item.id !== optimistic.id))
            toast.error(te(error, "duplicateFailed"))
          })
      },
      toggleStar: (id) => {
        let starred = false
        setFiles((prev) =>
          prev.map((file) => {
            if (file.id !== id) return file
            starred = !file.starred
            return { ...file, starred }
          })
        )
        void toggleStarAction(id)
          .then((result) => {
            unwrapActionResult(result)
            toast.success(starred ? t("favoriteAdded") : t("favoriteRemoved"))
          })
          .catch((error) => toast.error(te(error, "updateFailed")))
      },
      trashFile: (id) => {
        trashIds([id])
        logActivity(id, "movedThisFileToTrash")
        void trashFileAction(id)
          .then((result) => {
            unwrapActionResult(result)
            toast.success(t("movedToTrash"))
          })
          .catch((error) => toast.error(te(error, "deleteFailed")))
      },
      restoreFile: (id) => {
        setFiles((prev) =>
          prev.map((file) =>
            file.id === id
              ? { ...file, trashed: false, trashedAt: undefined }
              : file
          )
        )
        void restoreFileAction(id)
          .then((result) => {
            unwrapActionResult(result)
            toast.success(t("fileRestored"))
          })
          .catch((error) => toast.error(te(error, "restoreFailed")))
      },
      deleteForever: (id) => {
        setFiles((prev) => prev.filter((file) => file.id !== id))
        void deleteFileAction(id)
          .then((result) => {
            unwrapActionResult(result)
            toast.success(t("fileDeleted"))
          })
          .catch((error) => toast.error(te(error, "deleteFailed")))
      },
      moveToTrashMany: (ids) => {
        trashIds(ids)
        void bulkTrashAction({ ids })
          .then((result) => {
            unwrapActionResult(result)
            toast.success(t("movedToTrash"))
          })
          .catch((error) => toast.error(te(error, "deleteFailed")))
      },
      restoreMany: (ids) => {
        const set = new Set(ids)
        setFiles((prev) =>
          prev.map((file) =>
            set.has(file.id)
              ? { ...file, trashed: false, trashedAt: undefined }
              : file
          )
        )
        void bulkRestoreAction({ ids })
          .then((result) => {
            unwrapActionResult(result)
            toast.success(t("fileRestored"))
          })
          .catch((error) => toast.error(te(error, "restoreFailed")))
      },
      deleteMany: (ids) => {
        const set = new Set(ids)
        setFiles((prev) => prev.filter((file) => !set.has(file.id)))
        void bulkDeleteAction({ ids })
          .then((result) => {
            unwrapActionResult(result)
            toast.success(t("fileDeleted"))
          })
          .catch((error) => toast.error(te(error, "deleteFailed")))
      },
      addShare: (id, memberId, permission) => {
        setShares((prev) => {
          const existing = prev[id] ?? []
          if (existing.some((entry) => entry.memberId === memberId)) {
            return prev
          }
          return { ...prev, [id]: [...existing, { memberId, permission }] }
        })
        setFiles((prev) =>
          prev.map((file) =>
            file.id === id ? { ...file, shared: true } : file
          )
        )
        void addShareAction(id, { memberId, permission })
          .then((result) => unwrapActionResult(result))
          .catch((error) => toast.error(te(error, "shareFailed")))
      },
      setPermission: (id, memberId, permission) => {
        setShares((prev) => ({
          ...prev,
          [id]: (prev[id] ?? []).map((entry) =>
            entry.memberId === memberId ? { ...entry, permission } : entry
          ),
        }))
        void updateShareAction(id, { memberId, permission })
          .then((result) => {
            unwrapActionResult(result)
            toast.success(t("permissionUpdated"))
          })
          .catch((error) => toast.error(te(error, "updateFailed")))
      },
      removeShare: (id, memberId) => {
        setShares((prev) => ({
          ...prev,
          [id]: (prev[id] ?? []).filter((entry) => entry.memberId !== memberId),
        }))
        void removeShareAction(id, { memberId })
          .then((result) => {
            unwrapActionResult(result)
            toast.success(t("accessRemoved"))
          })
          .catch((error) => toast.error(te(error, "removeFailed")))
      },
      setRestricted: (id, restricted) => {
        setFiles((prev) =>
          prev.map((file) => (file.id === id ? { ...file, restricted } : file))
        )
        void setFileRestrictedAction(id, { restricted })
          .then((result) => unwrapActionResult(result))
          .catch((error) => toast.error(te(error, "updateFailed")))
      },
      enqueueUploads: (files, parentId) => {
        const queued: Array<{ item: UploadItem; file: File }> = files.map(
          (file) => ({
            file,
            item: {
              id: uid("upload"),
              name: file.name,
              sizeBytes: file.size,
              progress: 0,
              status: "queued",
            },
          })
        )
        setUploads((prev) => [...prev, ...queued.map((entry) => entry.item)])
        for (const entry of queued) {
          void uploadOne(entry.item, entry.file, parentId)
        }
      },
      removeUpload: (id) => {
        setUploads((prev) => prev.filter((item) => item.id !== id))
      },
      clearCompletedUploads: () => {
        setUploads((prev) => prev.filter((item) => item.status !== "done"))
      },
    }
  }, [
    files,
    shares,
    versions,
    activities,
    uploads,
    members,
    currentUserId,
    organizationId,
    storageQuotaBytes,
    filesLoaded,
    ensureFilesLoaded,
  ])

  return <FilesContext.Provider value={store}>{children}</FilesContext.Provider>
}

export function useFiles() {
  const context = React.useContext(FilesContext)
  if (!context) {
    throw new Error("useFiles must be used within a FilesProvider")
  }
  return context
}
