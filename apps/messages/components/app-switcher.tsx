"use client"

import {
  BriefcaseIcon,
  CalendarIcon,
  ChevronsUpDownIcon,
  FileIcon,
  FolderIcon,
  HandshakeIcon,
  MessageSquareIcon,
  SparklesIcon,
} from "lucide-react"
import { useTranslations } from "next-intl"

import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"

/**
 * The workspace app switcher on the messages host.
 *
 * Only Messages is served here; every other section is an absolute URL to the
 * app that owns it (Copilot today, the domain app after #161–#164), so no
 * cross-app route is faked in this app.
 */
export function AppSwitcher({
  orgSlug,
  locale,
  copilotUrl,
  projectsUrl,
}: {
  orgSlug: string
  locale: string
  copilotUrl: string
  projectsUrl: string
}) {
  const t = useTranslations("Sidebar")

  const copilotPath = (path: string) =>
    `${copilotUrl}/${locale}/${orgSlug}${path}`

  const items = [
    { icon: <SparklesIcon />, title: t("assistant"), url: copilotPath("") },
    {
      icon: <FolderIcon />,
      title: t("projects"),
      url: `${projectsUrl}/${locale}/${orgSlug}/projects`,
    },
    {
      icon: <MessageSquareIcon />,
      title: t("messages"),
      url: `/${locale}/${orgSlug}/messages`,
    },
    {
      icon: <CalendarIcon />,
      title: t("calendars"),
      url: copilotPath("/calendars"),
    },
    { icon: <FileIcon />, title: t("files"), url: copilotPath("/files") },
    {
      icon: <HandshakeIcon />,
      title: t("clients"),
      url: copilotPath("/clients"),
    },
    {
      icon: <BriefcaseIcon />,
      title: t("employees"),
      url: copilotPath("/employees"),
    },
  ]

  const current = items[2]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="sm" className="gap-1.5" />}
      >
        {current?.icon}
        <span className="hidden text-sm font-medium sm:inline">
          {current?.title}
        </span>
        <ChevronsUpDownIcon className="size-3.5 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-48">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t("workspace")}</DropdownMenuLabel>
          {items.map((item) => (
            <DropdownMenuItem key={item.title} render={<a href={item.url} />}>
              {item.icon}
              <span>{item.title}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
