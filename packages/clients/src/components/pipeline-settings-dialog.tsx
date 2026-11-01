"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@workspace/ui/components/dialog"
import { Field, FieldGroup, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { Separator } from "@workspace/ui/components/separator"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Spinner } from "@workspace/ui/components/spinner"

import { useClientActions } from "./actions"
import { useRouter } from "@workspace/i18n/navigation"
import { unwrapActionResult, type ActionResult } from "@workspace/core/action"
import type { ClientPipelineData, PipelineStageType } from "../types"
import { PIPELINE_STAGE_TYPES } from "../types"
import { useErrorTranslator } from "@workspace/i18n/errors"
import { useEnumLabel } from "@workspace/i18n/labels"

const STAGE_TYPE_VARIANTS: Record<
  PipelineStageType,
  "outline" | "default" | "destructive"
> = {
  open: "outline",
  won: "default",
  lost: "destructive",
}

export function PipelineSettingsDialog({
  pipelines,
  trigger,
}: {
  pipelines: ClientPipelineData[]
  trigger: React.ReactElement
}) {
  const t = useTranslations("Clients")
  const tT = useTranslations("Toasts")
  const te = useErrorTranslator()
  const L = useEnumLabel()
  const router = useRouter()
  const {
    savePipelineAction,
    setDefaultPipelineAction,
    deletePipelineAction,
    saveStageAction,
    moveStageAction,
    deleteStageAction,
  } = useClientActions()

  const [open, setOpen] = React.useState(false)
  const [pipelineId, setPipelineId] = React.useState(
    pipelines.find((pipeline) => pipeline.isDefault)?.id ??
      pipelines[0]?.id ??
      ""
  )
  const [newPipelineName, setNewPipelineName] = React.useState("")
  const [editingStageId, setEditingStageId] = React.useState<string | null>(
    null
  )
  const [stageName, setStageName] = React.useState("")
  const [stageType, setStageType] = React.useState<PipelineStageType>("open")
  const [stageFormOpen, setStageFormOpen] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  const pipeline =
    pipelines.find((item) => item.id === pipelineId) ?? pipelines[0] ?? null

  function closeStageForm() {
    setEditingStageId(null)
    setStageName("")
    setStageType("open")
    setStageFormOpen(false)
  }

  function reset() {
    closeStageForm()
    setNewPipelineName("")
  }

  async function run(promise: Promise<ActionResult<unknown>>, success: string) {
    setBusy(true)
    try {
      unwrapActionResult(await promise)
      toast.success(success)
      router.refresh()
    } catch (error) {
      toast.error(te(error, "internal"))
    } finally {
      setBusy(false)
    }
  }

  function startAddStage() {
    setEditingStageId(null)
    setStageName("")
    setStageType("open")
    setStageFormOpen(true)
  }

  function startEditStage(stageId: string, name: string, type: string) {
    setEditingStageId(stageId)
    setStageName(name)
    setStageType(type as PipelineStageType)
    setStageFormOpen(true)
  }

  async function submitStage(event: React.FormEvent) {
    event.preventDefault()
    if (!pipeline || !stageName.trim()) return
    await run(
      saveStageAction({
        id: editingStageId ?? undefined,
        pipelineId: pipeline.id,
        name: stageName.trim(),
        type: stageType,
      }),
      tT("pipelineSaved")
    )
    closeStageForm()
  }

  const stageTypeItems = PIPELINE_STAGE_TYPES.map((value) => ({
    value,
    label: L.pipelineStageType(value),
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
          <DialogTitle>{t("pipeline.title")}</DialogTitle>
          <DialogDescription>{t("pipeline.description")}</DialogDescription>
        </DialogHeader>

        {pipelines.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("pipeline.empty")}</p>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <Select
                items={pipelines.map((item) => ({
                  value: item.id,
                  label: item.isDefault
                    ? `${item.name} · ${t("pipeline.default")}`
                    : item.name,
                }))}
                value={pipeline?.id ?? ""}
                onValueChange={(value) => {
                  setPipelineId(value ?? "")
                  closeStageForm()
                }}
              >
                <SelectTrigger className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {pipelines.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.name}
                        {item.isDefault ? ` · ${t("pipeline.default")}` : ""}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              {pipeline && !pipeline.isDefault ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void run(
                      setDefaultPipelineAction({ pipelineId: pipeline.id }),
                      tT("pipelineSaved")
                    )
                  }
                >
                  <CheckIcon data-icon="inline-start" />
                  {t("pipeline.makeDefault")}
                </Button>
              ) : (
                <Badge variant="secondary">{t("pipeline.default")}</Badge>
              )}
              {pipeline ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() =>
                    void run(
                      deletePipelineAction(pipeline.id),
                      tT("pipelineSaved")
                    )
                  }
                >
                  <TrashIcon data-icon="inline-start" />
                  {t("pipeline.deletePipeline")}
                </Button>
              ) : null}
            </div>

            {pipeline ? (
              <div className="flex flex-col gap-2">
                {pipeline.stages.map((stage, index) => (
                  <div
                    key={stage.id}
                    className="flex items-center gap-2 rounded-md border px-3 py-2"
                  >
                    <span className="flex-1 text-sm font-medium">
                      {stage.name}
                    </span>
                    <Badge variant={STAGE_TYPE_VARIANTS[stage.type]}>
                      {L.pipelineStageType(stage.type)}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {stage.dealCount}
                    </span>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      disabled={busy || index === 0}
                      aria-label={t("pipeline.moveUp")}
                      onClick={() =>
                        void run(
                          moveStageAction({
                            pipelineId: pipeline.id,
                            stageId: stage.id,
                            direction: "up",
                          }),
                          tT("pipelineSaved")
                        )
                      }
                    >
                      <ArrowUpIcon className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      disabled={busy || index === pipeline.stages.length - 1}
                      aria-label={t("pipeline.moveDown")}
                      onClick={() =>
                        void run(
                          moveStageAction({
                            pipelineId: pipeline.id,
                            stageId: stage.id,
                            direction: "down",
                          }),
                          tT("pipelineSaved")
                        )
                      }
                    >
                      <ArrowDownIcon className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={t("pipeline.editStage")}
                      onClick={() =>
                        startEditStage(stage.id, stage.name, stage.type)
                      }
                    >
                      <PencilIcon className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      disabled={busy}
                      aria-label={t("pipeline.deleteStage")}
                      onClick={() =>
                        void run(
                          deleteStageAction(stage.id),
                          tT("pipelineSaved")
                        )
                      }
                    >
                      <TrashIcon className="size-4" />
                    </Button>
                  </div>
                ))}

                {stageFormOpen ? (
                  <form
                    className="flex flex-col gap-3 rounded-md border border-dashed p-3"
                    onSubmit={submitStage}
                  >
                    <FieldGroup>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field>
                          <FieldLabel htmlFor="client-stage-name">
                            {t("pipeline.stageName")}
                          </FieldLabel>
                          <Input
                            id="client-stage-name"
                            value={stageName}
                            required
                            maxLength={80}
                            onChange={(event) =>
                              setStageName(event.target.value)
                            }
                          />
                        </Field>
                        <Field>
                          <FieldLabel htmlFor="client-stage-type">
                            {t("pipeline.stageType")}
                          </FieldLabel>
                          <Select
                            items={stageTypeItems}
                            value={stageType}
                            onValueChange={(value) =>
                              setStageType(
                                (value ?? "open") as PipelineStageType
                              )
                            }
                          >
                            <SelectTrigger
                              id="client-stage-type"
                              className="w-full"
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectGroup>
                                {stageTypeItems.map((item) => (
                                  <SelectItem
                                    key={item.value}
                                    value={item.value}
                                  >
                                    {item.label}
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                            </SelectContent>
                          </Select>
                        </Field>
                      </div>
                    </FieldGroup>
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={closeStageForm}
                      >
                        {t("common.cancel")}
                      </Button>
                      <Button
                        type="submit"
                        size="sm"
                        disabled={busy || !stageName.trim()}
                      >
                        {busy ? <Spinner className="size-4" /> : null}
                        {editingStageId ? t("common.save") : t("common.create")}
                      </Button>
                    </div>
                  </form>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="self-start"
                    onClick={startAddStage}
                  >
                    <PlusIcon data-icon="inline-start" />
                    {t("pipeline.addStage")}
                  </Button>
                )}
              </div>
            ) : null}

            <Separator />

            <form
              className="flex items-end gap-2"
              onSubmit={(event) => {
                event.preventDefault()
                if (!newPipelineName.trim()) return
                void run(
                  savePipelineAction({
                    name: newPipelineName.trim(),
                    makeDefault: pipelines.length === 0,
                  }),
                  tT("pipelineSaved")
                ).then(() => setNewPipelineName(""))
              }}
            >
              <Field className="flex-1">
                <FieldLabel htmlFor="client-pipeline-name">
                  {t("pipeline.newTitle")}
                </FieldLabel>
                <Input
                  id="client-pipeline-name"
                  value={newPipelineName}
                  maxLength={80}
                  onChange={(event) => setNewPipelineName(event.target.value)}
                />
              </Field>
              <Button
                type="submit"
                variant="outline"
                disabled={busy || !newPipelineName.trim()}
              >
                <PlusIcon data-icon="inline-start" />
                {t("common.create")}
              </Button>
            </form>
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => setOpen(false)}
          >
            {t("common.cancel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
