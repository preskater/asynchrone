"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

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
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"

import { authClient } from "@/lib/auth-client"

type Stage = "credentials" | "totp"

export function SignInForm() {
  const router = useRouter()
  const [stage, setStage] = useState<Stage>("credentials")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [code, setCode] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function submitCredentials(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError(null)

    const { data, error: signInError } = await authClient.signIn.email({
      email,
      password,
    })

    if (signInError) {
      setError(signInError.message ?? "Unable to sign in.")
      setPending(false)
      return
    }

    if ((data as { twoFactorRedirect?: boolean } | null)?.twoFactorRedirect) {
      setStage("totp")
      setPending(false)
      return
    }

    router.push("/overview")
    router.refresh()
  }

  async function submitCode(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError(null)

    const { error: verifyError } = await authClient.twoFactor.verifyTotp({ code })

    if (verifyError) {
      setError(verifyError.message ?? "Invalid code.")
      setPending(false)
      return
    }

    router.push("/overview")
    router.refresh()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {stage === "totp" ? "Two-factor code" : "Sign in"}
        </CardTitle>
        <CardDescription>
          {stage === "totp"
            ? "Enter the 6-digit code from your authenticator app."
            : "Platform staff only."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {stage === "credentials" ? (
          <form onSubmit={submitCredentials} noValidate>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? "sign-in-error" : undefined}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="password">Password</FieldLabel>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? "sign-in-error" : undefined}
                />
              </Field>
              {error ? (
                <FieldError id="sign-in-error" errors={[{ message: error }]} />
              ) : null}
              <Field>
                <Button type="submit" disabled={pending}>
                  {pending ? "Signing in…" : "Sign in"}
                </Button>
              </Field>
            </FieldGroup>
          </form>
        ) : (
          <form onSubmit={submitCode} noValidate>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="code">Authenticator code</FieldLabel>
                <Input
                  id="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  maxLength={6}
                  required
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? "sign-in-code-error" : undefined}
                />
              </Field>
              {error ? (
                <FieldError
                  id="sign-in-code-error"
                  errors={[{ message: error }]}
                />
              ) : null}
              <Field>
                <Button type="submit" disabled={pending}>
                  {pending ? "Verifying…" : "Verify"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => {
                    setStage("credentials")
                    setCode("")
                    setError(null)
                  }}
                >
                  Use another account
                </Button>
              </Field>
            </FieldGroup>
          </form>
        )}
      </CardContent>
    </Card>
  )
}
