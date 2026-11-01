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
  open,
  onOpenChange,
}: {
  orgSlug: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const t = useTranslations("Sidebar")
  const router = useRouter()
  const apps = useNavMain(orgSlug)
  const secondary = useNavSecondary(orgSlug)

  function go(url: string) {
    onOpenChange(false)
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
              onSelect={() => go(item.url)}
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
