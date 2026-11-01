import { z } from "zod"

import {
  ANIMATION_EFFECTS,
  ANIMATION_LEVELS,
  ORG_THEMES,
  type AnimationEffect,
} from "./types"

const themeIds = ORG_THEMES.map((theme) => theme.id) as [
  (typeof ORG_THEMES)[number]["id"],
  ...(typeof ORG_THEMES)[number]["id"][],
]

const hexColor = z.string().regex(/^#[0-9a-f]{6}$/i, "Expected a hex color")

const effectsShape = ANIMATION_EFFECTS.reduce(
  (shape, effect) => {
    shape[effect] = z.boolean()
    return shape
  },
  {} as Record<AnimationEffect, z.ZodBoolean>
)

export const customThemeSchema = z.object({
  primary: hexColor,
  accent: hexColor,
  radius: z.number().min(0).max(2),
})

export const organizationAppearanceSchema = z.object({
  theme: z.enum(themeIds),
  custom: customThemeSchema,
  animations: z.object({
    level: z.enum(ANIMATION_LEVELS),
    effects: z.object(effectsShape),
  }),
})

export type OrganizationAppearanceInput = z.infer<
  typeof organizationAppearanceSchema
>
