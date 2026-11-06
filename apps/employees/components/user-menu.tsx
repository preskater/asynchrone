"use client"

import { LogOutIcon, UserIcon } from "lucide-react"
import { useTranslations } from "next-intl"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/avatar"
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

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return "?"
  const first = parts[0]?.[0] ?? ""
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : ""
  return `${first}${last}`.toUpperCase()
}

/**
 * Account menu. Copilot owns the account screens, so they open there; sign-out
 * clears this app's session and Copilot's.
 */
export function UserMenu({
  user,
  accountUrl,
}: {
  user: { name: string; email: string; image?: string | null }
  accountUrl: string
}) {
  const t = useTranslations("UserMenu")

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            className="rounded-full"
            // The visible label is the avatar initials, so the accessible
            // name has to contain them (WCAG 2.5.3, checked by axe).
            aria-label={`${getInitials(user.name)} ${user.name}`}
          />
        }
      >
        <Avatar className="size-7">
          {user.image ? <AvatarImage src={user.image} alt="" /> : null}
          <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={4} className="min-w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col">
            <span className="text-sm font-medium">{user.name}</span>
            <span className="text-xs text-muted-foreground">{user.email}</span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem render={<a href={accountUrl} />}>
            <UserIcon />
            {t("account")}
          </DropdownMenuItem>
          <DropdownMenuItem render={<a href="/api/auth/logout" />}>
            <LogOutIcon />
            {t("logOut")}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
