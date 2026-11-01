"use client"

import { useEffect, useRef } from "react"
import Script from "next/script"

interface TurnstileApi {
  render: (
    element: HTMLElement,
    options: {
      sitekey: string
      callback: (token: string) => void
      "expired-callback": () => void
      "error-callback": () => void
    }
  ) => string
  remove: (widgetId: string) => void
}

declare global {
  interface Window {
    turnstile?: TurnstileApi
  }
}

/** How long to wait for the Cloudflare script before telling the form. */
const LOAD_TIMEOUT_MS = 10_000

/**
 * Cloudflare Turnstile widget. Tokens are single-use: remount it (change its
 * `key`) after each submission so the next attempt gets a fresh token.
 *
 * Callbacks are read through refs, so passing an inline arrow does not remount
 * the widget. `onUnavailable` fires when the challenge cannot load at all
 * (blocked script, proxy, offline) — without it the form could only show a
 * permanently disabled submit button.
 */
export function Turnstile({
  siteKey,
  onToken,
  onUnavailable,
}: {
  siteKey: string
  onToken: (token: string | null) => void
  onUnavailable?: () => void
}) {
  const container = useRef<HTMLDivElement>(null)
  const onTokenRef = useRef(onToken)
  const onUnavailableRef = useRef(onUnavailable)
  // Update the refs in an effect instead of during render; the mount effect
  // below reads them when the widget calls back.
  useEffect(() => {
    onTokenRef.current = onToken
    onUnavailableRef.current = onUnavailable
  }, [onToken, onUnavailable])

  useEffect(() => {
    let widgetId: string | undefined
    const mount = () => {
      if (!window.turnstile || !container.current) return
      window.clearInterval(timer)
      window.clearTimeout(timeout)
      widgetId = window.turnstile.render(container.current, {
        sitekey: siteKey,
        callback: (token) => onTokenRef.current(token),
        "expired-callback": () => onTokenRef.current(null),
        "error-callback": () => {
          onTokenRef.current(null)
          onUnavailableRef.current?.()
        },
      })
    }
    // The script may still be loading on first render.
    const timer = window.setInterval(mount, 200)
    // …but a blocked script never arrives: stop waiting and say so.
    const timeout = window.setTimeout(() => {
      if (widgetId) return
      window.clearInterval(timer)
      onUnavailableRef.current?.()
    }, LOAD_TIMEOUT_MS)
    mount()
    return () => {
      window.clearInterval(timer)
      window.clearTimeout(timeout)
      if (widgetId) window.turnstile?.remove(widgetId)
    }
  }, [siteKey])

  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onError={() => onUnavailableRef.current?.()}
      />
      <div ref={container} />
    </>
  )
}
