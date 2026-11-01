export type FileKind =
  | "folder"
  | "document"
  | "spreadsheet"
  | "presentation"
  | "pdf"
  | "image"
  | "video"
  | "audio"
  | "archive"
  | "code"
  | "other"

export type FileLocation =
  "my-files" | "shared" | "recent" | "favorites" | "trash"

export type SharePermission = "view" | "comment" | "edit"

export interface FileNode {
  id: string
  name: string
  kind: FileKind
  parentId: string | null
  ownerId: string
  modifiedAt: string
  sizeBytes?: number
  mimeType?: string
  hasStorage?: boolean
  starred: boolean
  trashed: boolean
  trashedAt?: string
  shared: boolean
  restricted: boolean
}

export interface ShareEntry {
  memberId: string
  permission: SharePermission
}

export interface FileVersion {
  id: string
  memberId: string
  at: string
  note: string
  sizeBytes?: number
  hasStorage?: boolean
}

export interface FileActivity {
  id: string
  memberId: string
  action: string
  at: string
}

export type UploadStatus = "queued" | "uploading" | "done" | "error"

export interface UploadItem {
  id: string
  name: string
  sizeBytes: number
  progress: number
  status: UploadStatus
}

export interface FilesData {
  files: FileNode[]
  shares: Record<string, ShareEntry[]>
  versions: Record<string, FileVersion[]>
  activities: Record<string, FileActivity[]>
}

/**
 * The member fields files screens render. The workspace shell supplies the
 * organization directory; the shape matches the projects `Member` so an app
 * can pass its existing list without mapping.
 */
export interface FilesMember {
  id: string
  name: string
  email?: string
  avatarUrl?: string
}

/** Folder/location navigation the files screens share with the app shell. */
export interface FilesNavigation {
  location: FileLocation
  folderId: string | null
  selectLocation: (location: FileLocation) => void
  openFolder: (folderId: string | null) => void
}

export const SHARE_PERMISSIONS: { value: SharePermission; label: string }[] = [
  { value: "view", label: "Can view" },
  { value: "comment", label: "Can comment" },
  { value: "edit", label: "Can edit" },
]

export const PERMISSION_LABEL: Record<SharePermission, string> = {
  view: "Can view",
  comment: "Can comment",
  edit: "Can edit",
}

export const LOCATION_LABEL: Record<FileLocation, string> = {
  "my-files": "My files",
  shared: "Shared with me",
  recent: "Recent",
  favorites: "Favorites",
  trash: "Trash",
}
