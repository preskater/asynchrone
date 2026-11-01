/**
 * Organization appearance: theme, animation level and individual effects.
 *
 * The configuration is stored as a JSON object on `Organization.metadata`
 * (alongside the billing `plan`) so no schema migration is required and
 * Better Auth's organization payload keeps working unchanged.
 */

export const ORG_THEMES = [
  { id: "default", swatches: ["#171717", "#f5f5f5"] },
  { id: "ocean", swatches: ["#0b6e99", "#38bdf8"] },
  { id: "forest", swatches: ["#15803d", "#84cc16"] },
  { id: "sunset", swatches: ["#ea580c", "#db2777"] },
  { id: "berry", swatches: ["#7c3aed", "#db2777"] },
  { id: "nord", swatches: ["#5e81ac", "#88c0d0"] },
  { id: "coffee", swatches: ["#92400e", "#d97706"] },
  { id: "cyberpunk", swatches: ["#d946ef", "#22d3ee"] },
  { id: "candy", swatches: ["#ec4899", "#fb7185"] },
  { id: "mono", swatches: ["#171717", "#a3a3a3"] },
  { id: "custom", swatches: ["#0f766e", "#f59e0b"] },
] as const

export type OrgThemeId = (typeof ORG_THEMES)[number]["id"]

export const ANIMATION_LEVELS = ["basic", "fluid", "fantastic"] as const
export type AnimationLevel = (typeof ANIMATION_LEVELS)[number]

export const ANIMATION_EFFECTS = [
  "hoverLift",
  "hoverGlow",
  "pressRipple",
  "pressBounce",
  "shineSweep",
  "floatBadges",
  "priorityFire",
  "ambientGlow",
] as const

export type AnimationEffect = (typeof ANIMATION_EFFECTS)[number]

export type AnimationEffects = Record<AnimationEffect, boolean>

/** DOM attribute that toggles each effect in `globals.css`. */
export const EFFECT_ATTRIBUTES: Record<AnimationEffect, string> = {
  hoverLift: "data-fx-lift",
  hoverGlow: "data-fx-glow",
  pressRipple: "data-fx-ripple",
  pressBounce: "data-fx-bounce",
  shineSweep: "data-fx-shine",
  floatBadges: "data-fx-float",
  priorityFire: "data-fx-fire",
  ambientGlow: "data-fx-ambient",
}

export interface CustomTheme {
  /** Main brand color (buttons, links, focus rings). */
  primary: string
  /** Secondary highlight color (charts, accents, ambient glow). */
  accent: string
  /** Border radius in rem (0 – 2). */
  radius: number
}

export interface OrganizationAppearance {
  theme: OrgThemeId
  custom: CustomTheme
  animations: {
    level: AnimationLevel
    effects: AnimationEffects
  }
}

export const DEFAULT_EFFECTS: AnimationEffects = {
  hoverLift: true,
  hoverGlow: true,
  pressRipple: false,
  pressBounce: true,
  shineSweep: false,
  floatBadges: false,
  priorityFire: true,
  ambientGlow: false,
}

export const DEFAULT_APPEARANCE: OrganizationAppearance = {
  theme: "default",
  custom: { primary: "#0f766e", accent: "#f59e0b", radius: 0.625 },
  animations: { level: "fluid", effects: DEFAULT_EFFECTS },
}

/** Quick "mood" presets shown in the organization settings screen. */
export const EFFECT_PRESETS = [
  {
    id: "minimal",
    effects: {
      hoverLift: false,
      hoverGlow: false,
      pressRipple: false,
      pressBounce: false,
      shineSweep: false,
      floatBadges: false,
      priorityFire: false,
      ambientGlow: false,
    },
  },
  {
    id: "classic",
    effects: {
      hoverLift: true,
      hoverGlow: false,
      pressRipple: false,
      pressBounce: true,
      shineSweep: false,
      floatBadges: false,
      priorityFire: true,
      ambientGlow: false,
    },
  },
  {
    id: "playful",
    effects: {
      hoverLift: true,
      hoverGlow: true,
      pressRipple: false,
      pressBounce: true,
      shineSweep: true,
      floatBadges: true,
      priorityFire: true,
      ambientGlow: false,
    },
  },
  {
    id: "neon",
    effects: {
      hoverLift: true,
      hoverGlow: true,
      pressRipple: false,
      pressBounce: false,
      shineSweep: true,
      floatBadges: false,
      priorityFire: true,
      ambientGlow: true,
    },
  },
  {
    id: "arcade",
    effects: {
      hoverLift: true,
      hoverGlow: true,
      pressRipple: true,
      pressBounce: true,
      shineSweep: true,
      floatBadges: true,
      priorityFire: true,
      ambientGlow: false,
    },
  },
  {
    id: "chaos",
    effects: {
      hoverLift: true,
      hoverGlow: true,
      pressRipple: true,
      pressBounce: true,
      shineSweep: true,
      floatBadges: true,
      priorityFire: true,
      ambientGlow: true,
    },
  },
] as const satisfies ReadonlyArray<{
  id: string
  effects: AnimationEffects
}>

