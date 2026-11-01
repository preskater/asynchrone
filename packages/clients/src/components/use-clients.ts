"use client"

import { useLocale } from "next-intl"

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

/** Local day key for `<input type="date">` defaults. */
export function todayInputValue(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, "0")
  const day = String(now.getDate()).padStart(2, "0")
  return `${now.getFullYear()}-${month}-${day}`
}

/** `datetime-local` value for an ISO timestamp (or now). */
export function toDateTimeLocal(iso?: string): string {
  const date = iso ? new Date(iso) : new Date()
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function useClientFormat() {
  const locale = useLocale()

  function money(amount: number, currency = "EUR") {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount)
  }

  function day(key?: string, fallback = "—") {
    if (!key) return fallback
    return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(
      new Date(`${key}T00:00:00`)
    )
  }

  function dateTime(iso?: string, fallback = "—") {
    if (!iso) return fallback
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso))
  }

  /* Short relative label ("2h", "3d") for timelines. */
  function relative(iso: string) {
    const diff = Date.now() - new Date(iso).getTime()
    const minutes = Math.round(diff / 60_000)
    if (minutes < 1) return "now"
    if (minutes < 60) return `${minutes}m`
    const hours = Math.round(minutes / 60)
    if (hours < 24) return `${hours}h`
    const days = Math.round(hours / 24)
    if (days < 30) return `${days}d`
    return day(iso.slice(0, 10))
  }

  return { money, day, dateTime, relative }
}
