"use client"

import * as React from "react"
import { MailIcon } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"

import { Link, usePathname, useRouter } from "@workspace/i18n/navigation"
import { correlateUrl, readCorrelationCookie } from "@workspace/observability"
import { Button } from "@workspace/ui/components/button"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@workspace/ui/components/sidebar"

import { useRecents, type AppKey } from "./recents"

export interface NavApp {
  key?: AppKey
  title: string
  url: string
  icon: React.ReactNode
  /** Extra routes that should keep this item active (e.g. module tabs). */
  match?: string[]
  /**
   * The item lives on another host (after the domain-app split). Render a plain
   * anchor: next-intl's `Link` would prefix the local locale onto the URL.
   */
  external?: boolean
}

export function NavMain({
  items,
  orgSlug,
  quickCreate,
  messagesUrl,
  unreadTotal = 0,
}: {
  items: NavApp[]
  orgSlug: string
  /** Domain-specific create action slot. */
  quickCreate?: React.ReactNode
  /** Origin of the messages app; the quick-create button opens it (#162). */
  messagesUrl?: string
  unreadTotal?: number
}) {
  const t = useTranslations("Sidebar")
  const locale = useLocale()
  const pathname = usePathname()
  const router = useRouter()
  const { recents, setActive } = useRecents()

  /**
   * Carry the request correlation id into a cross-app navigation (issue #170).
   * Every app keeps a host-only cookie, so the id travels as `?rid=` and the
   * target app's proxy adopts it, tying both apps' log lines together.
   */
  function withCorrelation(url: string): string {
    if (typeof document === "undefined") return url
    const id = readCorrelationCookie(document.cookie)
    return id ? correlateUrl(url, id) : url
  }

  function openRecent(app: NavApp, id: string) {
    if (!app.key) return
    setActive(app.key, id)
    if (app.external) {
      window.location.href = withCorrelation(app.url)
      return
    }
    router.push(app.url)
  }

  function carryCorrelation(event: React.MouseEvent<HTMLAnchorElement>) {
    if (typeof document === "undefined") return
    const id = readCorrelationCookie(document.cookie)
    if (id)
      event.currentTarget.href = correlateUrl(event.currentTarget.href, id)
  }

  return (
    <SidebarGroup>
      <SidebarGroupLabel>{t("workspace")}</SidebarGroupLabel>
      <SidebarGroupContent className="flex flex-col gap-2">
        <SidebarMenu>
          <SidebarMenuItem className="flex items-center gap-2">
            {quickCreate}
            <Button
              size="icon"
              className="size-8 group-data-[collapsible=icon]:opacity-0"
              variant="outline"
              render={
                messagesUrl ? (
                  <a
                    href={`${messagesUrl}/${locale}/${orgSlug}/messages`}
                    onClick={carryCorrelation}
                  />
                ) : (
                  <Link href={`/${orgSlug}/messages`} prefetch={false} />
                )
              }
              nativeButton={false}
            >
              <MailIcon />
              <span className="sr-only">{t("messages")}</span>
            </Button>
          </SidebarMenuItem>
        </SidebarMenu>

        <SidebarMenu>
          {items.map((item) => {
            const entries = item.key ? recents[item.key].slice(0, 3) : []
            const active =
              pathname === item.url ||
              pathname.startsWith(`${item.url}/`) ||
              (item.match ?? []).some(
                (route) =>
                  pathname === route || pathname.startsWith(`${route}/`)
              )
            const link = item.external ? (
              <a href={item.url} onClick={carryCorrelation} />
            ) : (
              <Link href={item.url} prefetch={false} />
            )
            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  tooltip={item.title}
                  isActive={active}
                  render={link}
                >
                  {item.icon}
                  <span>{item.title}</span>
                </SidebarMenuButton>
                {item.key === "messages" && unreadTotal > 0 ? (
                  <SidebarMenuBadge>{unreadTotal}</SidebarMenuBadge>
                ) : null}
                {item.key && entries.length > 0 ? (
                  <SidebarMenuSub>
                    {entries.map((entry) => (
                      <SidebarMenuSubItem key={entry.id}>
                        <SidebarMenuSubButton
                          render={<button type="button" />}
                          onClick={() => openRecent(item, entry.id)}
                        >
                          <span className="truncate">{entry.label}</span>
                          {entry.hint ? (
                            <span className="ms-auto truncate text-xs text-sidebar-foreground/60">
                              {entry.hint}
                            </span>
                          ) : null}
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    ))}
                  </SidebarMenuSub>
                ) : null}
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
