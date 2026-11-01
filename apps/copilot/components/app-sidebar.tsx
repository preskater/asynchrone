"use client"

import {
  BriefcaseIcon,
  CalendarIcon,
  CircleHelpIcon,
  CirclePlusIcon,
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
import { useTranslations } from "next-intl"

import { ProjectFormDialog } from "@workspace/projects/components/project/project-dialog"
import { CalendarsSidebar } from "@/components/calendars/calendars-sidebar"
import { ConversationSidebar } from "@workspace/messaging/components/conversation-sidebar"
import { FilesSidebar } from "@workspace/files/components/files-sidebar"
import { NavMain, type NavApp } from "@workspace/app-shell/nav-main"
import { useMessaging } from "@workspace/messaging/store"
import { NavSecondary } from "@workspace/ui/components/nav-secondary"
import { Link, usePathname } from "@workspace/i18n/navigation"
import { useWorkspaceNav } from "@/lib/workspace-nav/store"
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@workspace/ui/components/sidebar"

export function useNavMain(orgSlug: string): NavApp[] {
  const t = useTranslations("Sidebar")
  return [
    {
      title: t("assistant"),
      url: `/${orgSlug}`,
      icon: <SparklesIcon />,
    },
    {
      key: "projects",
      title: t("projects"),
      url: `/${orgSlug}/projects`,
      icon: <FolderIcon />,
    },
    {
      key: "messages",
      title: t("messages"),
      url: `/${orgSlug}/messages`,
      icon: <MessageSquareIcon />,
    },
    {
      key: "calendars",
      title: t("calendars"),
      url: `/${orgSlug}/calendars`,
      icon: <CalendarIcon />,
    },
    {
      key: "files",
      title: t("files"),
      url: `/${orgSlug}/files`,
      icon: <FileIcon />,
    },
    {
      title: t("clients"),
      url: `/${orgSlug}/clients`,
      icon: <HandshakeIcon />,
      match: [`/${orgSlug}/contacts`, `/${orgSlug}/deals`],
    },
    {
      title: t("employees"),
      url: `/${orgSlug}/employees`,
      icon: <BriefcaseIcon />,
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
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  orgSlug: string
}) {
  const pathname = usePathname()
  const t = useTranslations("Sidebar")
  const { unreadTotal } = useMessaging()
  const {
    messagesActiveId,
    selectConversation,
    messagesSearchOpen,
    setMessagesSearchOpen,
  } = useWorkspaceNav()
  const navMain = useNavMain(orgSlug)
  const navSecondary = useNavSecondary(orgSlug)

  const prefix = `/${orgSlug}`
  const relative = pathname.startsWith(prefix)
    ? pathname.slice(prefix.length)
    : pathname

  const contextual =
    relative === "/messages" || relative.startsWith("/messages/") ? (
      <ConversationSidebar
        navigation={{
          activeId: messagesActiveId,
          selectConversation,
          searchOpen: messagesSearchOpen,
          setSearchOpen: setMessagesSearchOpen,
        }}
      />
    ) : relative === "/files" || relative.startsWith("/files/") ? (
      <FilesSidebar />
    ) : relative === "/calendars" || relative.startsWith("/calendars/") ? (
      <CalendarsSidebar />
    ) : null

  if (contextual) {
    return (
      <Sidebar collapsible="offcanvas" {...props}>
        <SidebarContent>{contextual}</SidebarContent>
        <SidebarRail />
      </Sidebar>
    )
  }

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
          unreadTotal={unreadTotal}
          quickCreate={
            <ProjectFormDialog
              trigger={
                <SidebarMenuButton
                  tooltip={t("quickCreate")}
                  className="min-w-8 bg-primary text-primary-foreground duration-200 ease-linear hover:bg-primary/90 hover:text-primary-foreground active:bg-primary/90 active:text-primary-foreground"
                >
                  <CirclePlusIcon />
                  <span>{t("quickCreate")}</span>
                </SidebarMenuButton>
              }
            />
          }
        />
        <NavSecondary items={navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}
