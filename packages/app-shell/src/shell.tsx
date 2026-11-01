"use client"

import * as React from "react"

import { SidebarInset, SidebarProvider } from "@workspace/ui/components/sidebar"

export function WorkspaceShell({
  sidebar,
  header,
  banners,
  skipLabel,
  children,
}: {
  sidebar: React.ReactNode
  header: React.ReactNode
  banners?: React.ReactNode
  skipLabel: string
  children: React.ReactNode
}) {
  return (
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
      </SidebarInset>
    </SidebarProvider>
  )
}
