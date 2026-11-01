/**
 * A short "Browser on OS" label for the sessions list. Order matters: Edge
 * and Opera also announce Chrome, and Chrome also announces Safari.
 */
const BROWSERS: [RegExp, string][] = [
  [/Edg\//, "Edge"],
  [/OPR\//, "Opera"],
  [/Firefox\//, "Firefox"],
  [/Chrome\//, "Chrome"],
  [/Safari\//, "Safari"],
]

const SYSTEMS: [RegExp, string][] = [
  [/iPhone|iPad/, "iOS"],
  [/Android/, "Android"],
  [/Windows/, "Windows"],
  [/Mac OS X|Macintosh/, "macOS"],
  [/Linux/, "Linux"],
]

export function describeUserAgent(userAgent: string | null | undefined) {
  if (!userAgent) return null
  const browser = BROWSERS.find(([pattern]) => pattern.test(userAgent))?.[1]
  const system = SYSTEMS.find(([pattern]) => pattern.test(userAgent))?.[1]
  if (browser && system) return `${browser} · ${system}`
  return browser ?? system ?? null
}
