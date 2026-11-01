"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@workspace/ui/components/field"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Spinner } from "@workspace/ui/components/spinner"

import { unwrapActionResult } from "@workspace/core/action"
import { PORTAL_POLICIES, type PortalPolicy, type Project } from "../../types"
import { useErrorTranslator } from "@workspace/i18n/errors"

import { useProjectActions } from "../../ui/actions"

/** Per-project client-portal visibility and contribution policies. */
export function ProjectPortalSettings({ project }: { project: Project }) {
  const t = useTranslations("Projects")
  const tT = useTranslations("Toasts")
  const te = useErrorTranslator()
  const actions = useProjectActions()

  const [visible, setVisible] = React.useState(project.clientVisible)
  const [discussion, setDiscussion] = React.useState<PortalPolicy>(
    project.clientDiscussion
  )
  const [comments, setComments] = React.useState<PortalPolicy>(
    project.clientTaskComments
  )
  const [saving, setSaving] = React.useState(false)

  const policyItems = PORTAL_POLICIES.map((value) => ({
    value,
    label: t(
      value === "none"
        ? "policyNone"
        : value === "read"
          ? "policyRead"
          : "policyReadWrite"
    ),
  }))

  async function save(next: {
    clientVisible?: boolean
    clientDiscussion?: PortalPolicy
    clientTaskComments?: PortalPolicy
  }) {
    setSaving(true)
    try {
      unwrapActionResult(
        await actions.updateClientSettings({
          projectId: project.id,
          clientVisible: next.clientVisible ?? visible,
          clientDiscussion: next.clientDiscussion ?? discussion,
          clientTaskComments: next.clientTaskComments ?? comments,
        })
      )
      toast.success(tT("projectClientSettingsSaved"))
    } catch (error) {
      toast.error(te(error, "internal"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-col gap-1">
            <CardTitle>{t("clientPortal")}</CardTitle>
            <CardDescription>{t("clientPortalDescription")}</CardDescription>
          </div>
          {saving ? <Spinner className="size-4" /> : null}
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="flex items-start gap-3">
          <Checkbox
            id="client-visible"
            checked={visible}
            onCheckedChange={(checked) => {
              const next = checked === true
              setVisible(next)
              void save({ clientVisible: next })
            }}
          />
          <div className="flex flex-col gap-1">
            <label htmlFor="client-visible" className="text-sm font-medium">
              {t("clientVisible")}
            </label>
            <p className="text-sm text-muted-foreground">
              {t("clientVisibleDescription")}
            </p>
          </div>
        </div>

        <Field data-disabled={!visible}>
          <FieldLabel>{t("clientDiscussion")}</FieldLabel>
          <Select
            items={policyItems}
            value={discussion}
            disabled={!visible}
            onValueChange={(value) => {
              const next = (value ?? "read_write") as PortalPolicy
              setDiscussion(next)
              void save({ clientDiscussion: next })
            }}
          >
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {policyItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <FieldDescription>
            {t("clientDiscussionDescription")}
          </FieldDescription>
        </Field>

        <Field data-disabled={!visible}>
          <FieldLabel>{t("clientTaskComments")}</FieldLabel>
          <Select
            items={policyItems}
            value={comments}
            disabled={!visible}
            onValueChange={(value) => {
              const next = (value ?? "read_write") as PortalPolicy
              setComments(next)
              void save({ clientTaskComments: next })
            }}
          >
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {policyItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <FieldDescription>
            {t("clientTaskCommentsDescription")}
          </FieldDescription>
        </Field>
      </CardContent>
    </Card>
  )
}
