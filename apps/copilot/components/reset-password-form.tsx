"use client"

import { useSearchParams } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslations } from "next-intl"
import { Controller, useForm } from "react-hook-form"
import { toast } from "sonner"
import * as z from "zod"

import { Link, useRouter } from "@workspace/i18n/navigation"
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

import {
  MIN_PASSWORD_LENGTH,
  PASSWORD_COMPROMISED,
} from "@workspace/auth/password-policy"
import { authClient } from "@/lib/auth-client"

export function ResetPasswordForm({
  ...props
}: React.ComponentProps<typeof Card>) {
  const t = useTranslations("Auth.resetPassword")
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get("token")
  const invalidToken = !token || searchParams.get("error") === "INVALID_TOKEN"

  const formSchema = z
    .object({
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
    defaultValues: { password: "", confirmPassword: "" },
  })

  async function onSubmit(data: z.infer<typeof formSchema>) {
    if (!token) return

    const { error } = await authClient.resetPassword({
      newPassword: data.password,
      token,
    })

    if (error) {
      form.setError("root", {
        message:
          error.code === PASSWORD_COMPROMISED
            ? t("passwordCompromised")
            : error.status === 400
              ? t("invalidLink")
              : (error.message ?? t("genericError")),
      })
      return
    }

    toast.success(t("success"))
    router.push("/sign-in")
  }

  if (invalidToken) {
    return (
      <Card {...props}>
        <CardHeader>
          <CardTitle>{t("invalidLink")}</CardTitle>
          <CardDescription>{t("invalidLinkDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button render={<Link href="/forgot-password" />}>
            {t("requestNewLink")}
          </Button>
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
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? t("submitting") : t("submit")}
              </Button>
              {form.formState.errors.root && (
                <FieldError errors={[form.formState.errors.root]} />
              )}
            </Field>
          </FieldGroup>
        </form>
      </CardContent>
    </Card>
  )
}
