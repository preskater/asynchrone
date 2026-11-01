"use client"

import { useTranslations } from "next-intl"

import { useNavMain, useNavSecondary } from "@/components/app-sidebar"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@workspace/ui/components/command"

import { useRouter } from "@workspace/i18n/navigation"

export function CommandMenu({
  orgSlug,
  projectsUrl,
  messagesUrl,
  open,
  onOpenChange,
}: {
  orgSlug: string
  /** Origin of the projects app (its own image and chart since #160). */
  projectsUrl: string
  /** Origin of the messages app (its own image and chart since #162). */
  messagesUrl: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations("Sidebar")
  const router = useRouter()
  const apps = useNavMain(orgSlug, projectsUrl, messagesUrl)
  const secondary = useNavSecondary(orgSlug)

  function go(url: string, external?: boolean) {
    onOpenChange(false)
    if (external) {
      window.location.href = url
      return
    }
    router.push(url)
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t("search")}
      description={t("search")}
    >
      <CommandInput placeholder={t("searchPlaceholder")} />
      <CommandList>
        <CommandEmpty>{t("noResults")}</CommandEmpty>
        <CommandGroup heading={t("workspace")}>
          {apps.map((item) => (
            <CommandItem
              key={item.url}
              value={item.title}
              onSelect={() => go(item.url, item.external)}
            >
              {item.icon}
              <span>{item.title}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading={t("settings")}>
          {secondary.map((item) => (
            <CommandItem
              key={item.url}
              value={item.title}
              onSelect={() => go(item.url)}
            >
              {item.icon}
              <span>{item.title}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
