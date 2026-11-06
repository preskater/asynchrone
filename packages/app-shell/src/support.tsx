"use client"

import * as React from "react"
import { useParams } from "next/navigation"
import {
  ActivityIcon,
  BookOpenIcon,
  CircleHelpIcon,
  LifeBuoyIcon,
} from "lucide-react"
import { useTranslations } from "next-intl"

import { correlateUrl, readCorrelationCookie } from "@workspace/observability"
import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"

/**
 * In-app support entry points (#101), shared by every workspace app.
 *
 * Help, tickets and the status redirect all live on Copilot, so a domain app
 * only needs Copilot's origin (`""` on Copilot itself). The links carry the
 * page the user was on, the correlation id and the last client errors, which
 * is the diagnostic context the ticket form attaches.
 */

const MAX_ERRORS = 5
const recentErrors: string[] = []

function rememberError(message: string) {
  const trimmed = message.trim().slice(0, 300)
  if (!trimmed) return
  recentErrors.push(trimmed)
  if (recentErrors.length > MAX_ERRORS) recentErrors.shift()
}

const SupportContext = React.createContext<string | null>(null)

/** Provides Copilot's origin and records client errors for the ticket form. */
export function SupportProvider({
  copilotUrl,
  children,
}: {
  copilotUrl: string
  children: React.ReactNode
}) {
  React.useEffect(() => {
    const onError = (event: ErrorEvent) => rememberError(event.message)
    const onRejection = (event: PromiseRejectionEvent) =>
      rememberError(
        event.reason instanceof Error
          ? event.reason.message
          : String(event.reason)
      )
    window.addEventListener("error", onError)
    window.addEventListener("unhandledrejection", onRejection)
    return () => {
      window.removeEventListener("error", onError)
      window.removeEventListener("unhandledrejection", onRejection)
    }
  }, [])

  return (
    <SupportContext.Provider value={copilotUrl}>
      {children}
    </SupportContext.Provider>
  )
}

function useSupportLinks() {
  const copilotUrl = React.useContext(SupportContext) ?? ""
  const params = useParams<{ locale?: string; orgSlug?: string }>()
  const base = `${copilotUrl}/${params.locale ?? "en"}${
    params.orgSlug ? `/${params.orgSlug}` : ""
  }`

  return {
    help: `${base}/help`,
    status: `${copilotUrl}/api/status`,
    /** Built on click so it captures the current page and errors. */
    contact() {
      const url = new URL(`${base}/feedback`, window.location.href)
      url.searchParams.set("from", window.location.href.slice(0, 500))
      for (const message of recentErrors) {
        url.searchParams.append("error", message)
      }
      const rid = readCorrelationCookie(document.cookie)
      return rid ? correlateUrl(url, rid) : url.toString()
    },
  }
}

/** Header dropdown: help center, contact support, status. */
export function HelpMenu() {
  const t = useTranslations("Support")
  const links = useSupportLinks()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon-sm" aria-label={t("menuLabel")} />
        }
      >
        <CircleHelpIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={4} className="min-w-52">
        <DropdownMenuGroup>
          <DropdownMenuItem render={<a href={links.help} />}>
            <BookOpenIcon />
            {t("helpCenter")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => window.location.assign(links.contact())}
          >
            <LifeBuoyIcon />
            {t("contactSupport")}
          </DropdownMenuItem>
          <DropdownMenuItem
            render={<a href={links.status} target="_blank" rel="noreferrer" />}
          >
            <ActivityIcon />
            {t("status")}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Thin footer under every workspace page: help, status, support. */
export function SupportFooter() {
  const t = useTranslations("Support")
  const links = useSupportLinks()

  return (
    <footer className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 border-t px-4 py-2 text-xs text-muted-foreground lg:px-6">
      <a href={links.help} className="hover:text-foreground hover:underline">
        {t("helpCenter")}
      </a>
      <a
        href={links.status}
        target="_blank"
        rel="noreferrer"
        className="hover:text-foreground hover:underline"
      >
        {t("status")}
      </a>
      <a
        href={links.help}
        onClick={(event) => {
          event.preventDefault()
          window.location.assign(links.contact())
        }}
        className="hover:text-foreground hover:underline"
      >
        {t("contactSupport")}
      </a>
    </footer>
  )
}
