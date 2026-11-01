"use client"

import { useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useLocale, useTranslations } from "next-intl"
import { Controller, useForm } from "react-hook-form"
import { toast } from "sonner"
import * as z from "zod"

import { Link } from "@workspace/i18n/navigation"
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
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"

import { Turnstile } from "@/components/turnstile"
import { authClient } from "@/lib/auth-client"

export function ForgotPasswordForm({
  captchaSiteKey,
  ...props
}: React.ComponentProps<typeof Card> & { captchaSiteKey?: string }) {
  const t = useTranslations("Auth.forgotPassword")
  const locale = useLocale()
  const [sent, setSent] = useState(false)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [captchaAttempt, setCaptchaAttempt] = useState(0)
  const [captchaUnavailable, setCaptchaUnavailable] = useState(false)

  const formSchema = z.object({
    email: z.email(t("invalidEmail")),
  })

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: "" },
  })

  async function onSubmit(data: z.infer<typeof formSchema>) {
    const { error } = await authClient.requestPasswordReset({
      email: data.email,
      redirectTo: `${window.location.origin}/${locale}/reset-password`,
      fetchOptions: captchaToken
        ? { headers: { "x-captcha-response": captchaToken } }
        : undefined,
    })

    if (error) {
      // The token is spent either way; fetch a fresh one for the retry.
      setCaptchaToken(null)
      setCaptchaAttempt((n) => n + 1)
      toast.error(error.message ?? t("genericError"))
      return
    }

    // Better Auth answers identically for unknown addresses, so the message
    // never reveals whether an account exists.
    setSent(true)
  }

  if (sent) {
    return (
      <Card {...props}>
        <CardHeader>
          <CardTitle>{t("successTitle")}</CardTitle>
          <CardDescription>{t("success")}</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldDescription className="text-center">
            <Link href="/sign-in">{t("backToSignIn")}</Link>
          </FieldDescription>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card {...props}>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <FieldGroup>
            <Controller
              name="email"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={field.name}>{t("email")}</FieldLabel>
                  <Input
                    {...field}
                    id={field.name}
                    type="email"
                    placeholder="m@example.com"
                    autoComplete="email"
                    aria-invalid={fieldState.invalid}
                    aria-describedby={
                      fieldState.invalid ? `${field.name}-error` : undefined
                    }
                  />
                  {fieldState.invalid && (
                    <FieldError
                      id={`${field.name}-error`}
                      errors={[fieldState.error]}
                    />
                  )}
                </Field>
              )}
            />
            <Field>
              {captchaSiteKey && (
                <Turnstile
                  key={captchaAttempt}
                  siteKey={captchaSiteKey}
                  onToken={(token) => {
                    setCaptchaToken(token)
                    if (token) setCaptchaUnavailable(false)
                  }}
                  onUnavailable={() => setCaptchaUnavailable(true)}
                />
              )}
              {captchaUnavailable && (
                <p role="alert" className="text-xs text-destructive">
                  {t("captchaUnavailable")}
                </p>
              )}
              <Button
                type="submit"
                disabled={
                  form.formState.isSubmitting ||
                  (Boolean(captchaSiteKey) && !captchaToken)
                }
              >
                {form.formState.isSubmitting ? t("submitting") : t("submit")}
              </Button>
              <FieldDescription className="text-center">
                <Link href="/sign-in">{t("backToSignIn")}</Link>
              </FieldDescription>
            </Field>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}
