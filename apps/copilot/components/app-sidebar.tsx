"use client"

import {
  BriefcaseIcon,
  CalendarIcon,
  CircleHelpIcon,
  CommandIcon,
  FileIcon,
  FolderIcon,
  HandshakeIcon,
  MessageSquareHeartIcon,
  MessageSquareIcon,
  SearchIcon,
  Settings2Icon,
  SparklesIcon,
} from "lucide-react"
import { useLocale, useTranslations } from "next-intl"

import { NavMain, type NavApp } from "@workspace/app-shell/nav-main"
import { NavSecondary } from "@workspace/ui/components/nav-secondary"
import { Link } from "@workspace/i18n/navigation"
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@workspace/ui/components/sidebar"

/**
 * Origins of the domain apps that own their own host.
 *
 * They are resolved on the server (from the deployment environment) and passed
 * down, so a client component never reads `process.env`.
 */
export interface DomainAppUrls {
  projects: string
  messages: string
  calendars: string
  files: string
  clients: string
  employees: string
}

export function useNavMain(
  orgSlug: string,
  domainApps: DomainAppUrls
): NavApp[] {
  const t = useTranslations("Sidebar")
  const locale = useLocale()
  const domainUrl = (origin: string, path: string) =>
    `${origin}/${locale}/${orgSlug}${path}`
  return [
    {
      title: t("assistant"),
      url: `/${orgSlug}`,
      icon: <SparklesIcon />,
    },
    {
      key: "projects",
      title: t("projects"),
      // Projects is its own app since #160; link to its host.
      url: domainUrl(domainApps.projects, "/projects"),
      icon: <FolderIcon />,
      external: true,
    },
    {
      key: "messages",
      title: t("messages"),
      // Messages is its own app since #162; link to its host.
      url: domainUrl(domainApps.messages, "/messages"),
      icon: <MessageSquareIcon />,
      external: true,
    },
    {
      key: "calendars",
      title: t("calendars"),
      // Calendars and meetings moved to their own app in #161.
      url: domainUrl(domainApps.calendars, "/calendars"),
      icon: <CalendarIcon />,
      external: true,
    },
    {
      key: "files",
      title: t("files"),
      // Files and the upload/download APIs moved to their own app in #161.
      url: domainUrl(domainApps.files, "/files"),
      icon: <FileIcon />,
      external: true,
    },
    {
      title: t("clients"),
      // The CRM moved to its own app in #163.
      url: domainUrl(domainApps.clients, "/clients"),
      icon: <HandshakeIcon />,
      external: true,
    },
    {
      title: t("employees"),
      // HR moved to its own app in #163.
      url: domainUrl(domainApps.employees, "/employees"),
      icon: <BriefcaseIcon />,
      external: true,
    },
  ]
}

export function useNavSecondary(orgSlug: string) {
  const t = useTranslations("Sidebar")
  return [
    {
      title: t("settings"),
      url: `/${orgSlug}/settings`,
      icon: <Settings2Icon />,
    },
    {
      title: t("search"),
      url: `/${orgSlug}/search`,
      icon: <SearchIcon />,
    },
    {
      title: t("feedback"),
      url: `/${orgSlug}/feedback`,
      icon: <MessageSquareHeartIcon />,
    },
    {
      title: t("getHelp"),
      url: `/${orgSlug}/help`,
      icon: <CircleHelpIcon />,
    },
  ]
}

export function AppSidebar({
  orgSlug,
  domainApps,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  orgSlug: string
  /** Origins of the domain apps that own their own host (#160–#162). */
  domainApps: DomainAppUrls
}) {
  const navMain = useNavMain(orgSlug, domainApps)
  const navSecondary = useNavSecondary(orgSlug)

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader className="gap-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              className="data-[slot=sidebar-menu-button]:p-1.5!"
              render={<Link href={`/${orgSlug}`} prefetch={false} />}
            >
              <CommandIcon className="size-5!" />
              <span className="text-base font-semibold">Asynchrone Space</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain
          items={navMain}
          orgSlug={orgSlug}
          messagesUrl={domainApps.messages}
        />
        <NavSecondary items={navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}
