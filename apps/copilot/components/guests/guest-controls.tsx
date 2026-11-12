"use client"

import * as React from "react"
import { useFormatter, useTranslations } from "next-intl"
import { LogOutIcon, UserRoundIcon } from "lucide-react"
import { toast } from "sonner"

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
import { Button } from "@workspace/ui/components/button"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"

import { unwrapActionResult } from "@workspace/core/action"
import { useErrorTranslator } from "@workspace/i18n/errors"
import { taskStatusSchema } from "@workspace/projects/schemas"
import { Link, useRouter } from "@workspace/i18n/navigation"

import {
  acceptGuestInvitationAction,
  leaveGuestProjectAction,
  updateGuestTaskStatusAction,
} from "@/actions/guests"
import { authClient } from "@/lib/auth-client"

/** The guest space header: no workspace switcher, just the person. */
export function GuestHeader({ userName }: { userName: string | null }) {
  const t = useTranslations("Guests")
  const router = useRouter()
  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex h-14 w-full max-w-4xl items-center justify-between gap-3 px-4 md:px-6">
        <Link href="/guest" prefetch={false} className="font-semibold">
          {t("spaceTitle")}
        </Link>
        {userName ? (
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <UserRoundIcon className="size-4" />
              {userName}
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={t("signOut")}
              onClick={async () => {
                await authClient.signOut()
                router.push("/sign-in")
              }}
            >
              <LogOutIcon />
            </Button>
          </div>
        ) : null}
      </div>
    </header>
  )
}

/** "You are a guest in Acme — access to X until …" with a way out. */
export function GuestBanner({
  grantId,
  organizationName,
  projectName,
  expiresAt,
}: {
  grantId: string
  organizationName: string
  projectName: string
  expiresAt: string
}) {
  const t = useTranslations("Guests")
  const format = useFormatter()
  const te = useErrorTranslator()
  const router = useRouter()
  const [leaving, setLeaving] = React.useState(false)

  async function leave() {
    setLeaving(true)
    try {
      unwrapActionResult(await leaveGuestProjectAction({ id: grantId }))
      toast.success(t("left"))
      router.push("/guest")
    } catch (error) {
      toast.error(te(error, "internal"))
      setLeaving(false)
    }
  }

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm"
    >
      <span>
        {t("banner", {
          organization: organizationName,
          project: projectName,
          date: format.dateTime(new Date(expiresAt), { dateStyle: "medium" }),
        })}
      </span>
      <AlertDialog>
        <AlertDialogTrigger render={<Button variant="outline" size="sm" />}>
          {t("leave")}
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("leave")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("leaveConfirm", { project: projectName })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={leaving}
              onClick={leave}
            >
              {t("leave")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export function GuestTaskStatus({
  grantId,
  taskId,
  status,
}: {
  grantId: string
  taskId: string
  status: string
}) {
  const t = useTranslations("Guests")
  const tEnums = useTranslations("Enums")
  const te = useErrorTranslator()
  const router = useRouter()
  const [value, setValue] = React.useState(status)
  const items = taskStatusSchema.options.map((entry) => ({
    value: entry,
    label: tEnums(`taskStatus.${entry}` as never),
  }))

  async function change(next: string) {
    const previous = value
    setValue(next)
    try {
      unwrapActionResult(
        await updateGuestTaskStatusAction({ grantId, taskId, status: next })
      )
      toast.success(t("statusUpdated"))
      router.refresh()
    } catch (error) {
      setValue(previous)
      toast.error(te(error, "internal"))
    }
  }

  return (
    <Select
      items={items}
      value={value}
      onValueChange={(next) => next && change(String(next))}
    >
      <SelectTrigger size="sm" className="w-40" aria-label={t("statusLabel")}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}

export function AcceptGuestInvitationButton({ token }: { token: string }) {
  const t = useTranslations("Guests")
  const te = useErrorTranslator()
  const router = useRouter()
  const [pending, setPending] = React.useState(false)

  async function accept() {
    setPending(true)
    try {
      const { grantId } = unwrapActionResult(
        await acceptGuestInvitationAction({ token })
      )
      router.push(`/guest/${grantId}`)
    } catch (error) {
      toast.error(te(error, "internal"))
      setPending(false)
    }
  }

  return (
    <Button onClick={accept} disabled={pending}>
      {t("acceptButton")}
    </Button>
  )
}
