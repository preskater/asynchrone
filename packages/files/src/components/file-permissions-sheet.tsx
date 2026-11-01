"use client"

import * as React from "react"
import { LockIcon } from "lucide-react"
import { useTranslations } from "next-intl"

import { PlanUpgradePrompt } from "./plan-upgrade-prompt"
import { MemberAvatar } from "./member-avatar"
import { Badge } from "@workspace/ui/components/badge"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Separator } from "@workspace/ui/components/separator"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@workspace/ui/components/sheet"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import { useFiles } from "../store"
import { useEnumLabel } from "@workspace/i18n/labels"
import { useEntitlements } from "@workspace/organization/use-entitlements"
import type { FileNode, SharePermission } from "../types"

export function FilePermissionsSheet({
  file,
  open,
  onOpenChange,
}: {
  file?: FileNode
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { getMember, sharesFor, setPermission, removeShare, setRestricted } =
    useFiles()
  const t = useTranslations("Files")
  const L = useEnumLabel()
  const [linkAccess, setLinkAccess] = React.useState("view")
  const sharingEnabled = useEntitlements().can("granularPermissions")

  if (!file) return null
  const entries = sharesFor(file.id)
  const inherited = !file.restricted

  const permissionItems = (["view", "comment", "edit"] as const).map(
    (value) => ({
      label: L.sharePermission(value),
      value,
    })
  )

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>{t("managePermissions")}</SheetTitle>
          <SheetDescription className="line-clamp-1">
            {file.name}
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
          {sharingEnabled ? null : (
            <PlanUpgradePrompt feature="granularPermissions" />
          )}
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium">{t("people")}</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("member")}</TableHead>
                  <TableHead>{t("access")}</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => {
                  const member = getMember(entry.memberId)
                  if (!member) return null
                  return (
                    <TableRow key={entry.memberId}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <MemberAvatar member={member} size="sm" />
                          <span className="text-sm">{member.name}</span>
                        </div>
                      </TableCell>
                      <TableCell>
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
                          <SelectTrigger size="sm" className="w-32">
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
                      </TableCell>
                      <TableCell>
                        <button
                          type="button"
                          className="text-xs text-muted-foreground hover:text-foreground"
                          onClick={() => removeShare(file.id, entry.memberId)}
                        >
                          {t("remove")}
                        </button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>

          <Separator />

          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-medium">{t("organizationAccess")}</h3>
            <label className="flex items-start gap-2">
              <Checkbox
                checked={inherited}
                // Restricting needs the plan; lifting a restriction never does.
                disabled={inherited && !sharingEnabled}
                onCheckedChange={(checked) =>
                  setRestricted(file.id, checked !== true)
                }
              />
              <span className="text-sm">
                {t("inheritPermissions")}
                <span className="block text-xs text-muted-foreground">
                  {t("inheritPermissionsDescription")}
                </span>
              </span>
            </label>
          </div>

          <Separator />

          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-medium">{t("linkAccess")}</h3>
              {file.restricted ? (
                <Badge variant="secondary">
                  <LockIcon />
                  {t("restricted")}
                </Badge>
              ) : null}
            </div>
            <Select
              items={permissionItems}
              value={linkAccess}
              onValueChange={(value) => setLinkAccess(value as string)}
            >
              <SelectTrigger className="w-full">
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
            <p className="text-xs text-muted-foreground">
              {t("orgLinkAccessDescription")}
            </p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
