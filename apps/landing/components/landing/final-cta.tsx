import { ArrowRightIcon } from "lucide-react"
import { getTranslations } from "next-intl/server"

import { Container } from "@/components/landing/section"
import { Button } from "@workspace/ui/components/button"

import { signInHref, signUpHref } from "@/lib/workspace"

export async function FinalCta() {
  const t = await getTranslations("Landing.cta")

  return (
    <section className="py-20 sm:py-24">
      <Container>
        <div className="relative overflow-hidden rounded-2xl bg-primary px-6 py-16 text-center text-primary-foreground sm:px-16">
          <h2 className="mx-auto max-w-2xl font-heading text-3xl font-semibold tracking-tight text-balance sm:text-4xl">
            {t("title")}
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-pretty text-primary-foreground/80">
            {t("description")}
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Button
              size="lg"
              variant="secondary"
              render={<a href={signUpHref} />}
              nativeButton={false}
            >
              {t("startBuilding")}
              <ArrowRightIcon data-icon="inline-end" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="border-primary-foreground/30 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
              render={<a href={signInHref} />}
              nativeButton={false}
            >
              {t("signIn")}
            </Button>
          </div>
        </div>
      </Container>
    </section>
  )
}
