"use client"

import * as React from "react"

import { SidebarInset, SidebarProvider } from "@workspace/ui/components/sidebar"

import { SupportFooter, SupportProvider } from "./support"

export function WorkspaceShell({
  sidebar,
  header,
  banners,
  skipLabel,
  copilotUrl,
  children,
}: {
  sidebar: React.ReactNode
  header: React.ReactNode
  banners?: React.ReactNode
  skipLabel: string
  /** Copilot's origin (`""` on Copilot): help, tickets and status live there. */
  copilotUrl: string
  children: React.ReactNode
}) {
  return (
    <SupportProvider copilotUrl={copilotUrl}>
      <SidebarProvider
        style={
          {
            "--sidebar-width": "calc(var(--spacing) * 72)",
            "--header-height": "calc(var(--spacing) * 12)",
          } as React.CSSProperties
        }
      >
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:shadow"
        >
          {skipLabel}
        </a>
        {sidebar}
        <SidebarInset id="main-content">
          {banners}
          {header}
          <div className="flex flex-1 flex-col">
            <div className="@container/main flex flex-1 flex-col gap-2">
              {children}
            </div>
          </div>
          <SupportFooter />
        </SidebarInset>
      </SidebarProvider>
    </SupportProvider>
  )
}
