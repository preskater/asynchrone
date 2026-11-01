import { Suspense } from "react"

import { AuthHomeButton } from "@/components/auth-home-button"
import { ConsentForm } from "@/components/oauth/consent-form"

export default function Page() {
  return (
    <div className="relative flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="absolute start-6 top-6">
        <AuthHomeButton />
      </div>
      <div className="w-full max-w-md">
        <Suspense>
          <ConsentForm />
        </Suspense>
      </div>
    </div>
  )
}
