"use client"

import * as React from "react"
import { MenuIcon } from "lucide-react"
import { useTranslations } from "next-intl"

import { ThemeToggle } from "@workspace/ui/components/theme-toggle"
import { LocaleSwitcher } from "@/components/landing/locale-switcher"
import { Wordmark } from "@/components/landing/wordmark"
import { Link } from "@workspace/i18n/navigation"
import { Button } from "@workspace/ui/components/button"
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@workspace/ui/components/navigation-menu"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@workspace/ui/components/sheet"
import { Separator } from "@workspace/ui/components/separator"

import {
  companyNav,
  productNav,
  resourceNav,
  solutionNav,
  type NavColumn,
} from "@/lib/landing/content"
import { openWorkspaceHref, signInHref } from "@/lib/workspace"

function NavMenuColumn({
  column,
  label,
}: {
  column: NavColumn
  label: (key: string) => string
}) {
  return (
    <div className="grid gap-1 p-1">
      {column.links.map((link) => (
        <NavigationMenuLink key={link.key} render={<Link href={link.href} />}>
          <span className="flex flex-col gap-0.5">
            <span className="font-medium">{label(link.key)}</span>
            <span className="text-xs text-muted-foreground">
              {label(`${link.key}Description`)}
            </span>
          </span>
        </NavigationMenuLink>
      ))}
    </div>
  )
}

const columns = [productNav, solutionNav, resourceNav, companyNav]

/**
 * The landing never renders session state. Signing in and opening the
 * workspace always continue on Copilot.
 */
export function Navbar() {
  const t = useTranslations("Navbar")
  const tLanding = useTranslations("Landing")
  const tCommon = useTranslations("Common")
  const [mobileOpen, setMobileOpen] = React.useState(false)

  const columnTitle = (key: string) => tLanding(`nav.${key}.title` as never)
  const columnLabel = (columnKey: string) => (linkKey: string) =>
    tLanding(`${columnKey}Nav.${linkKey}` as never)

  return (
    <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-md">
      <div className="mx-auto grid h-16 max-w-6xl grid-cols-[1fr_auto_1fr] items-center gap-4 px-6">
        <div className="flex items-center">
          <Link href="/" aria-label={t("homeLabel")}>
            <Wordmark />
          </Link>
        </div>

        <NavigationMenu className="hidden md:flex">
          <NavigationMenuList>
            {columns.map((column) => (
              <NavigationMenuItem key={column.key}>
                <NavigationMenuTrigger>
                  {columnTitle(column.key)}
                </NavigationMenuTrigger>
                <NavigationMenuContent className="w-72">
                  <NavMenuColumn
                    column={column}
                    label={columnLabel(column.key)}
                  />
                </NavigationMenuContent>
              </NavigationMenuItem>
            ))}
            <NavigationMenuItem>
              <NavigationMenuLink
                render={<Link href="/pricing" />}
                className="h-9 items-center px-2.5 py-1.5"
              >
                {t("pricing")}
              </NavigationMenuLink>
            </NavigationMenuItem>
          </NavigationMenuList>
        </NavigationMenu>

        <div className="flex items-center justify-end gap-2">
          <LocaleSwitcher />
          <ThemeToggle ariaLabel={tCommon("toggleTheme")} />
          <Button
            variant="ghost"
            className="hidden sm:inline-flex"
            render={<a href={signInHref} />}
            nativeButton={false}
          >
            {t("signIn")}
          </Button>
          <Button
            className="hidden sm:inline-flex"
            render={<a href={openWorkspaceHref} />}
            nativeButton={false}
          >
            {t("openWorkspace")}
          </Button>

          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="md:hidden"
                  aria-label={t("openMenu")}
                />
              }
            >
              <MenuIcon />
            </SheetTrigger>
            <SheetContent side="right" className="w-80 p-0">
              <SheetHeader>
                <SheetTitle>
                  <Wordmark />
                </SheetTitle>
              </SheetHeader>
              <div className="flex flex-col gap-6 overflow-y-auto p-4">
                {columns.map((column) => (
                  <div key={column.key} className="flex flex-col gap-1">
                    <p className="px-1 text-xs font-medium text-muted-foreground">
                      {columnTitle(column.key)}
                    </p>
                    {column.links.map((link) => (
                      <Link
                        key={link.key}
                        href={link.href}
                        onClick={() => setMobileOpen(false)}
                        className="rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                      >
                        {columnLabel(column.key)(link.key)}
                      </Link>
                    ))}
                  </div>
                ))}
                <Link
                  href="/pricing"
                  onClick={() => setMobileOpen(false)}
                  className="rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                >
                  {t("pricing")}
                </Link>
              </div>
              <div className="mt-auto flex flex-col gap-2 border-t p-4">
                <Separator className="mb-2" />
                <Button
                  render={<a href={openWorkspaceHref} />}
                  nativeButton={false}
                >
                  {t("openWorkspace")}
                </Button>
                <Button
                  variant="outline"
                  render={<a href={signInHref} />}
                  nativeButton={false}
                >
                  {t("signIn")}
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  )
}
