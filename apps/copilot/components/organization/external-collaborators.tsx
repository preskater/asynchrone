"use client"

import * as React from "react"
import { useFormatter, useTranslations } from "next-intl"
import {
  CopyIcon,
  Trash2Icon,
  UserPlusIcon,
  UsersRoundIcon,
} from "lucide-react"
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
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"

import { unwrapActionResult } from "@workspace/core/action"
import {
  BASE_GUEST_CAPABILITIES,
  DEFAULT_GUEST_CAPABILITIES,
  GUEST_CAPABILITIES,
  GUEST_EXPIRY_DAYS,
  type GuestCapability,
} from "@workspace/core/guests"
import { useErrorTranslator } from "@workspace/i18n/errors"
import { useRouter } from "@workspace/i18n/navigation"

import { inviteGuestAction, revokeGuestAction } from "@/actions/guests"
import type { GuestView } from "@/lib/guests/service"

/** `task:comment` → `capability.taskComment` */
function capabilityKey(capability: GuestCapability) {
  const [scope, verb] = capability.split(":") as [string, string]
  return `capability.${scope}${verb[0]!.toUpperCase()}${verb.slice(1)}`
}

/**
 * Settings → Members → External collaborators. Owners and admins only; the
 * section is not rendered for anyone else, and every action re-checks.
 */
