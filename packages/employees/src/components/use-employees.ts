"use client"

import * as React from "react"

import { localDateKey } from "../date-utils"

/**
 * The user's local calendar day ("YYYY-MM-DD"). Starts from the server's
 * `todayKey` (deterministic during SSR) and switches to the browser's date
 * after mount, so the page always matches the user's wall clock.
 */
export function useTodayKey(serverToday: string): string {
  const [today, setToday] = React.useState(serverToday)
  React.useEffect(() => {
    setToday(localDateKey(new Date()))
  }, [])
  return today
}

/** Trigger a browser download for CSV content produced by a server action. */
export function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
