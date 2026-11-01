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
  ClientData,
  ClientStatus,
  ClientFieldDefinitionData,
  ClientMemberOptionData,
} from "../types"
import { CLIENT_STATUSES } from "../types"
import { useErrorTranslator } from "@workspace/i18n/errors"
import { useEnumLabel } from "@workspace/i18n/labels"

import { CustomFieldInputs } from "./custom-fields"

export function ClientDialog({
  client,
  members,
  fieldDefinitions,
  trigger,
}: {
  client?: ClientData
  members: ClientMemberOptionData[]
  fieldDefinitions: ClientFieldDefinitionData[]
  trigger: React.ReactElement
}) {
  const t = useTranslations("Clients")
  const tT = useTranslations("Toasts")
  const te = useErrorTranslator()
  const L = useEnumLabel()
  const router = useRouter()
  const { saveClientAction } = useClientActions()

  const definitions = fieldDefinitions.filter((def) => def.entity === "client")

  const [open, setOpen] = React.useState(false)
  const [name, setName] = React.useState("")
  const [status, setStatus] = React.useState<ClientStatus>("prospect")
  const [industry, setIndustry] = React.useState("")
  const [website, setWebsite] = React.useState("")
  const [phone, setPhone] = React.useState("")
  const [address, setAddress] = React.useState("")
  const [contactEmail, setContactEmail] = React.useState("")
  const [source, setSource] = React.useState("")
  const [ownerId, setOwnerId] = React.useState("")
  const [description, setDescription] = React.useState("")
  const [isActive, setIsActive] = React.useState(true)
  const [customValues, setCustomValues] = React.useState<
    Record<string, unknown>
  >({})
  const [submitting, setSubmitting] = React.useState(false)

  function reset() {
    setName(client?.name ?? "")
    setStatus(client?.status ?? "prospect")
    setIndustry(client?.industry ?? "")
    setWebsite(client?.website ?? "")
    setPhone(client?.phone ?? "")
    setAddress(client?.address ?? "")
    setContactEmail(client?.contactEmail ?? "")
    setSource(client?.source ?? "")
    setOwnerId(client?.ownerId ?? "")
    setDescription(client?.description ?? "")
    setIsActive(client?.isActive ?? true)
    setCustomValues(client ? { ...client.customFields } : {})
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!name.trim()) return
    setSubmitting(true)
    try {
      unwrapActionResult(
        await saveClientAction({
          id: client?.id,
          name: name.trim(),
          status,
          industry: industry.trim() === "" ? null : industry.trim(),
          website: website.trim() === "" ? null : website.trim(),
          phone: phone.trim() === "" ? null : phone.trim(),
          address: address.trim() === "" ? null : address.trim(),
          contactEmail: contactEmail.trim() === "" ? null : contactEmail.trim(),
          source: source.trim() === "" ? null : source.trim(),
          ownerId: ownerId === "" ? null : ownerId,
          description: description.trim() === "" ? null : description.trim(),
          isActive,
          customFields: customValues,
        })
      )
      toast.success(tT("clientSaved"))
      setOpen(false)
      router.refresh()
    } catch (error) {
      toast.error(te(error, "internal"))
    } finally {
      setSubmitting(false)
    }
  }

  const statusItems = CLIENT_STATUSES.map((value) => ({
    value,
    label: L.clientStatus(value),
  }))
  const ownerItems = members.map((member) => ({
    value: member.id,
    label: member.name,
  }))

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
            {client ? t("clients.edit") : t("clients.new")}
          </DialogTitle>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="client-client-name">
                  {t("clients.fields.name")}
                </FieldLabel>
                <Input
                  id="client-client-name"
                  value={name}
                  required
                  maxLength={120}
                  onChange={(event) => setName(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="client-client-status">
                  {t("clients.fields.status")}
                </FieldLabel>
                <Select
                  items={statusItems}
                  value={status}
                  onValueChange={(value) => setStatus(value as ClientStatus)}
                >
                  <SelectTrigger id="client-client-status" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {statusItems.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="client-client-industry">
                  {t("clients.fields.industry")}
                </FieldLabel>
                <Input
                  id="client-client-industry"
                  value={industry}
                  maxLength={120}
                  onChange={(event) => setIndustry(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="client-client-website">
                  {t("clients.fields.website")}
                </FieldLabel>
                <Input
                  id="client-client-website"
                  type="url"
                  value={website}
                  maxLength={300}
                  placeholder="https://"
                  onChange={(event) => setWebsite(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="client-client-phone">
                  {t("clients.fields.phone")}
                </FieldLabel>
                <Input
                  id="client-client-phone"
                  type="tel"
                  value={phone}
                  maxLength={50}
                  onChange={(event) => setPhone(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="client-client-email">
                  {t("clients.fields.contactEmail")}
                </FieldLabel>
                <Input
                  id="client-client-email"
                  type="email"
                  value={contactEmail}
                  maxLength={200}
                  onChange={(event) => setContactEmail(event.target.value)}
                />
              </Field>
            </div>
            <Field>
              <FieldLabel htmlFor="client-client-address">
                {t("clients.fields.address")}
              </FieldLabel>
              <Input
                id="client-client-address"
                value={address}
                maxLength={300}
                onChange={(event) => setAddress(event.target.value)}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="client-client-source">
                  {t("clients.fields.source")}
                </FieldLabel>
                <Input
                  id="client-client-source"
                  value={source}
                  maxLength={120}
                  onChange={(event) => setSource(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="client-client-owner">
                  {t("clients.fields.owner")}
                </FieldLabel>
                <Select
                  items={ownerItems}
                  value={ownerId}
                  onValueChange={(value) => setOwnerId(value ?? "")}
                >
                  <SelectTrigger id="client-client-owner" className="w-full">
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
              <FieldLabel htmlFor="client-client-description">
                {t("clients.fields.description")}
              </FieldLabel>
              <Textarea
                id="client-client-description"
                value={description}
                maxLength={2000}
                rows={3}
                onChange={(event) => setDescription(event.target.value)}
              />
            </Field>
            <Field orientation="horizontal">
              <Checkbox
                id="client-client-active"
                checked={isActive}
                onCheckedChange={(checked) => setIsActive(checked === true)}
              />
              <FieldLabel
                htmlFor="client-client-active"
                className="font-normal"
              >
                {t("clients.fields.isActive")}
              </FieldLabel>
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
            <Button type="submit" disabled={submitting || !name.trim()}>
              {submitting ? <Spinner className="size-4" /> : null}
              {t("common.save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
