"use client"

import { useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslations } from "next-intl"
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

import { authClient } from "@/lib/auth-client"
import { safeRedirect } from "@workspace/core/redirect"
import { cn } from "@workspace/ui/lib/utils"

export function SignInForm({
  className,
  ...props
}: React.ComponentProps<"div">) {
  const t = useTranslations("Auth.signIn")
  const router = useRouter()
  const searchParams = useSearchParams()
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null)
  const [resending, setResending] = useState(false)

  const formSchema = z.object({
    email: z.email(t("invalidEmail")),
    password: z.string().min(1, t("passwordRequired")),
  })

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  })

  async function onSubmit(data: z.infer<typeof formSchema>) {
    setUnverifiedEmail(null)
    const { data: result, error } = await authClient.signIn.email(data)

    if (error) {
      if (error.status === 403) {
        setUnverifiedEmail(data.email)
        form.setError("root", { message: t("emailNotVerified") })
        return
      }
      form.setError("root", {
        message: error.message ?? t("genericError"),
      })
      return
    }

    const redirectTo = safeRedirect(searchParams.get("redirect"))
    if (result && "twoFactorRedirect" in result) {
      router.push(`/two-factor?redirect=${encodeURIComponent(redirectTo)}`)
      return
    }
    router.push(redirectTo)
    router.refresh()
  }

  async function resendVerification() {
    if (!unverifiedEmail) return
    setResending(true)
    const { error } = await authClient.sendVerificationEmail({
      email: unverifiedEmail,
      callbackURL: "/",
    })
    setResending(false)
    if (error) {
      toast.error(error.message ?? t("resendError"))
      return
    }
    toast.success(t("verificationSent"))
  }

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
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
                      autoComplete="current-password"
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
                    <FieldDescription className="text-end">
                      <Link href="/forgot-password">{t("forgotPassword")}</Link>
                    </FieldDescription>
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
                {unverifiedEmail && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={resending}
                    onClick={resendVerification}
                  >
                    {resending ? t("resending") : t("resendVerification")}
                  </Button>
                )}
                <FieldDescription className="text-center">
                  {t("noAccount")}{" "}
                  <Link
                    href={
                      searchParams.get("redirect")
                        ? `/sign-up?redirect=${encodeURIComponent(
                            searchParams.get("redirect") as string
                          )}`
                        : "/sign-up"
                    }
                  >
                    {t("signUpLink")}
                  </Link>
                </FieldDescription>
              </Field>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
