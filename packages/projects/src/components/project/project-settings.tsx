"use client"

import * as React from "react"
import { PlusIcon, Trash2Icon } from "lucide-react"
import { useTranslations } from "next-intl"

import { MemberAvatar } from "../task/member-avatar"
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
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"

import { useProjectStore } from "../../ui/store"
import { useEnumLabel } from "@workspace/i18n/labels"
import { TASK_STATUS_VALUES, type MemberRole, type Project } from "../../types"

import { LABEL_COLOR_PALETTE, LabelColorPicker } from "./label-color-picker"
import { ProjectPortalSettings } from "./project-portal-settings"
import { ProjectRepositorySettings } from "./project-repository-settings"
import { TaskTemplatesManager } from "./task-templates-manager"

const ROLE_VALUES: MemberRole[] = ["owner", "admin", "member", "viewer"]

const HEX_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

function InviteMemberDialog() {
  const t = useTranslations("Projects")
  const L = useEnumLabel()
  const roleItems = ROLE_VALUES.map((value) => ({
    label: L.orgRole(value),
    value,
  }))
  const { addMember } = useProjectStore()
  const [open, setOpen] = React.useState(false)
  const [name, setName] = React.useState("")
  const [email, setEmail] = React.useState("")
  const [role, setRole] = React.useState<MemberRole>("member")

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>
        <PlusIcon data-icon="inline-start" />
        {t("inviteMember")}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("inviteMember")}</DialogTitle>
          <DialogDescription>{t("addMemberDescription")}</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (!name.trim() || !email.trim()) return
            addMember({ name: name.trim(), email: email.trim(), role })
            setName("")
            setEmail("")
            setRole("member")
            setOpen(false)
          }}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="member-name">{t("name")}</FieldLabel>
              <Input
                id="member-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t("memberNamePlaceholder")}
                autoFocus
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="member-email">{t("email")}</FieldLabel>
              <Input
                id="member-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder={t("memberEmailPlaceholder")}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="member-role">{t("role")}</FieldLabel>
              <Select
                items={roleItems}
                value={role}
                onValueChange={(value) => setRole(value as MemberRole)}
              >
                <SelectTrigger id="member-role" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {roleItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
          </FieldGroup>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>
              {t("cancel")}
            </DialogClose>
            <Button type="submit">{t("sendInvite")}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function AddLabelDialog() {
  const t = useTranslations("Projects")
  const { labels, addLabel } = useProjectStore()
  const [open, setOpen] = React.useState(false)
  const [name, setName] = React.useState("")
  const [color, setColor] = React.useState<string>(LABEL_COLOR_PALETTE[0])

  const normalized = color.trim().toLowerCase()
  const colorValid = HEX_PATTERN.test(normalized)
  const colorTaken = labels.some(
    (label) => label.color.trim().toLowerCase() === normalized
  )
  const canSubmit = name.trim().length > 0 && colorValid && !colorTaken

  function reset() {
    setName("")
    setColor(LABEL_COLOR_PALETTE[0])
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
        <PlusIcon data-icon="inline-start" />
        {t("addLabel")}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("addLabel")}</DialogTitle>
          <DialogDescription>{t("addLabelDescription")}</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            if (!canSubmit) return
            addLabel(name.trim(), normalized)
            reset()
            setOpen(false)
          }}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="label-name">{t("name")}</FieldLabel>
              <Input
                id="label-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t("labelNamePlaceholder")}
                autoFocus
              />
            </Field>
            <Field>
              <FieldLabel>{t("color")}</FieldLabel>
              <LabelColorPicker value={color} onChange={setColor} />
              {colorTaken ? (
                <p className="text-xs text-destructive">
                  {t("colorAlreadyUsed")}
                </p>
              ) : null}
            </Field>
          </FieldGroup>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>
              {t("cancel")}
            </DialogClose>
            <Button type="submit" disabled={!canSubmit}>
              {t("addLabel")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function ProjectSettings({ project }: { project: Project }) {
  const t = useTranslations("Projects")
  const L = useEnumLabel()
  const roleItems = ROLE_VALUES.map((value) => ({
    label: L.orgRole(value),
    value,
  }))
  const {
    members,
    labels,
    updateMemberRole,
    removeMember,
    removeLabel,
    canManageMembers: canManage,
  } = useProjectStore()

  return (
    <Tabs defaultValue="members" className="flex flex-col gap-4">
      <TabsList variant="line" className="w-full justify-start border-b pb-0">
        <TabsTrigger value="members">{t("members")}</TabsTrigger>
        <TabsTrigger value="labels">{t("labels")}</TabsTrigger>
        <TabsTrigger value="statuses">{t("statuses")}</TabsTrigger>
        {canManage ? (
          <TabsTrigger value="clientPortal">{t("clientPortal")}</TabsTrigger>
        ) : null}
        {canManage ? (
          <TabsTrigger value="repository">{t("repository")}</TabsTrigger>
        ) : null}
        {canManage ? (
          <TabsTrigger value="templates">{t("templates")}</TabsTrigger>
        ) : null}
      </TabsList>

      <TabsContent value="members">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-col gap-1">
                <CardTitle>{t("members")}</CardTitle>
                <CardDescription>{t("membersDescription")}</CardDescription>
              </div>
              <InviteMemberDialog />
            </div>
          </CardHeader>
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("members")}</TableHead>
                  <TableHead className="hidden sm:table-cell">
                    {t("email")}
                  </TableHead>
                  <TableHead>{t("role")}</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <MemberAvatar member={member} size="sm" />
                        <span className="font-medium">{member.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">
                      {member.email}
                    </TableCell>
                    <TableCell>
                      <Select
                        items={roleItems}
                        value={member.role}
                        onValueChange={(value) =>
                          updateMemberRole(member.id, value as MemberRole)
                        }
                      >
                        <SelectTrigger size="sm" className="w-28">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {roleItems.map((item) => (
                              <SelectItem key={item.value} value={item.value}>
                                {item.label}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <AlertDialog>
                        <AlertDialogTrigger
                          render={
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={t("removeMember", {
                                name: member.name,
                              })}
                            />
                          }
                        >
                          <Trash2Icon />
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              {t("removeMemberQuestion", {
                                name: member.name,
                              })}
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              {t("removeMemberDescription")}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
                            <AlertDialogAction
                              variant="destructive"
                              onClick={() => removeMember(member.id)}
                            >
                              {t("remove")}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="labels">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-col gap-1">
                <CardTitle>{t("labels")}</CardTitle>
                <CardDescription>{t("availableLabels")}</CardDescription>
              </div>
              <AddLabelDialog />
            </div>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {labels.map((label) => (
              <div
                key={label.id}
                className="flex items-center gap-2 rounded-full border border-border py-1 ps-3 pe-1"
              >
                <span
                  aria-hidden
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: label.color }}
                />
                <span className="text-sm">{label.name}</span>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={t("deleteLabel", { label: label.name })}
                  onClick={() => removeLabel(label.id)}
                >
                  <Trash2Icon />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="statuses">
        <Card>
          <CardHeader>
            <CardTitle>{t("statuses")}</CardTitle>
            <CardDescription>{t("statusesDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {TASK_STATUS_VALUES.map((status) => (
              <div
                key={status}
                className="flex items-center justify-between rounded-lg border border-border px-3 py-2"
              >
                <span className="text-sm font-medium">
                  {L.taskStatus(status)}
                </span>
                <Badge variant="outline">{status}</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </TabsContent>

      {canManage ? (
        <TabsContent value="clientPortal">
          <ProjectPortalSettings project={project} />
        </TabsContent>
      ) : null}

      {canManage ? (
        <TabsContent value="repository">
          <ProjectRepositorySettings project={project} />
        </TabsContent>
      ) : null}

      {canManage ? (
        <TabsContent value="templates">
          <TaskTemplatesManager projectId={project.id} />
        </TabsContent>
      ) : null}
    </Tabs>
  )
}
