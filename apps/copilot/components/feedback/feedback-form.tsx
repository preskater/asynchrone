"use client"

import * as React from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  ImageIcon,
  MessageSquareHeartIcon,
  SendIcon,
  XIcon,
} from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { Controller, useForm } from "react-hook-form"
import { toast } from "sonner"
import * as z from "zod"

import { submitFeedbackAction } from "@/actions/feedback"
import { usePathname } from "@workspace/i18n/navigation"
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
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
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

import { unwrapActionResult } from "@workspace/core/action"
import {
  FEEDBACK_ATTACHMENT_TYPES,
  FEEDBACK_CATEGORIES,
  FEEDBACK_FIELDS_BY_CATEGORY,
  FEEDBACK_FREQUENCIES,
  FEEDBACK_IMPACTS,
  MAX_FEEDBACK_ATTACHMENT_BYTES,
  type FeedbackAttachment,
  type FeedbackFieldId,
} from "@/lib/feedback/types"
import { useErrorTranslator } from "@workspace/i18n/errors"
import { useEnumLabel } from "@workspace/i18n/labels"

function formatBytes(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.ceil(bytes / 1024)} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Strips the `data:image/…;base64,` prefix the FileReader returns. */
async function readAsBase64(file: File) {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ""))
    reader.onerror = () =>
      reject(reader.error ?? new Error("Unable to read the file"))
    reader.readAsDataURL(file)
  })
  return dataUrl.slice(dataUrl.indexOf(",") + 1)
}

/**
 * In-app feedback form. Everything a tester types is validated server-side
 * too; the screenshot travels as base64 and is attached to the email.
 */
