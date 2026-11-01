"use client"

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslations } from "next-intl"
import { Controller, useForm } from "react-hook-form"
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
import {
  MIN_PASSWORD_LENGTH,
  PASSWORD_COMPROMISED,
} from "@workspace/auth/password-policy"
import { authClient } from "@/lib/auth-client"
import { safeRedirect } from "@workspace/core/redirect"

export function SignUpForm({
  captchaSiteKey,
  ...props
}: React.ComponentProps<typeof Card> & { captchaSiteKey?: string }) {
  const t = useTranslations("Auth.signUp")
  const router = useRouter()
  const searchParams = useSearchParams()
  const [awaitingVerification, setAwaitingVerification] = useState(false)
  const [captchaToken, setCaptchaToken] = useState<string | null>(null)
  const [captchaAttempt, setCaptchaAttempt] = useState(0)
  const [captchaUnavailable, setCaptchaUnavailable] = useState(false)

  const formSchema = z
    .object({
      name: z.string().min(1, t("nameRequired")),
      email: z.email(t("invalidEmail")),
      password: z
        .string()
        .min(
          MIN_PASSWORD_LENGTH,
          t("passwordLength", { min: MIN_PASSWORD_LENGTH })
        ),
      confirmPassword: z.string(),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: t("passwordsMismatch"),
      path: ["confirmPassword"],
    })

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  })

  async function onSubmit(data: z.infer<typeof formSchema>) {
    const { data: result, error } = await authClient.signUp.email({
      name: data.name,
      email: data.email,
      password: data.password,
      fetchOptions: captchaToken
        ? { headers: { "x-captcha-response": captchaToken } }
        : undefined,
    })

    if (error) {
      // The token is spent either way; fetch a fresh one for the retry.
      setCaptchaToken(null)
      setCaptchaAttempt((n) => n + 1)
      form.setError("root", {
        message:
          error.code === PASSWORD_COMPROMISED
            ? t("passwordCompromised")
            : (error.message ?? t("genericError")),
      })
      return
    }

    // No session token means `requireEmailVerification` is on: the account
    // exists but the user must click the link sent to their inbox first.
    if (result?.token === null) {
      setAwaitingVerification(true)
      return
    }

    const redirectTo = safeRedirect(searchParams.get("redirect"))
    router.push(redirectTo)
    router.refresh()
  }

  if (awaitingVerification) {
    return (
      <Card {...props}>
        <CardHeader>
          <CardTitle>{t("checkEmailTitle")}</CardTitle>
          <CardDescription>{t("checkEmailDescription")}</CardDescription>
        </CardHeader>
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
              name="name"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={field.name}>{t("name")}</FieldLabel>
                  <Input
                    {...field}
                    id={field.name}
                    type="text"
                    placeholder={t("namePlaceholder")}
                    autoComplete="name"
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
                  <FieldDescription>{t("emailHint")}</FieldDescription>
                  {fieldState.invalid && (
                    <FieldError
                      id={`${field.name}-error`}
                      errors={[fieldState.error]}
                    />
                  )}
                </Field>
              )}
            />
            <Controller
              name="password"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={field.name}>{t("password")}</FieldLabel>
                  <Input
                    {...field}
                    id={field.name}
                    type="password"
                    autoComplete="new-password"
                    aria-invalid={fieldState.invalid}
                    aria-describedby={
                      fieldState.invalid ? `${field.name}-error` : undefined
                    }
                  />
                  <FieldDescription>
                    {t("passwordHint", { min: MIN_PASSWORD_LENGTH })}
                  </FieldDescription>
                  {fieldState.invalid && (
                    <FieldError
                      id={`${field.name}-error`}
                      errors={[fieldState.error]}
                    />
                  )}
                </Field>
              )}
            />
            <Controller
              name="confirmPassword"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={field.name}>
                    {t("confirmPassword")}
                  </FieldLabel>
                  <Input
                    {...field}
                    id={field.name}
                    type="password"
                    autoComplete="new-password"
                    aria-invalid={fieldState.invalid}
                    aria-describedby={
                      fieldState.invalid ? `${field.name}-error` : undefined
                    }
                  />
                  <FieldDescription>{t("confirmHint")}</FieldDescription>
                  {fieldState.invalid && (
                    <FieldError
                      id={`${field.name}-error`}
                      errors={[fieldState.error]}
                    />
                  )}
                </Field>
              )}
            />
            <FieldGroup>
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
                {form.formState.errors.root && (
                  <FieldError errors={[form.formState.errors.root]} />
                )}
                <FieldDescription className="px-6 text-center">
                  {t("hasAccount")}{" "}
                  <Link
                    href={
                      searchParams.get("redirect")
                        ? `/sign-in?redirect=${encodeURIComponent(
                            searchParams.get("redirect") as string
                          )}`
                        : "/sign-in"
                    }
                  >
                    {t("signInLink")}
                  </Link>
                </FieldDescription>
              </Field>
            </FieldGroup>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}
