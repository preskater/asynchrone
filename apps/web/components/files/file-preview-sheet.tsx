"use client"

import * as React from "react"
import {
  CalendarIcon,
  DownloadIcon,
  HardDriveIcon,
  HistoryIcon,
  LockIcon,
  PencilIcon,
  Share2Icon,
  ShieldIcon,
  StarIcon,
  Trash2Icon,
  UsersIcon,
} from "lucide-react"
import { toast } from "sonner"
import { useLocale, useTranslations } from "next-intl"

import { FileIcon } from "@/components/files/file-icon"
import { MemberAvatar } from "@workspace/projects/components/task/member-avatar"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@workspace/ui/components/alert-dialog"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Separator } from "@workspace/ui/components/separator"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/sheet"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"

import { formatBytes, formatRelativeDate } from "@/lib/files/file-utils"
import { useFiles } from "@/lib/files/store"
import { useEnumLabel } from "@workspace/i18n/labels"
import type { FileNode } from "@/lib/files/types"

function DetailRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <span className="w-24 shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 truncate">{value}</span>
    </div>
  )
}

export function FilePreviewSheet({
  file,
  open,
  onOpenChange,
  onOpenShare,
  onOpenPermissions,
}: {
  file?: FileNode
  open: boolean
  onOpenChange: (open: boolean) => void
  onOpenShare: (file: FileNode) => void
  onOpenPermissions: (file: FileNode) => void
}) {
  const { getMember, sharesFor, versions, activities, toggleStar, trashFile } =
    useFiles()
  const t = useTranslations("Files")
  const tc = useTranslations("Common")
  const tActivity = useTranslations("Activity")
  const locale = useLocale()
  const L = useEnumLabel()

  if (!file) return null
  const owner = getMember(file.ownerId)
  const entries = sharesFor(file.id)
  const fileVersions = versions[file.id] ?? []
  const fileActivities = activities[file.id] ?? []

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="border-b">
          <SheetTitle className="truncate">{file.name}</SheetTitle>
          <SheetDescription>
            {L.fileKind(file.kind)} · {formatBytes(file.sizeBytes)}
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
          <div className="flex aspect-video w-full items-center justify-center rounded-xl bg-muted/40">
            <FileIcon kind={file.kind} className="size-16" />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                window.open(`/api/files/${file.id}/download`, "_blank")
              }
            >
              <DownloadIcon data-icon="inline-start" />
              {t("download")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenShare(file)}
            >
              <Share2Icon data-icon="inline-start" />
              {t("share")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => toggleStar(file.id)}
            >
              <StarIcon data-icon="inline-start" />
              {file.starred ? t("favorited") : t("favorite")}
            </Button>
          </div>

          <Separator />

          <div className="flex flex-col gap-3">
            <DetailRow
              icon={UsersIcon}
              label={t("owner")}
              value={owner?.name ?? t("unknown")}
            />
            <DetailRow
              icon={CalendarIcon}
              label={t("modified")}
              value={formatRelativeDate(file.modifiedAt, locale, tc)}
            />
            <DetailRow
              icon={HardDriveIcon}
              label={t("size")}
              value={formatBytes(file.sizeBytes)}
            />
            <DetailRow
              icon={ShieldIcon}
              label={t("type")}
              value={L.fileKind(file.kind)}
            />
          </div>

          <Tabs defaultValue="details">
            <TabsList variant="line">
              <TabsTrigger value="details">{t("people")}</TabsTrigger>
              <TabsTrigger value="versions">{t("versions")}</TabsTrigger>
              <TabsTrigger value="activity">{t("activity")}</TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="pt-3">
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-3">
                  <MemberAvatar member={owner} size="sm" />
                  <span className="flex-1 text-sm">{owner?.name}</span>
                  <Badge variant="secondary">{t("owner")}</Badge>
                </div>
                {entries.map((entry) => {
                  const member = getMember(entry.memberId)
                  if (!member) return null
                  return (
                    <div
                      key={entry.memberId}
                      className="flex items-center gap-3"
                    >
                      <MemberAvatar member={member} size="sm" />
                      <span className="flex-1 text-sm">{member.name}</span>
                      <Badge variant="outline">
                        {L.sharePermission(entry.permission)}
                      </Badge>
                    </div>
                  )
                })}
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-1 w-fit"
                  onClick={() => onOpenPermissions(file)}
                >
                  <LockIcon data-icon="inline-start" />
                  {t("managePermissions")}
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="versions" className="pt-3">
              <div className="flex flex-col gap-3">
                {fileVersions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t("versionsEmpty")}
                  </p>
                ) : (
                  fileVersions.map((version) => {
                    const author = getMember(version.memberId)
                    return (
                      <div key={version.id} className="flex items-start gap-3">
                        <span className="mt-1 flex size-7 items-center justify-center rounded-full bg-muted">
                          <HistoryIcon className="size-3.5 text-muted-foreground" />
                        </span>
                        <div className="flex flex-col">
                          <span className="text-sm">{version.note}</span>
                          <span className="text-xs text-muted-foreground">
                            {author?.name} ·{" "}
                            {formatRelativeDate(version.at, locale, tc)}
                          </span>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </TabsContent>

            <TabsContent value="activity" className="pt-3">
              <div className="flex flex-col gap-3">
                {fileActivities.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t("activityEmpty")}
                  </p>
                ) : (
                  fileActivities.map((activity) => {
                    const actor = getMember(activity.memberId)
                    return (
                      <div key={activity.id} className="flex items-start gap-3">
                        <MemberAvatar member={actor} size="sm" />
                        <div className="flex flex-col">
                          <span className="text-sm">
                            <span className="font-medium">{actor?.name}</span>{" "}
                            <span className="text-muted-foreground">
                              {tActivity(activity.action as never)}
                            </span>
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {formatRelativeDate(activity.at, locale, tc)}
                          </span>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <div className="flex items-center justify-between gap-2 border-t p-4">
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button variant="ghost" size="sm">
                  <Trash2Icon data-icon="inline-start" />
                  {t("moveToTrash")}
                </Button>
              }
            />
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t("moveToTrashQuestion")}</AlertDialogTitle>
                <AlertDialogDescription>
                  {t("moveToTrashDescription", { name: file.name })}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  onClick={() => {
                    trashFile(file.id)
                    onOpenChange(false)
                  }}
                >
                  {t("moveToTrash")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenPermissions(file)}
          >
            <PencilIcon data-icon="inline-start" />
            {t("permissions")}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
