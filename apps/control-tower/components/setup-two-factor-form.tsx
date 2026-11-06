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
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"

import { authClient } from "@/lib/auth-client"

interface Enrollment {
  uri: string
  backupCodes: string[]
}

export function SetupTwoFactorForm() {
  const router = useRouter()
  const [password, setPassword] = useState("")
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null)
  const [code, setCode] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function start(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError(null)

    const { data, error: enableError } = await authClient.twoFactor.enable({
      password,
    })

    if (enableError) {
      setError(enableError.message ?? "Could not start two-factor setup.")
      setPending(false)
      return
    }

    if (!data || !("totpURI" in data)) {
      setError("This account cannot enroll a TOTP device.")
      setPending(false)
      return
    }

    setEnrollment({ uri: data.totpURI, backupCodes: data.backupCodes })
    setPassword("")
    setPending(false)
  }

  async function verify(event: React.FormEvent<HTMLFormElement>) {
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
        <CardTitle>Set up two-factor authentication</CardTitle>
        <CardDescription>
          Every platform role requires a TOTP authenticator before the control
          tower can be used.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!enrollment ? (
          <form onSubmit={start}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="setup-password">Account password</FieldLabel>
                <Input
                  id="setup-password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? "setup-password-error" : undefined}
                />
                <FieldDescription>
                  Used once to generate your secret. It is never stored here.
                </FieldDescription>
              </Field>
              {error ? (
                <FieldError
                  id="setup-password-error"
                  errors={[{ message: error }]}
                />
              ) : null}
              <Field>
                <Button type="submit" disabled={pending}>
                  {pending ? "Preparing…" : "Start setup"}
                </Button>
              </Field>
            </FieldGroup>
          </form>
        ) : (
          <form onSubmit={verify} className="space-y-4">
            <div className="space-y-1">
              <p className="text-sm font-medium">1. Add the account</p>
              <p className="text-sm text-muted-foreground">
                Paste this `otpauth://` URI into your authenticator app, or add
                the secret manually.
              </p>
              <code className="block max-h-32 overflow-auto rounded-md bg-muted p-2 text-xs break-all">
                {enrollment.uri}
              </code>
            </div>

            <div className="space-y-1">
              <p className="text-sm font-medium">2. Save backup codes</p>
              <ul className="grid grid-cols-2 gap-1 rounded-md bg-muted p-2 font-mono text-xs">
                {enrollment.backupCodes.map((backupCode) => (
                  <li key={backupCode}>{backupCode}</li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">
                Each code works once. Store them somewhere safe.
              </p>
            </div>

            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="setup-code">
                  3. Enter a code to confirm
                </FieldLabel>
                <Input
                  id="setup-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  required
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? "setup-code-error" : undefined}
                />
              </Field>
              {error ? (
                <FieldError
                  id="setup-code-error"
                  errors={[{ message: error }]}
                />
              ) : null}
              <Field>
                <Button type="submit" disabled={pending}>
                  {pending ? "Verifying…" : "Enable and continue"}
                </Button>
              </Field>
            </FieldGroup>
          </form>
        )}
      </CardContent>
    </Card>
  )
}
