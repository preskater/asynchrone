"use client"

import { useTranslations } from "next-intl"
import { ChevronDownIcon } from "lucide-react"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"

import { useEnumLabel } from "@workspace/i18n/labels"
import {
  compareRoles,
  getRoleMeta,
  type OrgRole,
} from "@workspace/organization/roles"

/**
 * One badge per held role; the first is the primary role. Tooltips describe
 * each role, except inside another control (the picker lists descriptions).
 */
export function RoleBadges({
  roles,
  tooltips = true,
}: {
  roles: OrgRole[]
  tooltips?: boolean
}) {
  const t = useTranslations("Org")
  const L = useEnumLabel()
  return (
    <div className="flex flex-wrap gap-1">
      {roles.map((role, index) => {
        const primary = index === 0 && roles.length > 1
        const badge = (
          <Badge
            key={role}
            variant={getRoleMeta(role).badge}
            title={primary ? t("primaryRole") : undefined}
          >
            {L.orgRole(role)}
            {primary ? <span aria-hidden="true">★</span> : null}
            {primary ? (
              <span className="sr-only">({t("primaryRole")})</span>
            ) : null}
          </Badge>
        )
        if (!tooltips) return badge
        return (
          <Tooltip key={role}>
            <TooltipTrigger render={<span tabIndex={0} />}>
              {badge}
            </TooltipTrigger>
            <TooltipContent>{L.orgRoleDescription(role)}</TooltipContent>
          </Tooltip>
        )
      })}
    </div>
  )
}

/**
 * Cumulative role picker. Without the `granularPermissions` entitlement a
 * choice replaces the set, so a free workspace keeps exactly one role.
 */
export function RolePicker({
  id,
  value,
  options,
  multiple,
  disabled,
  onChange,
}: {
  id?: string
  value: OrgRole[]
  options: OrgRole[]
  multiple: boolean
  disabled?: boolean
  onChange: (roles: OrgRole[]) => void
}) {
  const L = useEnumLabel()

  function toggle(role: OrgRole, checked: boolean) {
    if (!multiple) {
      if (checked) onChange([role])
      return
    }
    const next = checked
      ? [...value, role]
      : value.filter((entry) => entry !== role)
    // A member always keeps at least one role.
    if (next.length > 0) onChange([...new Set(next)].sort(compareRoles))
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={disabled}
        render={
          <Button
            id={id}
            type="button"
            variant="outline"
            size="sm"
            className="h-auto min-h-8 justify-between gap-2 py-1"
          />
        }
      >
        <RoleBadges roles={value} tooltips={false} />
        <ChevronDownIcon className="size-4 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuGroup>
          {options.map((role) => (
            <DropdownMenuCheckboxItem
              key={role}
              checked={value.includes(role)}
              closeOnClick={!multiple}
              onCheckedChange={(checked) => toggle(role, checked)}
            >
              <div className="flex flex-col">
                <span>{L.orgRole(role)}</span>
                <span className="text-xs text-muted-foreground">
                  {L.orgRoleDescription(role)}
                </span>
              </div>
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
