"use client"

import {
  BellIcon,
  CircleUserRoundIcon,
  CreditCardIcon,
  EllipsisVerticalIcon,
  LogOutIcon,
} from "lucide-react"
import { useTranslations } from "next-intl"

import { authClient } from "@/lib/auth-client"
import { Link, useRouter } from "@workspace/i18n/navigation"
import { Button } from "@workspace/ui/components/button"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/avatar"
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
  useSidebar,
} from "@workspace/ui/components/sidebar"

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) {
    return "?"
  }
  const first = parts[0]?.[0] ?? ""
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : ""
  return `${first}${last}`.toUpperCase()
}

export function NavUser({
  user,
  orgSlug,
  compact = false,
}: {
  user: {
    name: string
    email: string
    image?: string | null
  }
  /** Active workspace; billing lives in its settings. */
  orgSlug: string
  compact?: boolean
}) {
  const { isMobile } = useSidebar()
  const t = useTranslations("UserMenu")
  const router = useRouter()
  const initials = getInitials(user.name)

  async function handleSignOut() {
    await authClient.signOut()
    router.push("/sign-in")
    router.refresh()
  }

  const dropdown = (
    <DropdownMenu>
      {compact ? (
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              className="rounded-full"
              // The visible label is the avatar initials, so the accessible
              // name has to contain them (WCAG 2.5.3, checked by axe).
              aria-label={`${initials} ${user.name}`}
            />
          }
        >
          <Avatar className="size-7 rounded-full grayscale">
            <AvatarImage src={user.image ?? undefined} alt={user.name} />
            <AvatarFallback className="rounded-full text-xs">
              {initials}
            </AvatarFallback>
          </Avatar>
        </DropdownMenuTrigger>
      ) : (
        <DropdownMenuTrigger
          render={
            <SidebarMenuButton size="lg" className="aria-expanded:bg-muted" />
          }
        >
          <Avatar className="size-8 rounded-lg grayscale">
            <AvatarImage src={user.image ?? undefined} alt={user.name} />
            <AvatarFallback className="rounded-lg">{initials}</AvatarFallback>
          </Avatar>
          <div className="grid flex-1 text-start text-sm leading-tight">
            <span className="truncate font-medium">{user.name}</span>
            <span className="truncate text-xs text-foreground/70">
              {user.email}
            </span>
          </div>
          <EllipsisVerticalIcon className="ms-auto size-4" />
        </DropdownMenuTrigger>
      )}
      <DropdownMenuContent
        className="min-w-56"
        side={isMobile ? "bottom" : "right"}
        align="end"
        sideOffset={4}
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel className="p-0 font-normal">
            <div className="flex items-center gap-2 px-1 py-1.5 text-start text-sm">
              <Avatar className="size-8">
                <AvatarImage src={user.image ?? undefined} alt={user.name} />
                <AvatarFallback className="rounded-lg">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-start text-sm leading-tight">
                <span className="truncate font-medium">{user.name}</span>
                <span className="truncate text-xs text-muted-foreground">
                  {user.email}
                </span>
              </div>
            </div>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem render={<Link href="/settings/account" />}>
            <CircleUserRoundIcon />
            {t("account")}
          </DropdownMenuItem>
          <DropdownMenuItem
            render={
              <Link
                href={{
                  pathname: `/${orgSlug}/settings`,
                  query: { tab: "billing" },
                }}
              />
            }
          >
            <CreditCardIcon />
            {t("billing")}
          </DropdownMenuItem>
          <DropdownMenuItem>
            <BellIcon />
            {t("notifications")}
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSignOut}>
          <LogOutIcon />
          {t("logOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )

  if (compact) return dropdown

  return (
    <SidebarMenu>
      <SidebarMenuItem>{dropdown}</SidebarMenuItem>
    </SidebarMenu>
  )
}
