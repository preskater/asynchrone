import { Suspense } from "react"
import { connection } from "next/server"

import { AuthHomeButton } from "@/components/auth-home-button"
import { ForgotPasswordForm } from "@/components/forgot-password-form"

export default async function Page() {
  // Read at request time so one image serves every environment's site key.
  await connection()
  return (
    <div className="relative flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="absolute start-6 top-6">
        <AuthHomeButton />
      </div>
      <div className="w-full max-w-sm">
        <Suspense>
          <ForgotPasswordForm captchaSiteKey={process.env.TURNSTILE_SITE_KEY} />
        </Suspense>
      </div>
    </div>
  )
}
