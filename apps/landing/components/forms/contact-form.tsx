"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { Textarea } from "@workspace/ui/components/textarea"

export function ContactForm() {
  const t = useTranslations("Forms.contact")

  const schema = React.useMemo(
    () =>
      z.object({
        name: z.string().min(1, t("nameRequired")),
        email: z.email(t("emailInvalid")),
        company: z.string().optional(),
        message: z.string().min(10, t("messageRequired")),
      }),
    [t]
  )

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", email: "", company: "", message: "" },
  })

  function onSubmit(values: z.infer<typeof schema>) {
    toast.success(t("successTitle"), {
      description: t("successDescription", { email: values.email }),
    })
    form.reset()
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      <FieldGroup>
        <div className="grid gap-4 sm:grid-cols-2">
          <Controller
            name="name"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="contact-name">{t("name")}</FieldLabel>
                <Input
                  {...field}
                  id="contact-name"
                  aria-invalid={fieldState.invalid}
                  aria-describedby={
                    fieldState.invalid ? "contact-name-error" : undefined
                  }
                  placeholder={t("namePlaceholder")}
                />
                {fieldState.invalid ? (
                  <FieldError
                    id="contact-name-error"
                    errors={[fieldState.error]}
                  />
                ) : null}
              </Field>
            )}
          />
          <Controller
            name="email"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="contact-email">{t("email")}</FieldLabel>
                <Input
                  {...field}
                  id="contact-email"
                  type="email"
                  aria-invalid={fieldState.invalid}
                  aria-describedby={
                    fieldState.invalid ? "contact-email-error" : undefined
                  }
                  placeholder={t("emailPlaceholder")}
                />
                {fieldState.invalid ? (
                  <FieldError
                    id="contact-email-error"
                    errors={[fieldState.error]}
                  />
                ) : null}
              </Field>
            )}
          />
        </div>
        <Controller
          name="company"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="contact-company">{t("company")}</FieldLabel>
              <Input
                {...field}
                id="contact-company"
                aria-invalid={fieldState.invalid}
                aria-describedby={
                  fieldState.invalid ? "contact-company-error" : undefined
                }
                placeholder={t("companyPlaceholder")}
              />
              {fieldState.invalid ? (
                <FieldError
                  id="contact-company-error"
                  errors={[fieldState.error]}
                />
              ) : null}
            </Field>
          )}
        />
        <Controller
          name="message"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="contact-message">{t("message")}</FieldLabel>
              <Textarea
                {...field}
                id="contact-message"
                aria-invalid={fieldState.invalid}
                aria-describedby={
                  fieldState.invalid ? "contact-message-error" : undefined
                }
                placeholder={t("messagePlaceholder")}
              />
              <FieldDescription>{t("hint")}</FieldDescription>
              {fieldState.invalid ? (
                <FieldError
                  id="contact-message-error"
                  errors={[fieldState.error]}
                />
              ) : null}
            </Field>
          )}
        />
      </FieldGroup>
      <Button type="submit" size="lg" className="mt-6 w-full sm:w-auto">
        {t("submit")}
      </Button>
    </form>
  )
}
