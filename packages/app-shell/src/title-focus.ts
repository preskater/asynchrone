"use client"

import * as React from "react"

import { usePathname } from "@workspace/i18n/navigation"

/**
 * Client-side navigation keeps focus on the clicked link. Attach the returned
 * ref to the page `<h1>` (with `tabIndex={-1}`) to move focus to the new title.
 */
export function useTitleFocus() {
  const pathname = usePathname()
  const titleRef = React.useRef<HTMLHeadingElement>(null)
  const previousPathname = React.useRef(pathname)

  React.useEffect(() => {
    if (previousPathname.current === pathname) return
    previousPathname.current = pathname
    titleRef.current?.focus()
  }, [pathname])

  return titleRef
}
