"use client"

import {
  BriefcaseIcon,
  CalendarIcon,
  CommandIcon,
  ContactIcon,
  FileIcon,
  FolderIcon,
  HandshakeIcon,
  KanbanIcon,
  MessageSquareIcon,
  MessageSquareWarningIcon,
  SparklesIcon,
} from "lucide-react"
import { useLocale, useTranslations } from "next-intl"

import { Link, usePathname } from "@workspace/i18n/navigation"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@workspace/ui/components/sidebar"

/**
 * The clients app's sidebar.
 *
 * Only the CRM sections belong to this app; every other workspace section
 * links to its own app (or Copilot while it still owns it) with an absolute
 * URL, so the split is visible and no cross-app route is faked here.
 */
export function ClientSidebar({
  orgSlug,
  copilotUrl,
}: {
  orgSlug: string
  copilotUrl: string
}) {
  const locale = useLocale()
  const t = useTranslations("Sidebar")
  const pathname = usePathname()

  const workspacePath = (path: string) =>
    `${copilotUrl}/${locale}/${orgSlug}${path}`

  const sections = [
    {
      icon: <HandshakeIcon />,
      title: t("clients"),
      path: `/${orgSlug}/clients`,
    },
    {
      icon: <ContactIcon />,
      title: t("contacts"),
      path: `/${orgSlug}/contacts`,
    },
    {
      icon: <KanbanIcon />,
      title: t("deals"),
      path: `/${orgSlug}/deals`,
    },
    {
      icon: <MessageSquareWarningIcon />,
      title: t("clientFeedback"),
      path: `/${orgSlug}/feedback`,
    },
  ]

  const otherApps = [
    { icon: <SparklesIcon />, title: t("assistant"), path: "" },
    { icon: <FolderIcon />, title: t("projects"), path: "/projects" },
    { icon: <MessageSquareIcon />, title: t("messages"), path: "/messages" },
    { icon: <CalendarIcon />, title: t("calendars"), path: "/calendars" },
    { icon: <FileIcon />, title: t("files"), path: "/files" },
    { icon: <BriefcaseIcon />, title: t("employees"), path: "/employees" },
  ]

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader className="gap-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              className="data-[slot=sidebar-menu-button]:p-1.5!"
              render={<Link href={`/${orgSlug}/clients`} prefetch={false} />}
            >
              <CommandIcon className="size-5!" />
              <span className="text-base font-semibold">Asynchrone Space</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{t("clients")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {sections.map((item) => (
                <SidebarMenuItem key={item.path}>
                  <SidebarMenuButton
                    isActive={pathname.startsWith(item.path)}
                    render={<Link href={item.path} prefetch={false} />}
                  >
                    {item.icon}
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>{t("workspace")}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {otherApps.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    render={<a href={workspacePath(item.path)} />}
                  >
                    {item.icon}
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}
