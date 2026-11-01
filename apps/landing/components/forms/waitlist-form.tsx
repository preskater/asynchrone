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
  InputGroupInput,
} from "@workspace/ui/components/input-group"
import { toast } from "sonner"

export function WaitlistForm() {
  const t = useTranslations("Forms.waitlist")

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
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      className="mx-auto w-full max-w-md"
    >
      <Controller
        name="email"
        control={form.control}
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid}>
            <div className="flex flex-col gap-2 sm:flex-row">
              <InputGroup className="h-10 flex-1">
                <InputGroupInput
                  {...field}
                  type="email"
                  aria-invalid={fieldState.invalid}
                  placeholder={t("placeholder")}
                />
              </InputGroup>
              <Button type="submit" size="lg">
                {t("submit")}
              </Button>
            </div>
            {fieldState.invalid ? (
              <FieldError errors={[fieldState.error]} />
            ) : null}
          </Field>
        )}
      />
    </form>
  )
}
