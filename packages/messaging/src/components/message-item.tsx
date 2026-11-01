"use client"

import * as React from "react"

import { ReactionBar } from "./reaction-bar"
import { PresenceDot } from "./presence-dot"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/avatar"
import { Button } from "@workspace/ui/components/button"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuGroup,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@workspace/ui/components/context-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@workspace/ui/components/alert-dialog"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
import { Textarea } from "@workspace/ui/components/textarea"
import { cn } from "@workspace/ui/lib/utils"
import {
  CalendarClockIcon,
  CopyIcon,
  FileIcon,
  ImageIcon,
  MessageSquareIcon,
  PencilIcon,
  SmilePlusIcon,
  Trash2Icon,
} from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { toast } from "sonner"

import { formatTime, initials } from "../format"
import { useMessaging } from "../store"
import type { Message } from "../types"

const QUICK_REACTIONS = ["👍", "❤️", "😂", "🎉", "👀", "🙏"]

export function MessageItem({
  message,
  onReply,
  compact,
}: {
  message: Message
  onReply: (messageId: string) => void
  compact?: boolean
}) {
  const t = useTranslations("Messaging")
  const locale = useLocale()
  const { getMember, presence, currentUserId, deleteMessage, toggleReaction } =
    useMessaging()
  const author = getMember(message.authorId)
  const isOwn = message.authorId === currentUserId
  const replyCount = useMessaging().repliesFor(message.id).length
  const [editOpen, setEditOpen] = React.useState(false)

  if (message.meeting) {
    return (
      <div className="px-4 py-3">
        <MeetingCard message={message} compact={compact} />
      </div>
    )
  }

  return (
    <ContextMenu>
      <ContextMenuTrigger
        render={
          <div
            className={cn(
              "group flex gap-3 px-4 hover:bg-muted/40",
              isOwn && "flex-row-reverse",
              compact ? "py-1" : "py-2"
            )}
          />
        }
      >
        <div className="relative mt-0.5 size-8 shrink-0">
          <Avatar size="sm" className="size-8">
            {author?.avatarUrl ? (
              <AvatarImage src={author.avatarUrl} alt={author.name} />
            ) : null}
            <AvatarFallback>
              {author ? initials(author.name) : "?"}
            </AvatarFallback>
          </Avatar>
          {!isOwn ? (
            <PresenceDot
              presence={
                message.authorId ? presence[message.authorId] : undefined
              }
            />
          ) : null}
        </div>

        <div
          className={cn("min-w-0 flex-1", isOwn && "flex flex-col items-end")}
        >
          <div
            className={cn(
              "flex items-baseline gap-2",
              isOwn && "flex-row-reverse"
            )}
          >
            <span className="text-sm font-medium">
              {isOwn ? t("you") : (author?.name ?? t("unknown"))}
            </span>
            <span className="text-xs text-muted-foreground">
              {formatTime(message.createdAt, locale)}
            </span>
            {message.edited ? (
              <span className="text-xs text-muted-foreground">
                {t("edited")}
              </span>
            ) : null}
          </div>

          {message.body ? (
            <p
              className={cn("text-sm whitespace-pre-wrap", isOwn && "text-end")}
            >
              {message.body}
            </p>
          ) : null}

          {message.attachments.length > 0 ? (
            <div
              className={cn(
                "mt-2 flex flex-wrap gap-2",
                isOwn && "justify-end"
              )}
            >
              {message.attachments.map((attachment) => (
                <div
                  key={attachment.id}
                  className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2"
                >
                  {attachment.kind === "image" ? (
                    <ImageIcon className="size-4 text-muted-foreground" />
                  ) : (
                    <FileIcon className="size-4 text-muted-foreground" />
                  )}
                  <div className="flex flex-col">
                    {attachment.hasStorage ? (
                      <a
                        href={`/api/messages/attachments/${attachment.id}`}
                        className="text-sm font-medium hover:underline"
                      >
                        {attachment.name}
                      </a>
                    ) : (
                      <span className="text-sm font-medium">
                        {attachment.name}
                      </span>
                    )}
                    {attachment.meta ? (
                      <span className="text-xs text-muted-foreground">
                        {attachment.meta}
                      </span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          <ReactionBar
            messageId={message.id}
            reactions={message.reactions}
            className={cn("mt-1.5", isOwn && "justify-end")}
          />

          {replyCount > 0 ? (
            <button
              type="button"
              onClick={() => onReply(message.id)}
              className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
            >
              <MessageSquareIcon className="size-3.5" />
              {t("replyCount", { count: replyCount })}
            </button>
          ) : null}

          <div
            className={cn(
              "mt-1 hidden items-center gap-1 group-hover:flex",
              isOwn && "justify-end"
            )}
          >
            {QUICK_REACTIONS.slice(0, 3).map((emoji) => (
              <Button
                key={emoji}
                variant="ghost"
                size="icon-xs"
                aria-label={t("reactWith", { emoji })}
                onClick={() => toggleReaction(message.id, emoji)}
              >
                <span className="text-sm">{emoji}</span>
              </Button>
            ))}
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={t("replyInThread")}
              onClick={() => onReply(message.id)}
            >
              <MessageSquareIcon />
            </Button>
            <EditMessageDialog
              message={message}
              open={editOpen}
              onOpenChange={setEditOpen}
              trigger={
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={t("editMessage")}
                >
                  <PencilIcon />
                </Button>
              }
            />
          </div>
        </div>
      </ContextMenuTrigger>

      <ContextMenuContent>
        <ContextMenuGroup>
          <ContextMenuItem onSelect={() => onReply(message.id)}>
            <MessageSquareIcon />
            {t("replyInThread")}
          </ContextMenuItem>
          {QUICK_REACTIONS.slice(0, 3).map((emoji) => (
            <ContextMenuItem
              key={emoji}
              onSelect={() => toggleReaction(message.id, emoji)}
            >
              <SmilePlusIcon />
              {t("reactWith", { emoji })}
            </ContextMenuItem>
          ))}
          <ContextMenuItem
            onSelect={() => {
              void navigator.clipboard?.writeText(message.body)
              toast.success(t("messageCopied"))
            }}
          >
            <CopyIcon />
            {t("copyText")}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <EditMessageDialog
            message={message}
            trigger={
              <ContextMenuItem onSelect={(event) => event.preventDefault()}>
                <PencilIcon />
                {t("editMessage")}
              </ContextMenuItem>
            }
          />
          <AlertDialog>
            <AlertDialogTrigger
              render={
                <ContextMenuItem variant="destructive">
                  <Trash2Icon />
                  {t("deleteMessage")}
                </ContextMenuItem>
              }
            />
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {t("deleteMessageQuestion")}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {t("deleteMessageDescription")}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  onClick={() => deleteMessage(message.id)}
                >
                  {t("delete")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </ContextMenuGroup>
      </ContextMenuContent>
    </ContextMenu>
  )
}

function EditMessageDialog({
  message,
  trigger,
  open: controlledOpen,
  onOpenChange,
}: {
  message: Message
  trigger: React.ReactElement
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const t = useTranslations("Messaging")
  const { editMessage } = useMessaging()
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false)
  const open = controlledOpen ?? uncontrolledOpen
  const setOpen = onOpenChange ?? setUncontrolledOpen
  const [body, setBody] = React.useState(message.body)

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) setBody(message.body)
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("editMessage")}</DialogTitle>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (!body.trim()) return
            editMessage(message.id, body.trim())
            setOpen(false)
          }}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor={`edit-${message.id}`}>
                {t("message")}
              </FieldLabel>
              <Textarea
                id={`edit-${message.id}`}
                value={body}
                onChange={(event) => setBody(event.target.value)}
                autoFocus
              />
            </Field>
          </FieldGroup>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>
              {t("cancel")}
            </DialogClose>
            <Button type="submit">{t("save")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function MeetingCard({
  message,
  compact,
}: {
  message: Message
  compact?: boolean
}) {
  const t = useTranslations("Messaging")
  const locale = useLocale()
  const { getMember } = useMessaging()
  const author = getMember(message.authorId)
  const meeting = message.meeting
  if (!meeting) return null
  const startsAt = new Date(meeting.startsAt)

  return (
    <div className="flex items-start gap-3">
      <Avatar size="sm" className="size-8">
        <AvatarFallback>{author ? initials(author.name) : "?"}</AvatarFallback>
      </Avatar>
      <div className={cn("flex-1", compact ? "" : "mt-0.5")}>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">
            {author?.name ?? t("unknown")}
          </span>
          {formatTime(message.createdAt, locale)}
        </div>
        <div className="mt-1.5 flex items-center gap-3 rounded-xl border bg-card p-3">
          <span className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <CalendarClockIcon className="size-4" />
          </span>
          <div className="flex flex-col">
            <span className="text-sm font-medium">{meeting.title}</span>
            <span className="text-xs text-muted-foreground">
              {startsAt.toLocaleDateString(locale, {
                weekday: "short",
                month: "short",
                day: "numeric",
              })}{" "}
              · {formatTime(startsAt, locale)} ·{" "}
              {t("minutesShort", { count: meeting.durationMinutes })}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
