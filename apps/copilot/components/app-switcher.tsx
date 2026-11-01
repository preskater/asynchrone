"use client"

import { ChevronsUpDownIcon } from "lucide-react"
import { useTranslations } from "next-intl"

import { useNavMain } from "@/components/app-sidebar"
import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"

import { Link, usePathname } from "@workspace/i18n/navigation"

export function AppSwitcher({ orgSlug }: { orgSlug: string }) {
  const t = useTranslations("Sidebar")
  const pathname = usePathname()
  const items = useNavMain(orgSlug)

  const current =
    [...items]
      .reverse()
      .find(
        (item) => pathname === item.url || pathname.startsWith(`${item.url}/`)
      ) ?? items[0]

  if (!current) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="sm" className="gap-1.5" />}
      >
        {current.icon}
        <span className="hidden text-sm font-medium sm:inline">
          {current.title}
        </span>
        <ChevronsUpDownIcon className="size-3.5 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-48">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t("workspace")}</DropdownMenuLabel>
          {items.map((item) => (
            <DropdownMenuItem
              key={item.url}
              render={<Link href={item.url} prefetch={false} />}
            >
              {item.icon}
              <span>{item.title}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
