"use client"

import * as React from "react"
import { useLocale, useTranslations } from "next-intl"
import {
  BellIcon,
  CreditCardIcon,
  FileUpIcon,
  HandshakeIcon,
  ListTodoIcon,
  MessageSquareIcon,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { cn } from "@workspace/ui/lib/utils"

import {
  fetchNotificationsAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/actions/notifications"
import { useRouter } from "@workspace/i18n/navigation"
import { unwrapActionResult } from "@workspace/core/action"
import type {
  NotificationItemData,
  NotificationsData,
} from "@/lib/notifications/types"
import { useErrorTranslator } from "@workspace/i18n/errors"

function iconFor(type: string) {
  if (type.startsWith("task.")) {
    return (
      <ListTodoIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
    )
  }
  if (type === "portal.message" || type === "portal.comment") {
    return (
      <MessageSquareIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
    )
  }
  if (type === "portal.document") {
    return (
      <FileUpIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
    )
  }
  if (type.startsWith("billing.")) {
    return (
      <CreditCardIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
    )
  }
  return (
    <HandshakeIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
  )
}

function formatInvoiceAmount(
  amount: unknown,
  currency: unknown,
  locale: string
) {
  const value = typeof amount === "number" ? amount : 0
  const code =
    typeof currency === "string" && currency.length === 3
      ? currency.toUpperCase()
      : "EUR"
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: code,
    }).format(value / 100)
  } catch {
    return `${(value / 100).toFixed(2)} ${code}`
  }
}

