"use client"

import * as React from "react"
import {
  AccessibilityIcon,
  ContrastIcon,
  MonitorIcon,
  MoonIcon,
  SunIcon,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { useTheme } from "next-themes"

import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"

import { useAppearance } from "@workspace/app-shell/appearance"

const MODES = [
  { id: "light", icon: SunIcon },
  { id: "dark", icon: MoonIcon },
  { id: "system", icon: MonitorIcon },
] as const

export function UserAppearanceCard() {
  const t = useTranslations("Appearance")
  const { organization, user, setUserPreferences, resetUserPreferences } =
    useAppearance()
  const { theme: mode, setTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => {
    setMounted(true)
  }, [])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AccessibilityIcon className="size-4" />
          {t("userTitle")}
        </CardTitle>
        <CardDescription>{t("userDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          <Field>
            <FieldLabel>{t("colorMode")}</FieldLabel>
            <div
              role="group"
              aria-label={t("colorMode")}
              className="flex flex-wrap gap-2"
            >
              {MODES.map((option) => {
                const Icon = option.icon
                const selected = mounted && mode === option.id
                return (
                  <Button
                    key={option.id}
                    type="button"
                    size="sm"
                    variant={selected ? "default" : "outline"}
                    aria-pressed={selected}
                    onClick={() => setTheme(option.id)}
                  >
                    <Icon />
                    {t(`modes.${option.id}`)}
                  </Button>
                )
              })}
            </div>
            <FieldDescription>{t("colorModeDescription")}</FieldDescription>
          </Field>

          <Field orientation="horizontal">
            <Checkbox
              id="user-high-contrast"
              checked={user.highContrast}
              onCheckedChange={(checked) =>
                setUserPreferences({ highContrast: checked === true })
              }
            />
            <FieldLabel htmlFor="user-high-contrast">
              <ContrastIcon className="size-4" />
              {t("highContrast")}
            </FieldLabel>
          </Field>
          <FieldDescription>{t("highContrastDescription")}</FieldDescription>

          <Field orientation="horizontal">
            <Checkbox
              id="user-disable-animations"
              checked={user.disableAnimations}
              onCheckedChange={(checked) =>
                setUserPreferences({ disableAnimations: checked === true })
              }
            />
            <FieldLabel htmlFor="user-disable-animations">
              {t("reduceMotion")}
            </FieldLabel>
          </Field>
          <FieldDescription>{t("reduceMotionDescription")}</FieldDescription>

          <FieldDescription>
            {t("currentWorkspaceLook", {
              theme: t(`themes.${organization.theme}`),
              level: t(`levels.${organization.animations.level}`),
            })}
          </FieldDescription>

          <Field orientation="horizontal">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={resetUserPreferences}
            >
              {t("resetPreferences")}
            </Button>
          </Field>
        </FieldGroup>
      </CardContent>
    </Card>
  )
}
