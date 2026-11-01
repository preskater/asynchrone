import {
  ArchiveIcon,
  BracesIcon,
  FileIcon,
  FileTextIcon,
  FilmIcon,
  FolderIcon,
  ImageIcon,
  MusicIcon,
  PresentationIcon,
  TableIcon,
  type LucideIcon,
} from "lucide-react"

import type { FileKind } from "./types"

export const FILE_KIND_ICON: Record<FileKind, LucideIcon> = {
  folder: FolderIcon,
  document: FileTextIcon,
  spreadsheet: TableIcon,
  presentation: PresentationIcon,
  pdf: FileTextIcon,
  image: ImageIcon,
  video: FilmIcon,
  audio: MusicIcon,
  archive: ArchiveIcon,
  code: BracesIcon,
  other: FileIcon,
}

export const FILE_KIND_LABEL: Record<FileKind, string> = {
  folder: "Folder",
  document: "Document",
  spreadsheet: "Spreadsheet",
  presentation: "Presentation",
  pdf: "PDF",
  image: "Image",
  video: "Video",
  audio: "Audio",
  archive: "Archive",
  code: "Code",
  other: "File",
}

export const FILE_KIND_COLOR: Record<FileKind, string> = {
  folder: "text-[color:var(--chart-4)]",
  document: "text-[color:var(--chart-3)]",
  spreadsheet: "text-[color:var(--chart-2)]",
  presentation: "text-[color:var(--chart-4)]",
  pdf: "text-destructive",
  image: "text-[color:var(--chart-2)]",
  video: "text-[color:var(--chart-5)]",
  audio: "text-[color:var(--chart-5)]",
  archive: "text-muted-foreground",
  code: "text-[color:var(--chart-3)]",
  other: "text-muted-foreground",
}

export type CommonTranslator = (...args: never[]) => string

const FALLBACK: Record<string, string> = {
  justNow: "Just now",
  yesterday: "Yesterday",
  minutesAgo: "{count} min ago",
  hoursAgo: "{count}h ago",
  daysAgo: "{count} days ago",
}

function word(
  t: CommonTranslator | undefined,
  key: keyof typeof FALLBACK,
  values?: Record<string, string | number>
) {
  if (t) {
    const translate = t as unknown as (
      key: string,
      values?: Record<string, string | number>
    ) => string
    return translate(key, values)
  }
  const template = FALLBACK[key] ?? ""
  return values
    ? template.replace(/\{(\w+)\}/g, (_, name) => String(values[name] ?? ""))
    : template
}

export function formatBytes(bytes?: number) {
  if (bytes === undefined || bytes === null) return "—"
  if (bytes === 0) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB"]
  const exponent = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  )
  const value = bytes / Math.pow(1024, exponent)
  return `${value >= 10 || exponent === 0 ? Math.round(value) : value.toFixed(1)} ${units[exponent]}`
}

export function formatRelativeDate(
  value: string,
  locale = "en",
  t?: CommonTranslator
) {
  const date = new Date(value)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.round(diffMs / 60000)
  if (diffMins < 1) return word(t, "justNow")
  if (diffMins < 60) return word(t, "minutesAgo", { count: diffMins })
  const diffHours = Math.round(diffMins / 60)
  if (diffHours < 24) return word(t, "hoursAgo", { count: diffHours })
  const diffDays = Math.round(diffHours / 24)
  if (diffDays === 1) return word(t, "yesterday")
  if (diffDays < 7) return word(t, "daysAgo", { count: diffDays })
  return date.toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
    year: date.getFullYear() === now.getFullYear() ? undefined : "numeric",
  })
}

export function fileExtension(name: string) {
  const parts = name.split(".")
  return parts.length > 1 ? `.${parts[parts.length - 1]}` : ""
}

export function kindFromName(name: string): FileKind {
  const ext = fileExtension(name).toLowerCase()
  if ([".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp"].includes(ext))
    return "image"
  if ([".mp4", ".mov", ".webm"].includes(ext)) return "video"
  if ([".mp3", ".wav", ".m4a"].includes(ext)) return "audio"
  if ([".zip", ".tar", ".gz", ".rar"].includes(ext)) return "archive"
  if ([".ts", ".tsx", ".js", ".jsx", ".json", ".css", ".html"].includes(ext))
    return "code"
  if (ext === ".pdf") return "pdf"
  if ([".xls", ".xlsx", ".csv"].includes(ext)) return "spreadsheet"
  if ([".ppt", ".pptx", ".key"].includes(ext)) return "presentation"
  if ([".doc", ".docx", ".txt", ".md", ".rtf"].includes(ext)) return "document"
  return "other"
}
