import { useTranslations } from "next-intl"

import { Container } from "@/components/landing/section"
import { Wordmark } from "@/components/landing/wordmark"
import { NewsletterForm } from "@/components/forms/newsletter-form"
import { Link } from "@workspace/i18n/navigation"
import { Separator } from "@workspace/ui/components/separator"
import { footerColumns } from "@/lib/landing/content"

export function Footer() {
  const t = useTranslations("Footer")
  const tLanding = useTranslations("Landing.footerColumns")

  return (
    <footer id="footer" className="border-t bg-muted/30">
      <Container className="py-14">
        <div className="grid gap-10 lg:grid-cols-[1.5fr_2.5fr]">
          <div className="flex flex-col gap-4">
            <Wordmark />
            <p className="max-w-xs text-sm text-muted-foreground">
              {t("description")}
            </p>
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">{t("updatesHeading")}</span>
              <NewsletterForm />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
            {footerColumns.map((column) => (
              <div key={column.key} className="flex flex-col gap-3">
                <span className="text-sm font-medium">
                  {tLanding(column.key)}
                </span>
                <ul className="flex flex-col gap-2">
                  {column.links.map((link) => (
                    <li key={link.key}>
                      <Link
                        href={link.href}
                        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                      >
                        {tLanding(link.key as never)}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <Separator className="my-10" />

        <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
          <p className="text-sm text-muted-foreground">
            {t("copyright", { year: new Date().getFullYear() })}
          </p>
          <p className="text-sm text-muted-foreground">{t("builtWith")}</p>
        </div>
      </Container>
    </footer>
  )
}
