"use client"

import * as React from "react"
import * as Sentry from "@sentry/nextjs"
import { Geist, Geist_Mono } from "next/font/google"
import { NextIntlClientProvider, useTranslations } from "next-intl"

import "@workspace/ui/globals.css"
import { ErrorState } from "@/components/states/error-state"
import { cn } from "@workspace/ui/lib/utils"

import en from "@workspace/i18n/messages/en"

const fontSans = Geist({ subsets: ["latin"], variable: "--font-sans" })
const fontMono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" })

const themeScript = `(function(){try{var t=localStorage.getItem('theme');var d=t==='system'||!t?window.matchMedia('(prefers-color-scheme: dark)').matches:t==='dark';document.documentElement.classList.toggle('dark',d)}catch(e){}})()`

function GlobalErrorContent({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  const t = useTranslations("Error")

  return (
    <ErrorState
      error={error}
      retry={retry}
      title={t("title")}
      description={t("globalDescription")}
      referenceLabel={
        error.digest ? t("reference", { digest: error.digest }) : undefined
      }
      retryLabel={t("retry")}
      className="min-h-svh"
    />
  )
}

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  React.useEffect(() => {
    Sentry.captureException(error)
  }, [error])

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("antialiased", fontSans.variable, fontMono.variable)}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="bg-background text-foreground">
        <NextIntlClientProvider locale="en" messages={en}>
          <GlobalErrorContent error={error} retry={retry} />
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
