"use client"

import * as React from "react"
import { useServerInsertedHTML } from "next/navigation"

import {
  ANIMATION_EFFECTS,
  appearanceAttributes,
  customThemeVariables,
  EFFECT_ATTRIBUTES,
  type OrganizationAppearance,
} from "@workspace/appearance/types"
import {
  appearanceBootScript,
  userAppearanceStorageKey,
} from "./appearance-boot"

export interface UserAppearancePreferences {
  highContrast: boolean
  disableAnimations: boolean
}

export const DEFAULT_USER_PREFERENCES: UserAppearancePreferences = {
  highContrast: false,
  disableAnimations: false,
}

interface AppearanceContextValue {
  organization: OrganizationAppearance
  setOrganizationAppearance: (appearance: OrganizationAppearance) => void
  user: UserAppearancePreferences
  setUserPreferences: (patch: Partial<UserAppearancePreferences>) => void
  resetUserPreferences: () => void
}

const AppearanceContext = React.createContext<AppearanceContextValue | null>(
  null
)

function storageKey(userId: string) {
  return userAppearanceStorageKey(userId)
}

function readPreferences(userId: string): UserAppearancePreferences {
  if (typeof window === "undefined") return DEFAULT_USER_PREFERENCES
  try {
    const raw = window.localStorage.getItem(storageKey(userId))
    if (!raw) return DEFAULT_USER_PREFERENCES
    const parsed = JSON.parse(raw) as Partial<UserAppearancePreferences>
    return {
      highContrast: parsed.highContrast === true,
      disableAnimations: parsed.disableAnimations === true,
    }
  } catch {
    return DEFAULT_USER_PREFERENCES
  }
}

const MANAGED_CUSTOM_PROPERTIES = [
  "--theme-primary",
  "--theme-accent",
  "--theme-on-primary",
  "--radius",
]

function applyCustomTheme(
  element: HTMLElement,
  appearance: OrganizationAppearance
) {
  if (appearance.theme !== "custom") {
    for (const property of MANAGED_CUSTOM_PROPERTIES) {
      element.style.removeProperty(property)
    }
    return
  }
  const variables = customThemeVariables(appearance.custom)
  for (const [property, value] of Object.entries(variables)) {
    element.style.setProperty(property, value)
  }
}

function applyToDocument(
  appearance: OrganizationAppearance,
  preferences: UserAppearancePreferences
) {
  const root = document.documentElement
  const attributes = appearanceAttributes(appearance, preferences)
  for (const [name, value] of Object.entries(attributes)) {
    root.setAttribute(name, value)
  }
  applyCustomTheme(root, appearance)
}

export function AppearanceProvider({
  initialAppearance,
  userId,
  children,
}: {
  initialAppearance: OrganizationAppearance
  userId: string
  children: React.ReactNode
}) {
  const [organization, setOrganization] = React.useState(initialAppearance)
  const [user, setUser] = React.useState<UserAppearancePreferences>(
    DEFAULT_USER_PREFERENCES
  )
  const [loaded, setLoaded] = React.useState(false)

  // Injected into the server-rendered HTML (not rendered by React on the
  // client) so the first paint already has the right theme and accessibility
  // attributes. A plain <script> in the component tree would never execute
  // during client-side navigation and logs a React warning.
  useServerInsertedHTML(() => (
    <script
      suppressHydrationWarning
      dangerouslySetInnerHTML={{
        __html: appearanceBootScript(initialAppearance, userId),
      }}
    />
  ))

  React.useEffect(() => {
    setOrganization(initialAppearance)
  }, [initialAppearance])

  React.useEffect(() => {
    setUser(readPreferences(userId))
    setLoaded(true)
  }, [userId])

  React.useEffect(() => {
    if (!loaded) return
    applyToDocument(organization, user)
  }, [loaded, organization, user])

  // Leaving the workspace (e.g. navigating to the marketing site) must not
  // leak the organization theme or the user's contrast/motion attributes.
  React.useEffect(() => {
    return () => {
      const root = document.documentElement
      root.removeAttribute("data-org-theme")
      root.removeAttribute("data-motion-level")
      root.removeAttribute("data-motion")
      root.removeAttribute("data-contrast")
      for (const effect of ANIMATION_EFFECTS) {
        root.removeAttribute(EFFECT_ATTRIBUTES[effect])
      }
      for (const property of MANAGED_CUSTOM_PROPERTIES) {
        root.style.removeProperty(property)
      }
    }
  }, [])

  React.useEffect(() => {
    if (!loaded) return
    try {
      window.localStorage.setItem(storageKey(userId), JSON.stringify(user))
    } catch {
      // Storage can be unavailable (private mode); preferences stay in memory.
    }
  }, [loaded, user, userId])

  const setUserPreferences = React.useCallback(
    (patch: Partial<UserAppearancePreferences>) => {
      setUser((previous) => ({ ...previous, ...patch }))
    },
    []
  )

  const resetUserPreferences = React.useCallback(() => {
    setUser(DEFAULT_USER_PREFERENCES)
  }, [])

  const value = React.useMemo<AppearanceContextValue>(
    () => ({
      organization,
      setOrganizationAppearance: setOrganization,
      user,
      setUserPreferences,
      resetUserPreferences,
    }),
    [organization, user, setUserPreferences, resetUserPreferences]
  )

  const attributes = appearanceAttributes(organization, user)
  const customStyle =
    organization.theme === "custom"
      ? (customThemeVariables(organization.custom) as React.CSSProperties)
      : undefined

  return (
    <AppearanceContext.Provider value={value}>
      <div className="contents" style={customStyle} {...attributes}>
        {children}
      </div>
    </AppearanceContext.Provider>
  )
}

export function useAppearance(): AppearanceContextValue {
  const context = React.useContext(AppearanceContext)
  if (!context) {
    throw new Error("useAppearance must be used within <AppearanceProvider>")
  }
  return context
}