export function ExternalCollaborators({
  guests,
  projects,
  limit,
}: {
  guests: GuestView[]
  projects: { id: string; name: string }[]
  /** Guests allowed per project on the plan; 0 when the plan excludes them. */
  limit: number
}) {
  const t = useTranslations("Guests")
  const format = useFormatter()
  const te = useErrorTranslator()
  const router = useRouter()

  async function revoke(guest: GuestView) {
    try {
      unwrapActionResult(await revokeGuestAction({ id: guest.id }))
      toast.success(t("revoked"))
      router.refresh()
    } catch (error) {
      toast.error(te(error, "internal"))
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1">
            <CardTitle className="flex items-center gap-2">
              <UsersRoundIcon className="size-4" />
              {t("sectionTitle")}
            </CardTitle>
            <CardDescription>
              {t("sectionDescription")}{" "}
              {limit > 0 && Number.isFinite(limit)
                ? t("sectionLimit", { limit })
                : null}
            </CardDescription>
          </div>
          {limit > 0 ? <InviteGuestDialog projects={projects} /> : null}
        </div>
      </CardHeader>
      <CardContent>
        {limit <= 0 ? (
          <p className="text-sm text-muted-foreground">{t("upgrade")}</p>
        ) : guests.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("none")}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {guests.map((guest) => (
              <li
                key={guest.id}
                className="flex flex-wrap items-center justify-between gap-3 border-b pb-3 last:border-b-0 last:pb-0"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {guest.name ?? guest.email}
                    <Badge
                      variant={guest.state === "active" ? "default" : "outline"}
                    >
                      {t(`state.${guest.state}`)}
                    </Badge>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {guest.name ? `${guest.email} · ` : ""}
                    {guest.projectName} · {t("expires")}{" "}
                    {format.dateTime(new Date(guest.expiresAt), {
                      dateStyle: "medium",
                    })}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {guest.capabilities
                      .filter((cap) => !BASE_GUEST_CAPABILITIES.includes(cap))
                      .map((cap) => t(capabilityKey(cap) as never))
                      .join(" · ")}
                  </span>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger
                    render={<Button variant="ghost" size="sm" />}
                  >
                    <Trash2Icon data-icon="inline-start" />
                    {t("revoke")}
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>{t("revoke")}</AlertDialogTitle>
                      <AlertDialogDescription>
                        {t("revokeConfirm", {
                          email: guest.email,
                          project: guest.projectName,
                        })}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
                      <AlertDialogAction
                        variant="destructive"
                        onClick={() => revoke(guest)}
                      >
                        {t("revoke")}
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function InviteGuestDialog({
  projects,
}: {
  projects: { id: string; name: string }[]
}) {
  const t = useTranslations("Guests")
  const te = useErrorTranslator()
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [projectId, setProjectId] = React.useState("")
  const [email, setEmail] = React.useState("")
  const [days, setDays] = React.useState("30")
  const [capabilities, setCapabilities] = React.useState<GuestCapability[]>([
    ...DEFAULT_GUEST_CAPABILITIES,
  ])
  const [pending, setPending] = React.useState(false)
  const [inviteUrl, setInviteUrl] = React.useState<string | null>(null)

  const projectItems = projects.map((project) => ({
    value: project.id,
    label: project.name,
  }))
  const dayItems = GUEST_EXPIRY_DAYS.map((value) => ({
    value: String(value),
    label: t("expiryDays", { days: value }),
  }))

  function reset() {
    setProjectId("")
    setEmail("")
    setDays("30")
    setCapabilities([...DEFAULT_GUEST_CAPABILITIES])
    setInviteUrl(null)
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    try {
      const result = unwrapActionResult(
        await inviteGuestAction({
          projectId,
          email,
          expiresInDays: Number(days),
          capabilities,
        })
      )
      toast.success(t("invited"))
      setInviteUrl(result.inviteUrl)
      router.refresh()
    } catch (error) {
      toast.error(te(error, "internal"))
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) reset()
      }}
    >
      <DialogTrigger render={<Button size="sm" />}>
        <UserPlusIcon data-icon="inline-start" />
        {t("invite")}
      </DialogTrigger>
      <DialogContent>
        {inviteUrl ? (
          <>
            <DialogHeader>
              <DialogTitle>{t("linkTitle")}</DialogTitle>
              <DialogDescription>{t("linkDescription")}</DialogDescription>
            </DialogHeader>
            <Input readOnly value={inviteUrl} aria-label={t("linkTitle")} />
            <DialogFooter>
              <Button
                variant="outline"
                onClick={async () => {
                  await navigator.clipboard.writeText(inviteUrl)
                  toast.success(t("copied"))
                }}
              >
                <CopyIcon data-icon="inline-start" />
                {t("copy")}
              </Button>
              <Button onClick={() => setOpen(false)}>{t("done")}</Button>
            </DialogFooter>
          </>
        ) : (
          <form className="flex flex-col gap-4" onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>{t("inviteTitle")}</DialogTitle>
              <DialogDescription>{t("inviteDescription")}</DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="guest-project">{t("project")}</Label>
              {projects.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("noProjects")}
                </p>
              ) : (
                <Select
                  items={projectItems}
                  value={projectId || null}
                  onValueChange={(next) => setProjectId(String(next ?? ""))}
                >
                  <SelectTrigger id="guest-project" className="w-full">
                    <SelectValue placeholder={t("projectPlaceholder")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {projectItems.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="guest-email">{t("email")}</Label>
              <Input
                id="guest-email"
                type="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="guest-expiry">{t("expiry")}</Label>
              <Select
                items={dayItems}
                value={days}
                onValueChange={(next) => setDays(String(next ?? "30"))}
              >
                <SelectTrigger id="guest-expiry" className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {dayItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-sm font-medium">
                {t("capabilities")}
              </legend>
              {GUEST_CAPABILITIES.map((capability) => {
                const base = BASE_GUEST_CAPABILITIES.includes(capability)
                const id = `guest-cap-${capability.replace(":", "-")}`
                return (
                  <div key={capability} className="flex items-center gap-2">
                    <Checkbox
                      id={id}
                      checked={base || capabilities.includes(capability)}
                      disabled={base}
                      onCheckedChange={(checked) =>
                        setCapabilities((current) =>
                          checked
                            ? [...current, capability]
                            : current.filter((entry) => entry !== capability)
                        )
                      }
                    />
                    <Label htmlFor={id} className="font-normal">
                      {t(capabilityKey(capability) as never)}
                    </Label>
                  </div>
                )
              })}
            </fieldset>
            <DialogFooter>
              <Button type="submit" disabled={pending || !projectId || !email}>
                {pending ? t("sending") : t("send")}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
