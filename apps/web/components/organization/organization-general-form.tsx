"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { Spinner } from "@workspace/ui/components/spinner"

import { authClient } from "@/lib/auth-client"
import { slugify } from "@workspace/organization/utils"

export function OrganizationGeneralForm({
  organization,
  canEdit,
  onSaved,
}: {
  organization: { id: string; name: string; slug: string; logo?: string | null }
  canEdit: boolean
  onSaved: () => void
}) {
  const [name, setName] = React.useState(organization.name)
  const t = useTranslations("Org")
  const [slug, setSlug] = React.useState(organization.slug)
  const [saving, setSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    setName(organization.name)
    setSlug(organization.slug)
  }, [organization.name, organization.slug])

  const dirty = name !== organization.name || slug !== organization.slug

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const trimmedName = name.trim()
    const trimmedSlug = slugify(slug || name)
    if (!trimmedName || !trimmedSlug) {
      setError(t("nameAndSlugRequired"))
      return
    }
    setSaving(true)
    setError(null)
    const { error } = await authClient.organization.update({
      data: { name: trimmedName, slug: trimmedSlug },
    })
    if (error) {
      setError(error.message ?? t("unableToUpdateOrganization"))
      setSaving(false)
      return
    }
    toast.success(t("organizationUpdated"))
    setSaving(false)
    onSaved()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("general")}</CardTitle>
        <CardDescription>
          {t("generalCardDescription")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="org-name">{t("name")}</FieldLabel>
              <Input
                id="org-name"
                value={name}
                disabled={!canEdit}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="org-slug">{t("slug")}</FieldLabel>
              <Input
                id="org-slug"
                value={slug}
                disabled={!canEdit}
                onChange={(event) => setSlug(event.target.value)}
              />
              <FieldDescription>
                {t("slugDescription")}
              </FieldDescription>
            </Field>
            {error ? (
              <p className="text-sm text-destructive">{error}</p>
            ) : null}
            {canEdit ? (
              <Field orientation="horizontal">
                <Button type="submit" disabled={!dirty || saving}>
                  {saving ? <Spinner /> : null}
                  {saving ? t("saving") : t("saveChanges")}
                </Button>
              </Field>
            ) : (
              <FieldDescription>
                {t("noEditPermission")}
              </FieldDescription>
            )}
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}
