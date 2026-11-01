"use client"

import { CommandIcon } from "lucide-react"

import { ConversationSidebar } from "@workspace/messaging/components/conversation-sidebar"
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

import { useMessagesNavigation } from "@/components/messages-navigation"

/**
 * The messages app's sidebar.
 *
 * The messages host is the conversation screen, so the sidebar is the
 * conversation list; the workspace sections stay in the header's app switcher
 * and point at Copilot (or the app that will own them after #161–#164).
 */
export function MessagesSidebar({ orgSlug }: { orgSlug: string }) {
  const navigation = useMessagesNavigation()

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader className="gap-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              className="data-[slot=sidebar-menu-button]:p-1.5!"
              render={<Link href={`/${orgSlug}/messages`} prefetch={false} />}
            >
              <CommandIcon className="size-5!" />
              <span className="text-base font-semibold">Asynchrone Space</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <ConversationSidebar navigation={navigation} />
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}