export type EffectPresetId = (typeof EFFECT_PRESETS)[number]["id"]

const HEX_COLOR = /^#[0-9a-f]{6}$/i

export function isHexColor(value: unknown): value is string {
  return typeof value === "string" && HEX_COLOR.test(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isThemeId(value: unknown): value is OrgThemeId {
  return (
    typeof value === "string" && ORG_THEMES.some((theme) => theme.id === value)
  )
}

function isAnimationLevel(value: unknown): value is AnimationLevel {
  return (
    typeof value === "string" &&
    (ANIMATION_LEVELS as readonly string[]).includes(value)
  )
}

/**
 * Normalises untrusted JSON (from `Organization.metadata`) into a complete
 * configuration. Unknown/invalid fields fall back to the defaults so theme
 * changes can never break the workspace.
 */
export function normalizeOrganizationAppearance(
  value: unknown
): OrganizationAppearance {
  const record = isRecord(value) ? value : {}
  const customRecord = isRecord(record.custom) ? record.custom : {}
  const animationsRecord = isRecord(record.animations) ? record.animations : {}
  const effectsRecord = isRecord(animationsRecord.effects)
    ? animationsRecord.effects
    : {}

  const effects = ANIMATION_EFFECTS.reduce((acc, effect) => {
    acc[effect] =
      typeof effectsRecord[effect] === "boolean"
        ? (effectsRecord[effect] as boolean)
        : DEFAULT_EFFECTS[effect]
    return acc
  }, {} as AnimationEffects)

  return {
    theme: isThemeId(record.theme) ? record.theme : DEFAULT_APPEARANCE.theme,
    custom: {
      primary: isHexColor(customRecord.primary)
        ? customRecord.primary
        : DEFAULT_APPEARANCE.custom.primary,
      accent: isHexColor(customRecord.accent)
        ? customRecord.accent
        : DEFAULT_APPEARANCE.custom.accent,
      radius:
        typeof customRecord.radius === "number" &&
        Number.isFinite(customRecord.radius)
          ? Math.min(2, Math.max(0, customRecord.radius))
          : DEFAULT_APPEARANCE.custom.radius,
    },
    animations: {
      level: isAnimationLevel(animationsRecord.level)
        ? animationsRecord.level
        : DEFAULT_APPEARANCE.animations.level,
      effects,
    },
  }
}

/** Reads `metadata.appearance` from a Prisma `Organization.metadata` string. */
export function parseOrganizationAppearance(
  metadata: string | null
): OrganizationAppearance {
  if (!metadata) return DEFAULT_APPEARANCE
  try {
    const parsed = JSON.parse(metadata) as unknown
    if (!isRecord(parsed)) return DEFAULT_APPEARANCE
    return normalizeOrganizationAppearance(parsed.appearance)
  } catch {
    return DEFAULT_APPEARANCE
  }
}

/** Plain JSON object that can be merged back into `Organization.metadata`. */
export function parseOrganizationMetadata(
  metadata: string | null
): Record<string, unknown> {
  if (!metadata) return {}
  try {
    const parsed = JSON.parse(metadata) as unknown
    return isRecord(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace("#", "")
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ]
}

/** Black or white, whichever is readable on the given background. */
export function readableForeground(hex: string): string {
  const [r, g, b] = hexToRgb(hex)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.62 ? "#0a0a0a" : "#ffffff"
}

/**
 * CSS custom properties for the custom theme. The shared `[data-org-theme]`
 * rules in `globals.css` derive surfaces, borders and shadows from these.
 */
export function customThemeVariables(
  custom: CustomTheme
): Record<string, string> {
  const onPrimary = readableForeground(custom.primary)
  return {
    "--theme-primary": custom.primary,
    "--theme-accent": custom.accent,
    "--theme-on-primary": onPrimary,
    "--radius": `${custom.radius}rem`,
  }
}

/** DOM attributes consumed by the animation/contrast CSS. */
export function appearanceAttributes(
  appearance: OrganizationAppearance,
  options: { highContrast: boolean; disableAnimations: boolean }
): Record<string, string> {
  const attributes: Record<string, string> = {
    "data-org-theme": appearance.theme,
    "data-motion-level": appearance.animations.level,
    "data-motion": options.disableAnimations ? "off" : "on",
    "data-contrast": options.highContrast ? "high" : "normal",
  }
  for (const effect of ANIMATION_EFFECTS) {
    attributes[EFFECT_ATTRIBUTES[effect]] = appearance.animations.effects[
      effect
    ]
      ? "on"
      : "off"
  }
  return attributes
}
