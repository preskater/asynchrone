"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"

import { useTheme } from "next-themes"

import {
  Building2,
  ExternalLink,
  LayoutDashboard,
  LogOut,
  MoonStar,
  ScrollText,
  ServerCog,
  LifeBuoy,
  Users,
} from "lucide-react"

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@workspace/ui/components/command"

import { authClient } from "@/lib/auth-client"

const SECTIONS = [
  { title: "Overview", href: "/overview", icon: LayoutDashboard },
  { title: "Organizations", href: "/organizations", icon: Building2 },
  { title: "Users", href: "/users", icon: Users },
  { title: "Support", href: "/support", icon: LifeBuoy },
  { title: "Audit", href: "/audit", icon: ScrollText },
  { title: "Operations", href: "/ops", icon: ServerCog },
]

export function CommandMenu({
  open,
  onOpenChange,
  platformAppUrl,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  platformAppUrl: string
}) {
  const router = useRouter()
  const { resolvedTheme, setTheme } = useTheme()
  const [query, setQuery] = useState("")
  const term = query.trim()

  function go(href: string) {
    onOpenChange(false)
    router.push(href)
  }

  async function signOut() {
    onOpenChange(false)
    await authClient.signOut()
    router.push("/sign-in")
    router.refresh()
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Command menu"
      description="Search the control tower"
    >
      <CommandInput
        placeholder="Search pages, organizations, users…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>
        <CommandGroup heading="Go to">
          {SECTIONS.map((section) => (
            <CommandItem
              key={section.href}
              value={section.title}
              onSelect={() => go(section.href)}
            >
              <section.icon />
              <span>{section.title}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        {term ? (
          <CommandGroup heading="Search">
            <CommandItem
              value={`organizations ${term}`}
              onSelect={() =>
                go(`/organizations?q=${encodeURIComponent(term)}`)
              }
            >
              <Building2 />
              <span>Search organizations for “{term}”</span>
            </CommandItem>
            <CommandItem
              value={`users ${term}`}
              onSelect={() => go(`/users?q=${encodeURIComponent(term)}`)}
            >
              <Users />
              <span>Search users for “{term}”</span>
            </CommandItem>
          </CommandGroup>
        ) : null}
        <CommandSeparator />
        <CommandGroup heading="Actions">
          <CommandItem
            value="open customer app"
            onSelect={() => {
              onOpenChange(false)
              window.open(platformAppUrl, "_blank", "noopener,noreferrer")
            }}
          >
            <ExternalLink />
            <span>Open customer app</span>
          </CommandItem>
          <CommandItem
            value="toggle theme"
            onSelect={() => {
              onOpenChange(false)
              setTheme(resolvedTheme === "dark" ? "light" : "dark")
            }}
          >
            <MoonStar />
            <span>Toggle theme</span>
          </CommandItem>
          <CommandItem value="sign out" onSelect={signOut}>
            <LogOut />
            <span>Sign out</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
