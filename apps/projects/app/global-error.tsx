"use client"

import * as React from "react"
import { Geist, Geist_Mono } from "next/font/google"
import { NextIntlClientProvider, useTranslations } from "next-intl"

import "@workspace/ui/globals.css"
import { Button } from "@workspace/ui/components/button"
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
    <main className="flex min-h-svh w-full flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        {t("globalDescription")}
      </p>
      {error.digest ? (
        <p className="text-xs text-muted-foreground">
          {t("reference", { digest: error.digest })}
        </p>
      ) : null}
      <Button onClick={retry}>{t("retry")}</Button>
    </main>
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
    console.error(error)
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
