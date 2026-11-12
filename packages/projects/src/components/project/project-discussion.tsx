"use client"

import * as React from "react"
import { useLocale, useTranslations } from "next-intl"
import { SendIcon } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Spinner } from "@workspace/ui/components/spinner"
import { Textarea } from "@workspace/ui/components/textarea"

import { unwrapActionResult } from "@workspace/core/action"
import type { ProjectMessageData } from "../../thread"
import { useErrorTranslator } from "@workspace/i18n/errors"

import { useProjectActions } from "../../ui/actions"

function initialsOf(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const first = parts[0]?.[0] ?? "?"
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : ""
  return `${first}${last}`.toUpperCase()
}

/** Shared project thread between the team and the client (internal view). */
export function ProjectDiscussion({ projectId }: { projectId: string }) {
  const t = useTranslations("Projects")
  const tT = useTranslations("Toasts")
  const te = useErrorTranslator()
  const locale = useLocale()
  const actions = useProjectActions()

  const [messages, setMessages] = React.useState<ProjectMessageData[] | null>(
    null
  )
  const [body, setBody] = React.useState("")
  const [sending, setSending] = React.useState(false)

  React.useEffect(() => {
    let active = true
    async function load() {
      try {
        const list = unwrapActionResult(await actions.listMessages(projectId))
        if (active) setMessages(list)
      } catch (error) {
        if (active) {
          setMessages([])
          toast.error(te(error, "internal"))
        }
      }
    }
    void load()
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId])

  const relative = new Intl.RelativeTimeFormat(locale, {
    numeric: "auto",
    style: "narrow",
  })
  function formatRelative(iso: string) {
    const diff = new Date(iso).getTime() - Date.now()
    const abs = Math.abs(diff)
    if (abs < 60_000) return relative.format(Math.round(diff / 1000), "second")
    if (abs < 3_600_000)
      return relative.format(Math.round(diff / 60_000), "minute")
    if (abs < 86_400_000)
      return relative.format(Math.round(diff / 3_600_000), "hour")
    if (abs < 2_592_000_000)
      return relative.format(Math.round(diff / 86_400_000), "day")
    return relative.format(Math.round(diff / 2_592_000_000), "month")
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const text = body.trim()
    if (!text || sending) return
    setSending(true)
    try {
      const message = unwrapActionResult(
        await actions.postMessage({ projectId, body: text })
      )
      setMessages((prev) => [...(prev ?? []), message])
      setBody("")
      toast.success(tT("portalMessageSent"))
    } catch (error) {
      toast.error(te(error, "internal"))
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      {messages === null ? (
        <div className="flex justify-center py-6">
          <Spinner className="size-4" />
        </div>
      ) : messages.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("discussionEmpty")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {messages.map((message) => {
            const fromClient = message.authorKind === "client"
            return (
              <li key={message.id} className="flex items-start gap-2.5">
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground">
                  {initialsOf(message.authorName)}
                </span>
                <div className="flex min-w-0 flex-1 flex-col rounded-lg border bg-card p-3">
                  <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {message.authorName}
                    </span>
                    {fromClient ? (
                      <Badge className="text-[10px]">{t("clientBadge")}</Badge>
                    ) : message.authorKind === "guest" ? (
                      <Badge variant="outline" className="text-[10px]">
                        {t("guestBadge")}
                      </Badge>
                    ) : null}
                    <span>{formatRelative(message.createdAt)}</span>
                  </span>
                  <p className="mt-1 text-sm whitespace-pre-wrap">
                    {message.body}
                  </p>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <form className="flex flex-col gap-2" onSubmit={handleSubmit}>
        <Textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder={t("discussionPlaceholder")}
          maxLength={4000}
          rows={3}
        />
        <div className="flex justify-end">
          <Button type="submit" disabled={sending || !body.trim()}>
            {sending ? (
              <Spinner className="size-4" />
            ) : (
              <SendIcon data-icon="inline-start" />
            )}
            {t("sendMessage")}
          </Button>
        </div>
      </form>
    </div>
  )
}
