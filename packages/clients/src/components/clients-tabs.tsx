"use client"

import { Building2Icon, HandshakeIcon, UsersIcon } from "lucide-react"
import { useTranslations } from "next-intl"

import { Link, usePathname } from "@workspace/i18n/navigation"
import { cn } from "@workspace/ui/lib/utils"

/** Module navigation shared by every client page (Clients / Contacts / Deals). */
export function ClientsTabs({ orgSlug }: { orgSlug: string }) {
  const t = useTranslations("Clients")
  const pathname = usePathname()

  const items = [
    {
      href: `/${orgSlug}/clients`,
      label: t("tabs.clients"),
      icon: <Building2Icon className="size-4" />,
    },
    {
      href: `/${orgSlug}/contacts`,
      label: t("tabs.contacts"),
      icon: <UsersIcon className="size-4" />,
    },
    {
      href: `/${orgSlug}/deals`,
      label: t("tabs.deals"),
      icon: <HandshakeIcon className="size-4" />,
    },
  ]

  return (
    <nav
      aria-label={t("tabs.navigation")}
      className="flex items-center gap-1 border-b"
    >
      {items.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`)
        return (
          <Link
            key={item.href}
            href={item.href}
            prefetch={false}
            className={cn(
              "-mb-px flex items-center gap-2 border-b-2 border-transparent px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
              active && "border-primary text-foreground"
            )}
          >
            {item.icon}
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