/** Header bell with the current user's unread notifications. */
export function NotificationBell({
  orgSlug,
  initial,
}: {
  orgSlug: string
  initial: NotificationsData
}) {
  const t = useTranslations("Notifications")
  const tT = useTranslations("Toasts")
  const te = useErrorTranslator()
  const locale = useLocale()
  const router = useRouter()

  const [data, setData] = React.useState(initial)
  const [open, setOpen] = React.useState(false)

  async function refresh() {
    try {
      const fresh = unwrapActionResult(await fetchNotificationsAction())
      setData(fresh)
    } catch {
      // Keep the server-rendered list when refreshing fails.
    }
  }

  function formatRelative(iso: string) {
    const formatter = new Intl.RelativeTimeFormat(locale, {
      numeric: "auto",
      style: "narrow",
    })
    const diff = new Date(iso).getTime() - Date.now()
    const abs = Math.abs(diff)
    if (abs < 60_000) return formatter.format(Math.round(diff / 1000), "second")
    if (abs < 3_600_000)
      return formatter.format(Math.round(diff / 60_000), "minute")
    if (abs < 86_400_000)
      return formatter.format(Math.round(diff / 3_600_000), "hour")
    if (abs < 2_592_000_000)
      return formatter.format(Math.round(diff / 86_400_000), "day")
    return formatter.format(Math.round(diff / 2_592_000_000), "month")
  }

  function messageFor(item: NotificationItemData) {
    const data = item.data
    const actor = typeof data.actorName === "string" ? data.actorName : "—"
    switch (item.type) {
      case "task.assigned":
        return t("taskAssigned", {
          actor,
          identifier: String(data.identifier ?? ""),
          title: String(data.title ?? ""),
        })
      case "deal.stage_changed":
        return t("dealStageChanged", {
          actor,
          deal: String(data.dealName ?? ""),
          stage: String(data.stageName ?? ""),
        })
      case "deal.won":
        return t("dealWon", {
          actor,
          deal: String(data.dealName ?? ""),
        })
      case "deal.lost":
        return t("dealLost", {
          actor,
          deal: String(data.dealName ?? ""),
        })
      case "portal.message":
        return t("portalMessage", {
          actor,
          project: String(data.projectName ?? ""),
        })
      case "portal.document":
        return t("portalDocument", {
          actor,
          client: String(data.clientName ?? ""),
        })
      case "portal.comment":
        return t("portalComment", {
          actor,
          identifier: String(data.identifier ?? ""),
          title: String(data.title ?? ""),
        })
      case "meeting.requested":
        return t("meetingRequested", {
          actor,
          client: String(data.clientName ?? ""),
          title: String(data.title ?? ""),
        })
      case "trial.reminder":
        return t("trialReminder", {
          organization: String(data.organizationName ?? ""),
          days: Number(data.daysLeft ?? 0),
        })
      case "trial.ended":
        return t("trialEnded", {
          organization: String(data.organizationName ?? ""),
        })
      case "billing.payment_failed":
        return t("billingPaymentFailed", {
          amount: formatInvoiceAmount(data.amountDue, data.currency, locale),
        })
      default:
        return item.type
    }
  }

  function linkFor(item: NotificationItemData): string | null {
    if (
      item.type === "task.assigned" &&
      typeof item.data.projectId === "string"
    ) {
      return `/${orgSlug}/projects/${item.data.projectId}`
    }
    if (item.type.startsWith("deal.") && typeof item.data.dealId === "string") {
      return `/${orgSlug}/deals/${item.data.dealId}`
    }
    if (
      item.type === "portal.message" &&
      typeof item.data.projectId === "string"
    ) {
      return `/${orgSlug}/projects/${item.data.projectId}`
    }
    if (
      item.type === "portal.comment" &&
      typeof item.data.projectId === "string"
    ) {
      return `/${orgSlug}/projects/${item.data.projectId}`
    }
    if (
      item.type === "portal.document" &&
      typeof item.data.clientId === "string"
    ) {
      return `/${orgSlug}/clients/${item.data.clientId}`
    }
    if (item.type === "meeting.requested") {
      return `/${orgSlug}/calendars`
    }
    if (item.type.startsWith("trial.")) {
      return `/${orgSlug}/settings`
    }
    if (item.type === "billing.payment_failed") {
      return `/${orgSlug}/settings?tab=billing`
    }
    return null
  }

  async function openItem(item: NotificationItemData) {
    if (!item.readAt) {
      try {
        const result = unwrapActionResult(
          await markNotificationReadAction({ id: item.id })
        )
        setData((prev) => ({
          unreadCount: result.unreadCount,
          items: prev.items.map((entry) =>
            entry.id === item.id
              ? { ...entry, readAt: new Date().toISOString() }
              : entry
          ),
        }))
      } catch {
        // Navigating is still useful even if marking read failed.
      }
    }
    const link = linkFor(item)
    if (link) router.push(link)
  }

  async function markAll() {
    try {
      unwrapActionResult(await markAllNotificationsReadAction())
      setData((prev) => ({
        unreadCount: 0,
        items: prev.items.map((item) => ({
          ...item,
          readAt: item.readAt ?? new Date().toISOString(),
        })),
      }))
      toast.success(tT("notificationsAllRead"))
    } catch (error) {
      toast.error(te(error, "internal"))
    }
  }

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) void refresh()
      }}
    >
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            className="relative"
            aria-label={t("open")}
          />
        }
      >
        <BellIcon className="size-4" />
        {data.unreadCount > 0 ? (
          <span className="absolute -end-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] leading-none font-medium text-primary-foreground">
            {data.unreadCount > 9 ? "9+" : data.unreadCount}
          </span>
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
          <span className="text-sm font-medium">{t("title")}</span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            disabled={data.unreadCount === 0}
            onClick={() => void markAll()}
          >
            {t("markAllRead")}
          </Button>
        </div>
        {data.items.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            {t("empty")}
          </p>
        ) : (
          <ul className="max-h-80 overflow-y-auto py-1">
            {data.items.map((item) => (
              <li key={item.id}>
                <DropdownMenuItem
                  className={cn(
                    "items-start gap-2 px-3 py-2",
                    !item.readAt && "bg-primary/5"
                  )}
                  onClick={() => void openItem(item)}
                >
                  {iconFor(item.type)}
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-sm">{messageFor(item)}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatRelative(item.createdAt)}
                    </span>
                  </span>
                  {!item.readAt ? (
                    <span className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" />
                  ) : null}
                </DropdownMenuItem>
              </li>
            ))}
          </ul>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
