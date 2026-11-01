"use client"

import * as React from "react"
import { useRouter } from "@workspace/i18n/navigation"
import { useTranslations } from "next-intl"
import {
  Building2Icon,
  CheckIcon,
  ChevronsUpDownIcon,
  PlusIcon,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@workspace/ui/components/sidebar"

import { authClient } from "@/lib/auth-client"
import { getInitials } from "@workspace/organization/utils"

export function OrgSwitcher({
  activeOrganizationId,
  compact = false,
}: {
  activeOrganizationId: string | null
  compact?: boolean
}) {
  const router = useRouter()
  const t = useTranslations("Org")
  const { data: organizations, isPending } = authClient.useListOrganizations()
  const [switching, setSwitching] = React.useState(false)

  const active = organizations?.find(
    (organization) => organization.id === activeOrganizationId
  )

  async function switchOrganization(organization: {
    id: string
    slug: string
  }) {
    if (organization.id === activeOrganizationId) return
    setSwitching(true)
    const { error } = await authClient.organization.setActive({
      organizationId: organization.id,
    })
    if (error) {
      toast.error(error.message ?? t("unableToSwitchOrganization"))
      setSwitching(false)
      return
    }
    router.push(`/${organization.slug}`)
    router.refresh()
    setSwitching(false)
  }

  const menu = (
    <DropdownMenu>
      {compact ? (
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="sm" className="gap-2" />}
        >
          <div className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Building2Icon className="size-3.5" />
          </div>
          <span className="hidden max-w-32 truncate text-sm font-medium md:inline">
            {isPending
              ? t("loading")
              : (active?.name ?? t("selectOrganization"))}
          </span>
          <ChevronsUpDownIcon className="size-3.5 opacity-60" />
        </DropdownMenuTrigger>
      ) : (
        <DropdownMenuTrigger
          render={
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            />
          }
        >
          <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <Building2Icon className="size-4" />
          </div>
          <div className="grid flex-1 text-start text-sm leading-tight">
            <span className="truncate font-medium">
              {isPending
                ? t("loading")
                : (active?.name ?? t("selectOrganization"))}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {active?.slug ?? t("workspace")}
            </span>
          </div>
          <ChevronsUpDownIcon className="ms-auto size-4" />
        </DropdownMenuTrigger>
      )}
      <DropdownMenuContent
        className="min-w-56"
        align={compact ? "end" : "start"}
        side="bottom"
        sideOffset={4}
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-xs text-muted-foreground">
            {t("organizations")}
          </DropdownMenuLabel>
          {(organizations ?? []).map((organization) => (
            <DropdownMenuItem
              key={organization.id}
              disabled={switching}
              onClick={() => switchOrganization(organization)}
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
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            router.push("/onboarding?create=1")
            router.refresh()
          }}
        >
          <PlusIcon />
          {t("createOrganization")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )

  if (compact) return menu

  return (
    <SidebarMenu>
      <SidebarMenuItem>{menu}</SidebarMenuItem>
    </SidebarMenu>
  )
}
