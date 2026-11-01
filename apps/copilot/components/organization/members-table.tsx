"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { MoreHorizontalIcon, UserMinusIcon } from "lucide-react"
import { toast } from "sonner"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/avatar"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuGroup,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import { authClient } from "@/lib/auth-client"
import { useEnumLabel } from "@workspace/i18n/labels"
import { ORG_ROLES, roleRank, type OrgRole } from "@workspace/organization/roles"
import { getInitials, parseRoles } from "@workspace/organization/utils"

export interface OrgMember {
  id: string
  userId: string
  role: string
  user: { id: string; name: string; email: string; image?: string | null }
}

export function MembersTable({
  members,
  currentUserId,
  canUpdate,
  canRemove,
  canTransferOwnership,
  onChanged,
}: {
  members: OrgMember[]
  currentUserId: string
  canUpdate: boolean
  canRemove: boolean
  canTransferOwnership: boolean
  onChanged: () => void
}) {
  const [pendingId, setPendingId] = React.useState<string | null>(null)
  const t = useTranslations("Org")
  const L = useEnumLabel()

  const sortedMembers = React.useMemo(
    () =>
      [...members].sort(
        (a, b) =>
          roleRank(b.role) - roleRank(a.role) ||
          a.user.name.localeCompare(b.user.name)
      ),
    [members]
  )

  async function updateRole(memberId: string, role: OrgRole) {
    setPendingId(memberId)
    const { error } = await authClient.organization.updateMemberRole({
      memberId,
      role,
    })
    setPendingId(null)
    if (error) {
      toast.error(error.message ?? t("unableToUpdateRole"))
      return
    }
    toast.success(t("roleUpdated"))
    onChanged()
  }

  async function removeMember(member: OrgMember) {
    setPendingId(member.id)
    const { error } = await authClient.organization.removeMember({
      memberIdOrEmail: member.id,
    })
    setPendingId(null)
    if (error) {
      toast.error(error.message ?? t("unableToRemoveMember"))
      return
    }
    toast.success(t("memberRemoved", { name: member.user.name }))
    onChanged()
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("member")}</TableHead>
          <TableHead className="hidden sm:table-cell">{t("email")}</TableHead>
          <TableHead>{t("role")}</TableHead>
          <TableHead className="w-10" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {sortedMembers.map((member) => {
          const memberRoles = parseRoles(member.role)
          const isOwner = memberRoles.includes("owner")
          const isSelf = member.userId === currentUserId
          const canEditThisRole =
            (canUpdate && !isOwner) || (canTransferOwnership && isSelf)
          const canRemoveThis = canRemove && !isOwner && !isSelf

          return (
            <TableRow key={member.id}>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Avatar size="sm">
                    <AvatarImage
                      src={member.user.image ?? undefined}
                      alt={member.user.name}
                    />
                    <AvatarFallback>
                      {getInitials(member.user.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col">
                    <span className="font-medium">{member.user.name}</span>
                    {isSelf ? (
                      <span className="text-xs text-muted-foreground">
                        {t("you")}
                      </span>
                    ) : null}
                  </div>
                </div>
              </TableCell>
              <TableCell className="hidden text-muted-foreground sm:table-cell">
                {member.user.email}
              </TableCell>
              <TableCell>
                {canEditThisRole ? (
                  <Select
                    items={ORG_ROLES.filter(
                      (item) => item.value !== "owner" || canTransferOwnership
                    ).map((item) => ({
                      value: item.value,
                      label: L.orgRole(item.value),
                    }))}
                    value={
                      memberRoles[0] && memberRoles[0] !== "owner"
                        ? memberRoles[0]
                        : "owner"
                    }
                    disabled={pendingId === member.id}
                    onValueChange={(value) =>
                      updateRole(member.id, value as OrgRole)
                    }
                  >
                    <SelectTrigger size="sm" className="w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {ORG_ROLES.filter(
                          (item) =>
                            item.value !== "owner" || canTransferOwnership
                        ).map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {L.orgRole(item.value)}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                ) : (
                  <Badge variant={isOwner ? "default" : "secondary"}>
                    {memberRoles[0]
                      ? L.orgRole(memberRoles[0])
                      : t("member")}
                  </Badge>
                )}
              </TableCell>
              <TableCell>
                {canRemoveThis ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t("manageMember", {
                            name: member.user.name,
                          })}
                        />
                      }
                    >
                      <MoreHorizontalIcon />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuGroup>
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => removeMember(member)}
                        >
                          <UserMinusIcon />
                          {t("removeFromOrganization")}
                        </DropdownMenuItem>
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