export function FeedbackForm({ initialEmail }: { initialEmail: string }) {
  const t = useTranslations("Feedback")
  const L = useEnumLabel()
  const te = useErrorTranslator()
  const locale = useLocale()
  const pathname = usePathname()

  const schema = React.useMemo(
    () =>
      z.object({
        category: z.enum(FEEDBACK_CATEGORIES),
        impact: z.enum(FEEDBACK_IMPACTS),
        title: z
          .string()
          .trim()
          .min(3, t("titleRequired"))
          .max(160, t("titleTooLong")),
        description: z
          .string()
          .trim()
          .min(10, t("descriptionRequired"))
          .max(5000, t("descriptionTooLong")),
        frequency: z.enum(FEEDBACK_FREQUENCIES),
        steps: z.string().max(5000, t("textTooLong")),
        expected: z.string().max(5000, t("textTooLong")),
        problem: z.string().max(2000, t("textTooLong")),
        benefit: z.string().max(2000, t("textTooLong")),
        suggestion: z.string().max(2000, t("textTooLong")),
        page: z.string().max(500, t("textTooLong")),
        contactEmail: z.email(t("emailInvalid")),
        allowContact: z.boolean(),
      }),
    [t]
  )

  const emptyValues = React.useMemo(
    () => ({
      category: "bug" as const,
      impact: "medium" as const,
      title: "",
      description: "",
      frequency: "unknown" as const,
      steps: "",
      expected: "",
      problem: "",
      benefit: "",
      suggestion: "",
      page: pathname,
      contactEmail: initialEmail,
      allowContact: true,
    }),
    [initialEmail, pathname]
  )

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: emptyValues,
  })

  const [attachment, setAttachment] = React.useState<File | null>(null)
  const [attachmentError, setAttachmentError] = React.useState<string>()
  const [submitting, setSubmitting] = React.useState(false)

  const category = form.watch("category")
  const categoryFields: readonly FeedbackFieldId[] =
    FEEDBACK_FIELDS_BY_CATEGORY[category]

  // Category-specific copy lives under `Feedback.fields.<category>`; the
  // optional parts (placeholder/hint) are probed with `t.has`.
  function categoryText(key: string) {
    return t(`fields.${category}.${key}` as never)
  }
  function categoryTextOrNull(key: string) {
    return t.has(`fields.${category}.${key}` as never)
      ? categoryText(key)
      : undefined
  }

  const categoryItems = FEEDBACK_CATEGORIES.map((value) => ({
    value,
    label: L.feedbackCategory(value),
  }))
  const impactItems = FEEDBACK_IMPACTS.map((value) => ({
    value,
    label: L.feedbackImpact(value),
  }))
  const frequencyItems = FEEDBACK_FREQUENCIES.map((value) => ({
    value,
    label: L.feedbackFrequency(value),
  }))

  function selectAttachment(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    // Allow picking the same file again after removing it.
    event.target.value = ""
    if (!file) return

    if (
      !FEEDBACK_ATTACHMENT_TYPES.includes(
        file.type as (typeof FEEDBACK_ATTACHMENT_TYPES)[number]
      )
    ) {
      setAttachmentError(t("screenshotInvalidType"))
      return
    }
    if (file.size > MAX_FEEDBACK_ATTACHMENT_BYTES) {
      setAttachmentError(t("screenshotTooLarge"))
      return
    }

    setAttachmentError(undefined)
    setAttachment(file)
  }

  async function onSubmit(values: z.infer<typeof schema>) {
    setSubmitting(true)
    try {
      let uploaded: FeedbackAttachment | undefined
      if (attachment) {
        uploaded = {
          filename: attachment.name,
          contentType: attachment.type as FeedbackAttachment["contentType"],
          data: await readAsBase64(attachment),
        }
      }

      const result = unwrapActionResult(
        await submitFeedbackAction({
          category: values.category,
          impact: values.impact,
          title: values.title,
          description: values.description,
          frequency: values.frequency,
          steps: values.steps,
          expected: values.expected,
          problem: values.problem,
          benefit: values.benefit,
          suggestion: values.suggestion,
          page: values.page.trim() || undefined,
          contactEmail: values.contactEmail,
          allowContact: values.allowContact,
          context: {
            locale,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? "",
            viewport: `${window.innerWidth}×${window.innerHeight}`,
            userAgent: navigator.userAgent.slice(0, 500),
          },
          attachment: uploaded,
        })
      )

      toast.success(t("successTitle"), {
        description: result.delivered
          ? t("successDescription")
          : t("successNotDelivered"),
      })
      form.reset(emptyValues)
      setAttachment(null)
    } catch (error) {
      toast.error(te(error))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquareHeartIcon className="size-4" />
          {t("formTitle")}
        </CardTitle>
        <CardDescription>{t("formDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <Controller
                name="category"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="feedback-category">
                      {t("category")}
                    </FieldLabel>
                    <Select
                      items={categoryItems}
                      value={field.value}
                      onValueChange={(value) =>
                        field.onChange(value ?? field.value)
                      }
                    >
                      <SelectTrigger
                        id="feedback-category"
                        className="w-full"
                        aria-invalid={fieldState.invalid}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {categoryItems.map((item) => (
                            <SelectItem key={item.value} value={item.value}>
                              {item.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    <FieldDescription>{t("categoryHint")}</FieldDescription>
                  </Field>
                )}
              />
              <Controller
                name="impact"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="feedback-impact">
                      {t("impact")}
                    </FieldLabel>
                    <Select
                      items={impactItems}
                      value={field.value}
                      onValueChange={(value) =>
                        field.onChange(value ?? field.value)
                      }
                    >
                      <SelectTrigger
                        id="feedback-impact"
                        className="w-full"
                        aria-invalid={fieldState.invalid}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {impactItems.map((item) => (
                            <SelectItem key={item.value} value={item.value}>
                              {item.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    <FieldDescription>
                      {categoryText("impactHint")}
                    </FieldDescription>
                  </Field>
                )}
              />
            </div>

            <Controller
              name="title"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="feedback-title">
                    {t("titleLabel")}
                  </FieldLabel>
                  <Input
                    {...field}
                    id="feedback-title"
                    maxLength={160}
                    aria-invalid={fieldState.invalid}
                    placeholder={categoryTextOrNull("titlePlaceholder")}
                  />
                  {fieldState.invalid ? (
                    <FieldError errors={[fieldState.error]} />
                  ) : null}
                </Field>
              )}
            />

            <Controller
              name="description"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor="feedback-description">
                    {categoryText("descriptionLabel")}
                  </FieldLabel>
                  <Textarea
                    {...field}
                    id="feedback-description"
                    rows={5}
                    maxLength={5000}
                    aria-invalid={fieldState.invalid}
                    placeholder={categoryTextOrNull("descriptionPlaceholder")}
                  />
                  {fieldState.invalid ? (
                    <FieldError errors={[fieldState.error]} />
                  ) : null}
                </Field>
              )}
            />

            {categoryFields.map((fieldId) => (
              <Controller
                key={fieldId}
                name={fieldId}
                control={form.control}
                render={({ field, fieldState }) => {
                  const id = `feedback-${fieldId}`
                  const label = categoryText(`${fieldId}Label`)
                  const hint = categoryTextOrNull(`${fieldId}Hint`)
                  const placeholder = categoryTextOrNull(
                    `${fieldId}Placeholder`
                  )

                  if (fieldId === "frequency") {
                    return (
                      <Field data-invalid={fieldState.invalid}>
                        <FieldLabel htmlFor={id}>{label}</FieldLabel>
                        <Select
                          items={frequencyItems}
                          value={field.value as string}
                          onValueChange={(value) =>
                            field.onChange(value ?? "unknown")
                          }
                        >
                          <SelectTrigger
                            id={id}
                            className="w-full"
                            aria-invalid={fieldState.invalid}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              {frequencyItems.map((item) => (
                                <SelectItem key={item.value} value={item.value}>
                                  {item.label}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                        {hint ? (
                          <FieldDescription>{hint}</FieldDescription>
                        ) : null}
                      </Field>
                    )
                  }

                  return (
                    <Field data-invalid={fieldState.invalid}>
                      <FieldLabel htmlFor={id}>{label}</FieldLabel>
                      <Textarea
                        {...field}
                        id={id}
                        rows={fieldId === "steps" ? 4 : 3}
                        maxLength={
                          fieldId === "steps" || fieldId === "expected"
                            ? 5000
                            : 2000
                        }
                        aria-invalid={fieldState.invalid}
                        placeholder={placeholder}
                      />
                      {hint ? (
                        <FieldDescription>{hint}</FieldDescription>
                      ) : null}
                      {fieldState.invalid ? (
                        <FieldError errors={[fieldState.error]} />
                      ) : null}
                    </Field>
                  )
                }}
              />
            ))}

            <div className="grid gap-4 sm:grid-cols-2">
              <Controller
                name="page"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="feedback-page">
                      {t("pageLabel")}
                    </FieldLabel>
                    <Input
                      {...field}
                      id="feedback-page"
                      maxLength={500}
                      aria-invalid={fieldState.invalid}
                      placeholder={t("pagePlaceholder")}
                    />
                    <FieldDescription>{t("pageHint")}</FieldDescription>
                    {fieldState.invalid ? (
                      <FieldError errors={[fieldState.error]} />
                    ) : null}
                  </Field>
                )}
              />
              <Controller
                name="contactEmail"
                control={form.control}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel htmlFor="feedback-contact-email">
                      {t("contactEmailLabel")}
                    </FieldLabel>
                    <Input
                      {...field}
                      id="feedback-contact-email"
                      type="email"
                      autoComplete="email"
                      aria-invalid={fieldState.invalid}
                      placeholder={t("contactEmailPlaceholder")}
                    />
                    {fieldState.invalid ? (
                      <FieldError errors={[fieldState.error]} />
                    ) : (
                      <FieldDescription>
                        {t("contactEmailHint")}
                      </FieldDescription>
                    )}
                  </Field>
                )}
              />
            </div>

            <Controller
              name="allowContact"
              control={form.control}
              render={({ field }) => (
                <Field orientation="horizontal">
                  <Checkbox
                    id="feedback-allow-contact"
                    checked={field.value}
                    onCheckedChange={(checked) =>
                      field.onChange(checked === true)
                    }
                  />
                  <div className="flex flex-col gap-1">
                    <FieldLabel
                      htmlFor="feedback-allow-contact"
                      className="font-normal"
                    >
                      {t("allowContactLabel")}
                    </FieldLabel>
                    <FieldDescription>{t("allowContactHint")}</FieldDescription>
                  </div>
                </Field>
              )}
            />

            <Field data-invalid={Boolean(attachmentError)}>
              <FieldLabel htmlFor="feedback-screenshot">
                {t("screenshotLabel")}
              </FieldLabel>
              {attachment ? (
                <div className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
                  <span className="flex min-w-0 items-center gap-2 text-sm">
                    <ImageIcon className="size-4 shrink-0 text-muted-foreground" />
                    <span className="truncate">{attachment.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {formatBytes(attachment.size)}
                    </span>
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setAttachment(null)}
                  >
                    <XIcon />
                    {t("screenshotRemove")}
                  </Button>
                </div>
              ) : (
                <Input
                  id="feedback-screenshot"
                  type="file"
                  accept={FEEDBACK_ATTACHMENT_TYPES.join(",")}
                  aria-invalid={Boolean(attachmentError)}
                  onChange={selectAttachment}
                  className="cursor-pointer file:cursor-pointer"
                />
              )}
              <FieldDescription>{t("screenshotHint")}</FieldDescription>
              {attachmentError ? (
                <FieldError>{attachmentError}</FieldError>
              ) : null}
            </Field>
          </FieldGroup>

          <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">{t("privacyNote")}</p>
            <Button type="submit" disabled={submitting}>
              {submitting ? (
                <>
                  <Spinner />
                  {t("submitting")}
                </>
              ) : (
                <>
                  <SendIcon />
                  {t("submit")}
                </>
              )}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
