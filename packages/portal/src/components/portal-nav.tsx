"use client"

import { useTranslations } from "next-intl"

import { cn } from "@workspace/ui/lib/utils"

import { Link, usePathname } from "@workspace/i18n/navigation"

export function PortalNav() {
  const t = useTranslations("Portal")
  const pathname = usePathname()

  const items = [
    {
      href: "/portal",
      label: t("navProjects"),
      active: pathname === "/portal" || pathname.startsWith("/portal/projects"),
    },
    {
      href: "/portal/documents",
      label: t("navDocuments"),
      active: pathname.startsWith("/portal/documents"),
    },
    {
      href: "/portal/meetings",
      label: t("navMeetings"),
      active: pathname.startsWith("/portal/meetings"),
    },
  ]

  return (
    <nav className="flex items-center gap-1">
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={cn(
            "rounded-md px-3 py-1.5 text-sm transition-colors",
            item.active
              ? "bg-muted font-medium"
              : "text-muted-foreground hover:bg-muted/60"
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  )
}
