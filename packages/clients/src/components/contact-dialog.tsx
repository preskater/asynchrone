"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
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
import { Input } from "@workspace/ui/components/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Spinner } from "@workspace/ui/components/spinner"
import { Textarea } from "@workspace/ui/components/textarea"

import { useClientActions } from "./actions"
import { useRouter } from "@workspace/i18n/navigation"
import { unwrapActionResult } from "@workspace/core/action"
import type {
  ClientOptionData,
  ClientContactData,
  ClientFieldDefinitionData,
  ClientMemberOptionData,
} from "../types"
import { useErrorTranslator } from "@workspace/i18n/errors"

import { CustomFieldInputs } from "./custom-fields"

export function ContactDialog({
  contact,
  clients,
  members,
  fieldDefinitions,
  defaultClientId,
  trigger,
}: {
  contact?: ClientContactData
  clients: ClientOptionData[]
  members: ClientMemberOptionData[]
  fieldDefinitions: ClientFieldDefinitionData[]
  defaultClientId?: string
  trigger: React.ReactElement
}) {
  const t = useTranslations("Clients")
  const tT = useTranslations("Toasts")
  const te = useErrorTranslator()
  const router = useRouter()
  const { saveContactAction } = useClientActions()

  const definitions = fieldDefinitions.filter((def) => def.entity === "contact")

  const [open, setOpen] = React.useState(false)
  const [firstName, setFirstName] = React.useState("")
  const [lastName, setLastName] = React.useState("")
  const [email, setEmail] = React.useState("")
  const [phone, setPhone] = React.useState("")
  const [jobTitle, setJobTitle] = React.useState("")
  const [ownerId, setOwnerId] = React.useState("")
  const [notes, setNotes] = React.useState("")
  const [companyIds, setCompanyIds] = React.useState<string[]>([])
  const [primaryId, setPrimaryId] = React.useState("")
  const [customValues, setCustomValues] = React.useState<
    Record<string, unknown>
  >({})
  const [submitting, setSubmitting] = React.useState(false)

  function reset() {
    const linked = contact?.companies.map((link) => link.clientId) ?? []
    setFirstName(contact?.firstName ?? "")
    setLastName(contact?.lastName ?? "")
    setEmail(contact?.email ?? "")
    setPhone(contact?.phone ?? "")
    setJobTitle(contact?.jobTitle ?? "")
    setOwnerId(contact?.ownerId ?? "")
    setNotes(contact?.notes ?? "")
    setCompanyIds(
      linked.length > 0 ? linked : defaultClientId ? [defaultClientId] : []
    )
    setPrimaryId(
      contact?.companies.find((link) => link.isPrimary)?.clientId ??
        defaultClientId ??
        ""
    )
    setCustomValues(contact ? { ...contact.customFields } : {})
  }

  function toggleCompany(clientId: string, checked: boolean) {
    setCompanyIds((prev) => {
      const next = checked
        ? [...prev, clientId]
        : prev.filter((id) => id !== clientId)
      if (!next.includes(primaryId)) setPrimaryId(next[0] ?? "")
      if (next.length === 1) setPrimaryId(next[0]!)
      return next
    })
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!firstName.trim()) return
    setSubmitting(true)
    try {
      unwrapActionResult(
        await saveContactAction({
          id: contact?.id,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim() === "" ? null : email.trim(),
          phone: phone.trim() === "" ? null : phone.trim(),
          jobTitle: jobTitle.trim() === "" ? null : jobTitle.trim(),
          ownerId: ownerId === "" ? null : ownerId,
          notes: notes.trim() === "" ? null : notes.trim(),
          companies: companyIds.map((clientId) => ({
            clientId,
            isPrimary: clientId === primaryId,
          })),
          customFields: customValues,
        })
      )
      toast.success(tT("contactSaved"))
      setOpen(false)
      router.refresh()
    } catch (error) {
      toast.error(te(error, "internal"))
    } finally {
      setSubmitting(false)
    }
  }

  const ownerItems = members.map((member) => ({
    value: member.id,
    label: member.name,
  }))
  const primaryItems = companyIds
    .map((clientId) => clients.find((client) => client.id === clientId))
    .filter((client): client is ClientOptionData => Boolean(client))
    .map((client) => ({ value: client.id, label: client.name }))

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next) reset()
      }}
    >
      <DialogTrigger render={trigger} />
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {contact ? t("contacts.edit") : t("contacts.new")}
          </DialogTitle>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="client-contact-first">
                  {t("contacts.fields.firstName")}
                </FieldLabel>
                <Input
                  id="client-contact-first"
                  value={firstName}
                  required
                  maxLength={80}
                  onChange={(event) => setFirstName(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="client-contact-last">
                  {t("contacts.fields.lastName")}
                </FieldLabel>
                <Input
                  id="client-contact-last"
                  value={lastName}
                  maxLength={80}
                  onChange={(event) => setLastName(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="client-contact-email">
                  {t("contacts.fields.email")}
                </FieldLabel>
                <Input
                  id="client-contact-email"
                  type="email"
                  value={email}
                  maxLength={200}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="client-contact-phone">
                  {t("contacts.fields.phone")}
                </FieldLabel>
                <Input
                  id="client-contact-phone"
                  type="tel"
                  value={phone}
                  maxLength={50}
                  onChange={(event) => setPhone(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="client-contact-title">
                  {t("contacts.fields.jobTitle")}
                </FieldLabel>
                <Input
                  id="client-contact-title"
                  value={jobTitle}
                  maxLength={120}
                  onChange={(event) => setJobTitle(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="client-contact-owner">
                  {t("contacts.fields.owner")}
                </FieldLabel>
                <Select
                  items={ownerItems}
                  value={ownerId}
                  onValueChange={(value) => setOwnerId(value ?? "")}
                >
                  <SelectTrigger id="client-contact-owner" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {ownerItems.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <Field>
              <FieldLabel>{t("contacts.fields.companies")}</FieldLabel>
              {clients.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("clients.emptyAll")}
                </p>
              ) : (
                <div className="flex max-h-40 flex-col gap-2 overflow-y-auto rounded-md border p-3">
                  {clients.map((client) => (
                    <label
                      key={client.id}
                      className="flex items-center gap-2 text-sm"
                    >
                      <Checkbox
                        checked={companyIds.includes(client.id)}
                        onCheckedChange={(checked) =>
                          toggleCompany(client.id, checked === true)
                        }
                      />
                      {client.name}
                    </label>
                  ))}
                </div>
              )}
            </Field>

            {primaryItems.length > 1 ? (
              <Field>
                <FieldLabel htmlFor="client-contact-primary">
                  {t("contacts.fields.primary")}
                </FieldLabel>
                <Select
                  items={primaryItems}
                  value={primaryId}
                  onValueChange={(value) => setPrimaryId(value ?? "")}
                >
                  <SelectTrigger id="client-contact-primary" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {primaryItems.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            ) : null}

            <Field>
              <FieldLabel htmlFor="client-contact-notes">
                {t("contacts.fields.notes")}
              </FieldLabel>
              <Textarea
                id="client-contact-notes"
                value={notes}
                maxLength={2000}
                rows={3}
                onChange={(event) => setNotes(event.target.value)}
              />
            </Field>

            <CustomFieldInputs
              definitions={definitions}
              values={customValues}
              onChange={(key, value) =>
                setCustomValues((prev) => ({ ...prev, [key]: value }))
              }
            />
          </FieldGroup>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" type="button" />}>
              {t("common.cancel")}
            </DialogClose>
            <Button type="submit" disabled={submitting || !firstName.trim()}>
              {submitting ? <Spinner className="size-4" /> : null}
              {t("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
