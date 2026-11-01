import { routing } from "@workspace/i18n/routing"
import en from "@workspace/i18n/messages/en"

type Messages = typeof en

declare module "next-intl" {
  interface AppConfig {
    Locale: (typeof routing.locales)[number]
    Messages: Messages
  }
}
