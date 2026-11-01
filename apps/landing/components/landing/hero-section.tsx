import { ArrowRightIcon, PlayIcon } from "lucide-react"
import { getTranslations } from "next-intl/server"

import { Container } from "@/components/landing/section"
import { WaitlistForm } from "@/components/forms/waitlist-form"
import { Link } from "@workspace/i18n/navigation"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"

import { signUpHref } from "@/lib/workspace"

/** Anonymous hero: the primary action continues on Copilot. */
export async function HeroSection() {
  const t = await getTranslations("Landing.hero")

  return (
    <section className="relative overflow-hidden py-20 sm:py-28">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,var(--color-primary)/8%,transparent_60%)]"
      />
      <Container className="flex flex-col items-center text-center">
        <Badge variant="secondary" className="mb-6">
          {t("badge")}
        </Badge>

        <h1 className="max-w-4xl font-heading text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
          {t("title")}
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-lg text-pretty text-muted-foreground">
          {t("description")}
        </p>

        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Button
            size="lg"
            render={<a href={signUpHref} />}
            nativeButton={false}
          >
            {t("startBuilding")}
            <ArrowRightIcon data-icon="inline-end" />
          </Button>
          <Button
            size="lg"
            variant="outline"
            render={<Link href="/contact" />}
            nativeButton={false}
          >
            <PlayIcon data-icon="inline-start" />
            {t("bookDemo")}
          </Button>
        </div>

        <div className="mt-10 w-full">
          <p className="mb-3 text-sm text-muted-foreground">
            {t("waitlistPrompt")}
          </p>
          <WaitlistForm />
        </div>
      </Container>
    </section>
  )
}
