"use client"

import * as React from "react"
import { LinkIcon, LockIcon, PlusIcon, XIcon } from "lucide-react"
import { toast } from "sonner"
import { useTranslations } from "next-intl"

import { PlanUpgradePrompt } from "@/components/organization/plan-upgrade-prompt"
import { MemberAvatar } from "@workspace/projects/components/task/member-avatar"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@workspace/ui/components/command"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"

import { useFiles } from "@/lib/files/store"
import { useEnumLabel } from "@workspace/i18n/labels"
import { useEntitlements } from "@/lib/organization/use-entitlements"
import { useOrgSlug } from "@/lib/organization/use-org-slug"
import type { FileNode, SharePermission } from "@/lib/files/types"

export function FileShareDialog({
  file,
  children,
  open: controlledOpen,
  onOpenChange,
}: {
  file: FileNode
  children: React.ReactElement
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const {
    members,
    currentUserId,
    sharesFor,
    addShare,
    setPermission,
    removeShare,
    getMember,
  } = useFiles()
  const orgSlug = useOrgSlug()
  const t = useTranslations("Files")
  const L = useEnumLabel()
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false)
  const open = controlledOpen ?? uncontrolledOpen
  const setOpen = onOpenChange ?? setUncontrolledOpen
  const [pickerOpen, setPickerOpen] = React.useState(false)
  const entries = sharesFor(file.id)
  const sharingEnabled = useEntitlements().can("granularPermissions")

  function copyLink() {
    void navigator.clipboard?.writeText(
      `${window.location.origin}/${orgSlug}/files`
    )
    toast.success(t("linkCopied"))
  }

  const permissionItems = (["view", "comment", "edit"] as const).map(
    (value) => ({
      label: L.sharePermission(value),
      value,
    })
  )

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={children} />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {t("share")} “{file.name}”
          </DialogTitle>
          <DialogDescription>{t("invitePeople")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {sharingEnabled ? null : (
            <PlanUpgradePrompt feature="granularPermissions" />
          )}
          <div className="flex gap-2">
            <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
              <PopoverTrigger
                render={
                  <Button
                    variant="outline"
                    className="flex-1 justify-start font-normal"
                    disabled={!sharingEnabled}
                  />
                }
              >
                <PlusIcon data-icon="inline-start" />
                {t("addPeople")}
              </PopoverTrigger>
              <PopoverContent className="w-72 p-0" align="start">
                <Command>
                  <CommandInput placeholder={t("searchTeammates")} />
                  <CommandList>
                    <CommandEmpty>{t("noTeammates")}</CommandEmpty>
                    <CommandGroup>
                      {members
                        .filter(
                          (member) =>
                            member.id !== currentUserId &&
                            !entries.some(
                              (entry) => entry.memberId === member.id
                            )
                        )
                        .map((member) => (
                          <CommandItem
                            key={member.id}
                            value={member.name}
                            onSelect={() => {
                              addShare(file.id, member.id, "view")
                              setPickerOpen(false)
                            }}
                          >
                            <MemberAvatar member={member} size="sm" />
                            <span className="truncate">{member.name}</span>
                          </CommandItem>
                        ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            <Button variant="outline" onClick={copyLink}>
              <LinkIcon data-icon="inline-start" />
              {t("copyLink")}
            </Button>
          </div>

          <div className="flex flex-col gap-1">
            {entries.length === 0 ? (
              <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                {t("onlyYouHaveAccess")}
              </p>
            ) : (
              entries.map((entry) => {
                const member = getMember(entry.memberId)
                if (!member) return null
                return (
                  <div
                    key={entry.memberId}
                    className="flex items-center gap-3 rounded-lg px-1 py-1.5"
                  >
                    <MemberAvatar member={member} size="sm" />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-sm font-medium">
                        {member.name}
                      </span>
                      <span className="truncate text-xs text-muted-foreground">
                        {member.email}
                      </span>
                    </div>
                    <Select
                      items={permissionItems}
                      value={entry.permission}
                      disabled={!sharingEnabled}
                      onValueChange={(value) =>
                        setPermission(
                          file.id,
                          entry.memberId,
                          value as SharePermission
                        )
                      }
                    >
                      <SelectTrigger size="sm" className="w-36">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {permissionItems.map((item) => (
                            <SelectItem key={item.value} value={item.value}>
                              {item.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`${t("remove")} ${member.name}`}
                      onClick={() => removeShare(file.id, entry.memberId)}
                    >
                      <XIcon />
                    </Button>
                  </div>
                )
              })
            )}
          </div>

          {file.restricted ? (
            <Badge variant="secondary" className="w-fit">
              <LockIcon />
              {t("restrictedAccess")}
            </Badge>
          ) : null}
        </div>

        <DialogFooter>
          <Button type="button" onClick={() => setOpen(false)}>
            {t("done")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
