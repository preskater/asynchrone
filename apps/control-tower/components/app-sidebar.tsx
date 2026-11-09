"use client"

import Link from "next/link"

import {
  Building2,
  ExternalLink,
  LayoutDashboard,
  LifeBuoy,
  ScrollText,
  ServerCog,
  ShieldCheck,
  Users,
} from "lucide-react"

import { NavSecondary } from "@workspace/ui/components/nav-secondary"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@workspace/ui/components/sidebar"

import type { PlatformContext } from "@/lib/platform/guard"

import { NavMain, type NavItem } from "./nav-main"
import { NavUser } from "./nav-user"

const NAV: NavItem[] = [
  { title: "Overview", href: "/overview", icon: LayoutDashboard },
  { title: "Organizations", href: "/organizations", icon: Building2 },
  { title: "Users", href: "/users", icon: Users },
  { title: "Support", href: "/support", icon: LifeBuoy },
  { title: "Audit", href: "/audit", icon: ScrollText },
  { title: "Operations", href: "/ops", icon: ServerCog },
]

export function AppSidebar({
  context,
  platformAppUrl,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  context: PlatformContext
  platformAppUrl: string
}) {
  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader className="gap-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              className="data-[slot=sidebar-menu-button]:p-1.5!"
              render={<Link href="/overview" prefetch={false} />}
            >
              <ShieldCheck className="size-5!" />
              <span className="flex min-w-0 flex-col items-start leading-tight">
                <span className="text-base font-semibold">
                  Asynchrone Space
                </span>
                <span className="text-[10px] font-medium tracking-wider text-muted-foreground uppercase">
                  Control Tower
                </span>
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={NAV} />
        <NavSecondary
          className="mt-auto"
          items={[
            {
              title: "Open customer app",
              url: platformAppUrl,
              icon: <ExternalLink />,
              external: true,
            },
          ]}
        />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={context} platformAppUrl={platformAppUrl} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
