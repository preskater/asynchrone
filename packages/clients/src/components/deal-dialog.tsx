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
  ClientContactOptionData,
  ClientDealData,
  ClientFieldDefinitionData,
  ClientMemberOptionData,
  ClientPipelineData,
} from "../types"
import { CLIENT_CURRENCIES } from "../types"
import { useErrorTranslator } from "@workspace/i18n/errors"

import { CustomFieldInputs } from "./custom-fields"

export function DealDialog({
  deal,
  clients,
  contactOptions,
  members,
  pipelines,
  fieldDefinitions,
  defaultClientId,
  trigger,
}: {
  deal?: ClientDealData
  clients: ClientOptionData[]
  contactOptions: ClientContactOptionData[]
  members: ClientMemberOptionData[]
  pipelines: ClientPipelineData[]
  fieldDefinitions: ClientFieldDefinitionData[]
  defaultClientId?: string
  trigger: React.ReactElement
}) {
  const t = useTranslations("Clients")
  const tT = useTranslations("Toasts")
  const te = useErrorTranslator()
  const router = useRouter()
  const { saveDealAction } = useClientActions()

  const definitions = fieldDefinitions.filter((def) => def.entity === "deal")
  const defaultPipelineId =
    deal?.pipelineId ??
    pipelines.find((pipeline) => pipeline.isDefault)?.id ??
    pipelines[0]?.id ??
    ""

  const [open, setOpen] = React.useState(false)
  const [name, setName] = React.useState("")
  const [clientId, setClientId] = React.useState("")
  const [pipelineId, setPipelineId] = React.useState(defaultPipelineId)
  const [stageId, setStageId] = React.useState("")
  const [amount, setAmount] = React.useState("0")
  const [currency, setCurrency] = React.useState<string>("EUR")
  const [probability, setProbability] = React.useState("50")
  const [expectedCloseDate, setExpectedCloseDate] = React.useState("")
  const [source, setSource] = React.useState("")
  const [ownerId, setOwnerId] = React.useState("")
  const [contactIds, setContactIds] = React.useState<string[]>([])
  const [description, setDescription] = React.useState("")
  const [customValues, setCustomValues] = React.useState<
    Record<string, unknown>
  >({})
  const [submitting, setSubmitting] = React.useState(false)

  function stageOptionsFor(nextPipelineId: string) {
    return (
      pipelines.find((pipeline) => pipeline.id === nextPipelineId)?.stages ?? []
    )
  }

  function reset() {
    const nextPipelineId =
      deal?.pipelineId ??
      pipelines.find((pipeline) => pipeline.isDefault)?.id ??
      pipelines[0]?.id ??
      ""
    const stages = stageOptionsFor(nextPipelineId)
    setName(deal?.name ?? "")
    setClientId(deal?.clientId ?? defaultClientId ?? "")
    setPipelineId(nextPipelineId)
    setStageId(deal?.stageId ?? stages[0]?.id ?? "")
    setAmount(String(deal?.amount ?? 0))
    setCurrency(deal?.currency ?? "EUR")
    setProbability(String(deal?.probability ?? 50))
    setExpectedCloseDate(deal?.expectedCloseDate ?? "")
    setSource(deal?.source ?? "")
    setOwnerId(deal?.ownerId ?? "")
    setContactIds(deal?.contacts.map((contact) => contact.contactId) ?? [])
    setDescription(deal?.description ?? "")
    setCustomValues(deal ? { ...deal.customFields } : {})
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!name.trim()) return
    setSubmitting(true)
    try {
      unwrapActionResult(
        await saveDealAction({
          id: deal?.id,
          name: name.trim(),
          clientId: clientId === "" ? null : clientId,
          pipelineId: pipelineId === "" ? null : pipelineId,
          stageId: stageId === "" ? null : stageId,
          amount: amount.trim() === "" ? 0 : Number(amount),
          currency,
          probability: probability.trim() === "" ? 50 : Number(probability),
          expectedCloseDate:
            expectedCloseDate === "" ? null : expectedCloseDate,
          source: source.trim() === "" ? null : source.trim(),
          description: description.trim() === "" ? null : description.trim(),
          ownerId: ownerId === "" ? null : ownerId,
          contactIds,
          customFields: customValues,
        })
      )
      toast.success(tT("dealSaved"))
      setOpen(false)
      router.refresh()
    } catch (error) {
      toast.error(te(error, "internal"))
    } finally {
      setSubmitting(false)
    }
  }

  const clientItems = clients.map((client) => ({
    value: client.id,
    label: client.name,
  }))
  const pipelineItems = pipelines.map((pipeline) => ({
    value: pipeline.id,
    label: pipeline.isDefault
      ? `${pipeline.name} · ${t("pipeline.default")}`
      : pipeline.name,
  }))
  const stageItems = stageOptionsFor(pipelineId).map((stage) => ({
    value: stage.id,
    label: stage.name,
  }))
  const currencyItems = CLIENT_CURRENCIES.map((value) => ({
    value,
    label: value,
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
          <DialogTitle>{deal ? t("deals.edit") : t("deals.new")}</DialogTitle>
        </DialogHeader>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="client-deal-name">
                {t("deals.fields.name")}
              </FieldLabel>
              <Input
                id="client-deal-name"
                value={name}
                required
                maxLength={160}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="client-deal-client">
                  {t("deals.fields.company")}
                </FieldLabel>
                <Select
                  items={clientItems}
                  value={clientId}
                  onValueChange={(value) => setClientId(value ?? "")}
                >
                  <SelectTrigger id="client-deal-client" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {clientItems.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="client-deal-pipeline">
                  {t("deals.fields.pipeline")}
                </FieldLabel>
                <Select
                  items={pipelineItems}
                  value={pipelineId}
                  onValueChange={(value) => {
                    const nextPipelineId = value ?? ""
                    setPipelineId(nextPipelineId)
                    const stages = stageOptionsFor(nextPipelineId)
                    setStageId(stages[0]?.id ?? "")
                  }}
                >
                  <SelectTrigger id="client-deal-pipeline" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {pipelineItems.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="client-deal-stage">
                  {t("deals.fields.stage")}
                </FieldLabel>
                <Select
                  items={stageItems}
                  value={stageId}
                  onValueChange={(value) => setStageId(value ?? "")}
                >
                  <SelectTrigger id="client-deal-stage" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {stageItems.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field>
                  <FieldLabel htmlFor="client-deal-amount">
                    {t("deals.fields.amount")}
                  </FieldLabel>
                  <Input
                    id="client-deal-amount"
                    type="number"
                    min={0}
                    step="0.01"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="client-deal-currency">
                    {t("deals.fields.currency")}
                  </FieldLabel>
                  <Select
                    items={currencyItems}
                    value={currency}
                    onValueChange={(value) => setCurrency(value ?? "EUR")}
                  >
                    <SelectTrigger id="client-deal-currency" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {currencyItems.map((item) => (
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
                <FieldLabel htmlFor="client-deal-probability">
                  {t("deals.fields.probability")}
                </FieldLabel>
                <Input
                  id="client-deal-probability"
                  type="number"
                  min={0}
                  max={100}
                  value={probability}
                  onChange={(event) => setProbability(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="client-deal-close">
                  {t("deals.fields.expectedCloseDate")}
                </FieldLabel>
                <Input
                  id="client-deal-close"
                  type="date"
                  value={expectedCloseDate}
                  onChange={(event) => setExpectedCloseDate(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="client-deal-source">
                  {t("deals.fields.source")}
                </FieldLabel>
                <Input
                  id="client-deal-source"
                  value={source}
                  maxLength={120}
                  onChange={(event) => setSource(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="client-deal-owner">
                  {t("deals.fields.owner")}
                </FieldLabel>
                <Select
                  items={ownerItems}
                  value={ownerId}
                  onValueChange={(value) => setOwnerId(value ?? "")}
                >
                  <SelectTrigger id="client-deal-owner" className="w-full">
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
              <FieldLabel>{t("deals.fields.contacts")}</FieldLabel>
              {contactOptions.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("contacts.emptyAll")}
                </p>
              ) : (
                <div className="flex max-h-40 flex-col gap-2 overflow-y-auto rounded-md border p-3">
                  {contactOptions.map((contact) => (
                    <label
                      key={contact.id}
                      className="flex items-center gap-2 text-sm"
                    >
                      <Checkbox
                        checked={contactIds.includes(contact.id)}
                        onCheckedChange={(checked) =>
                          setContactIds((prev) =>
                            checked === true
                              ? [...prev, contact.id]
                              : prev.filter((id) => id !== contact.id)
                          )
                        }
                      />
                      <span>{contact.name}</span>
                      {contact.email ? (
                        <span className="text-xs text-muted-foreground">
                          {contact.email}
                        </span>
                      ) : null}
                    </label>
                  ))}
                </div>
              )}
            </Field>

            <Field>
              <FieldLabel htmlFor="client-deal-description">
                {t("deals.fields.description")}
              </FieldLabel>
              <Textarea
                id="client-deal-description"
                value={description}
                maxLength={2000}
                rows={3}
                onChange={(event) => setDescription(event.target.value)}
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
