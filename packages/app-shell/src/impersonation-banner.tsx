import { getTranslations } from "next-intl/server"

import { Button } from "@workspace/ui/components/button"

/**
 * Shown whenever the current web session was opened through the control
 * tower. Rendered server-side; the stop action is a plain POST so it works
 * without client JavaScript.
 */
export async function ImpersonationBanner({ name }: { name: string }) {
  const t = await getTranslations("Impersonation")

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-950 dark:text-amber-100">
      <p>
        <span className="font-medium">{t("title", { name })}</span>{" "}
        <span className="opacity-80">{t("description")}</span>
      </p>
      <form action="/api/platform/stop-impersonating" method="post">
        <Button type="submit" size="sm" variant="outline">
          {t("stop")}
        </Button>
      </form>
    </div>
  )
}
