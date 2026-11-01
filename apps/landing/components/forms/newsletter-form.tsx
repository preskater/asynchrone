"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"

import { Button } from "@workspace/ui/components/button"
import { Field, FieldError } from "@workspace/ui/components/field"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@workspace/ui/components/input-group"
import { MailIcon } from "lucide-react"
import { toast } from "sonner"

export function NewsletterForm() {
  const t = useTranslations("Forms.newsletter")

  const schema = React.useMemo(
    () => z.object({ email: z.email(t("emailInvalid")) }),
    [t]
  )

  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { email: "" },
  })

  function onSubmit(values: z.infer<typeof schema>) {
    toast.success(t("successTitle"), {
      description: t("successDescription", { email: values.email }),
    })
    form.reset()
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)}>
      <Controller
        name="email"
        control={form.control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <InputGroup>
              <InputGroupInput
                {...field}
                type="email"
                aria-invalid={fieldState.invalid}
                placeholder={t("placeholder")}
              />
              <InputGroupAddon>
                <MailIcon />
              </InputGroupAddon>
              <Button type="submit" size="sm" className="me-1">
                {t("submit")}
              </Button>
            </InputGroup>
            {fieldState.invalid ? (
              <FieldError errors={[fieldState.error]} />
            ) : null}
          </Field>
        )}
      />
    </form>
  )
}
