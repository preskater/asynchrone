"use client"

import { CheckIcon, ChevronsUpDownIcon } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"

import { getInitials } from "@workspace/organization/utils"
import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"

export interface OrganizationChoice {
  id: string
  name: string
  slug: string
}

/**
 * Organization switch on the files host.
 *
 * The access token is bound to one organization, so choosing another one is a
 * handoff: `/api/auth/switch` sends the browser to Copilot, which updates the
 * session's active organization and returns into this app's sign-in flow.
 */
export function OrgSwitcher({
  organizations,
  activeOrganizationId,
  returnTo,
}: {
  organizations: OrganizationChoice[]
  activeOrganizationId: string
  /** Where to land after the new authorization (a same-site path). */
  returnTo: string
}) {
  const t = useTranslations("Org")
  const locale = useLocale()
  const active = organizations.find(
    (organization) => organization.id === activeOrganizationId
  )

  function switchTo(organizationId: string) {
    const url = new URL("/api/auth/switch", window.location.origin)
    url.searchParams.set("organizationId", organizationId)
    url.searchParams.set("locale", locale)
    url.searchParams.set("returnTo", returnTo)
    window.location.href = url.toString()
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="sm" className="gap-2" />}
      >
        <span className="flex size-6 items-center justify-center rounded-md bg-primary text-[10px] font-semibold text-primary-foreground">
          {active ? getInitials(active.name) : "?"}
        </span>
        <span className="hidden max-w-32 truncate text-sm font-medium md:inline">
          {active?.name ?? t("selectOrganization")}
        </span>
        <ChevronsUpDownIcon className="size-3.5 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-56" align="end" sideOffset={4}>
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-xs text-muted-foreground">
            {t("organizations")}
          </DropdownMenuLabel>
          {organizations.map((organization) => (
            <DropdownMenuItem
              key={organization.id}
              onClick={() => switchTo(organization.id)}
            >
              <div className="flex size-6 items-center justify-center rounded-sm border">
                <span className="text-xs">
                  {getInitials(organization.name)}
                </span>
              </div>
              <span className="flex-1 truncate">{organization.name}</span>
              {organization.id === activeOrganizationId ? (
                <CheckIcon className="size-4" />
              ) : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
