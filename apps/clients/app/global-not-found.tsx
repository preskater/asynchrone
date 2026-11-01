import Link from "next/link"
import { Geist, Geist_Mono } from "next/font/google"
import { headers } from "next/headers"
import { CompassIcon } from "lucide-react"
import { NextIntlClientProvider } from "next-intl"
import { getTranslations } from "next-intl/server"

import type { Metadata } from "next"

import "@workspace/ui/globals.css"
import { Button } from "@workspace/ui/components/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import { cn } from "@workspace/ui/lib/utils"

import { routing } from "@workspace/i18n/routing"
import en from "@workspace/i18n/messages/en"
import fr from "@workspace/i18n/messages/fr"

const fontSans = Geist({ subsets: ["latin"], variable: "--font-sans" })
const fontMono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" })

const themeScript = `(function(){try{var t=localStorage.getItem('theme');var d=t==='system'||!t?window.matchMedia('(prefers-color-scheme: dark)').matches:t==='dark';document.documentElement.classList.toggle('dark',d)}catch(e){}})()`

const MESSAGES = { en, fr } as const

function detectLocale(acceptLanguage: string | null): "en" | "fr" {
  if (acceptLanguage && /(^|[,\s])fr\b/i.test(acceptLanguage)) return "fr"
  return routing.defaultLocale
}

export const metadata: Metadata = {
  title: "Page not found · Asynchrone Space",
}

export default async function GlobalNotFound() {
  const headerList = await headers()
  const locale = detectLocale(headerList.get("accept-language"))
  const t = await getTranslations({ locale, namespace: "NotFound" })

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={cn("antialiased", fontSans.variable, fontMono.variable)}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="bg-background text-foreground">
        <NextIntlClientProvider locale={locale} messages={MESSAGES[locale]}>
          <main className="flex min-h-svh w-full items-center justify-center">
            <Empty className="w-full max-w-md">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <CompassIcon />
                </EmptyMedia>
                <EmptyTitle>{t("title")}</EmptyTitle>
                <EmptyDescription>{t("description")}</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button
                  nativeButton={false}
                  render={<Link href={`/${locale}`} />}
                >
                  {t("backHome")}
                </Button>
              </EmptyContent>
            </Empty>
          </main>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
