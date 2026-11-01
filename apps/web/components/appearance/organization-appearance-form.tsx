"use client"

import * as React from "react"
import {
  CheckIcon,
  PaletteIcon,
  SparklesIcon,
  WandSparklesIcon,
  WavesIcon,
  ZapIcon,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

import { PriorityBadge } from "@/components/task/task-badge"
import { Badge } from "@workspace/ui/components/badge"
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
  FieldLabel,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { Spinner } from "@workspace/ui/components/spinner"
import { cn } from "@workspace/ui/lib/utils"

import { updateOrganizationAppearanceAction } from "@/actions/appearance"
import {
  ANIMATION_EFFECTS,
  ANIMATION_LEVELS,
  appearanceAttributes,
  customThemeVariables,
  DEFAULT_EFFECTS,
  EFFECT_PRESETS,
  ORG_THEMES,
  type AnimationEffect,
  type AnimationEffects,
  type AnimationLevel,
  type CustomTheme,
  type OrgThemeId,
} from "@workspace/app-shell/appearance-types"
import { useAppearance } from "@workspace/app-shell/appearance"
import { unwrapActionResult } from "@workspace/core/action"
import { useErrorTranslator } from "@workspace/i18n/errors"
import { useOrgPermissions } from "@/lib/organization/use-permissions"
import { TASK_PRIORITY_VALUES } from "@/lib/projects/types"
import { useRouter } from "@workspace/i18n/navigation"

const LEVEL_ICONS: Record<
  AnimationLevel,
  React.ComponentType<{ className?: string }>
> = {
  basic: ZapIcon,
  fluid: WavesIcon,
  fantastic: SparklesIcon,
}

function copyEffects(effects: Readonly<AnimationEffects>): AnimationEffects {
  return { ...effects }
}

const PRESET_THEMES = ORG_THEMES.filter((theme) => theme.id !== "custom")

export function OrganizationAppearanceForm() {
  const t = useTranslations("Appearance")
  const te = useErrorTranslator()
  const router = useRouter()
  const permissions = useOrgPermissions()
  const { organization, setOrganizationAppearance } = useAppearance()

  const [theme, setTheme] = React.useState<OrgThemeId>(organization.theme)
  const [custom, setCustom] = React.useState<CustomTheme>(organization.custom)
  const [level, setLevel] = React.useState<AnimationLevel>(
    organization.animations.level
  )
  const [effects, setEffects] = React.useState<AnimationEffects>(
    copyEffects(organization.animations.effects)
  )
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    setTheme(organization.theme)
    setCustom(organization.custom)
    setLevel(organization.animations.level)
    setEffects(copyEffects(organization.animations.effects))
  }, [organization])

  const canEdit = permissions.canUpdateOrganization

  const previewAppearance = React.useMemo(
    () => ({
      theme,
      custom,
      animations: { level, effects },
    }),
    [theme, custom, level, effects]
  )

  const previewAttributes = appearanceAttributes(previewAppearance, {
    highContrast: false,
    disableAnimations: false,
  })

  const previewStyle =
    theme === "custom"
      ? (customThemeVariables(custom) as React.CSSProperties)
      : undefined

  function toggleEffect(effect: AnimationEffect, checked: boolean) {
    setEffects((previous) => ({ ...previous, [effect]: checked }))
  }

  function updateCustom(patch: Partial<CustomTheme>) {
    setCustom((previous) => ({ ...previous, ...patch }))
    setTheme("custom")
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    try {
      const saved = unwrapActionResult(
        await updateOrganizationAppearanceAction({
          theme,
          custom,
          animations: { level, effects },
        })
      )
      setOrganizationAppearance(saved)
      toast.success(t("saved"))
      router.refresh()
    } catch (error) {
      toast.error(te(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <PaletteIcon className="size-4" />
              {t("theme")}
            </CardTitle>
            <CardDescription>{t("themeDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <p className="text-sm font-medium">{t("presetThemes")}</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {PRESET_THEMES.map((option) => {
                  const selected = theme === option.id
                  return (
                    <button
                      key={option.id}
                      type="button"
                      disabled={!canEdit}
                      aria-pressed={selected}
                      onClick={() => setTheme(option.id)}
                      className={cn(
                        "group relative flex items-center gap-2 rounded-lg border p-2 text-start transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-60",
                        selected && "border-primary ring-2 ring-primary/30"
                      )}
                    >
                      <span
                        aria-hidden
                        className="flex size-8 shrink-0 overflow-hidden rounded-md ring-1 ring-foreground/10"
                      >
                        <span
                          className="h-full w-1/2"
                          style={{ backgroundColor: option.swatches[0] }}
                        />
                        <span
                          className="h-full w-1/2"
                          style={{ backgroundColor: option.swatches[1] }}
                        />
                      </span>
                      <span className="truncate text-sm font-medium">
                        {t(`themes.${option.id}`)}
                      </span>
                      {selected ? (
                        <CheckIcon className="ms-auto size-4 shrink-0 text-primary" />
                      ) : null}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">{t("customTheme")}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("customThemeDescription")}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant={theme === "custom" ? "default" : "outline"}
                  aria-pressed={theme === "custom"}
                  disabled={!canEdit}
                  onClick={() => setTheme("custom")}
                >
                  {theme === "custom"
                    ? t("customThemeActive")
                    : t("useCustomTheme")}
                </Button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="appearance-primary">
                    {t("primaryColor")}
                  </FieldLabel>
                  <div className="flex items-center gap-2">
                    <Input
                      id="appearance-primary"
                      type="color"
                      value={custom.primary}
                      disabled={!canEdit}
                      onChange={(event) =>
                        updateCustom({ primary: event.target.value })
                      }
                      className="h-9 w-14 shrink-0 p-1"
                    />
                    <span className="font-mono text-sm text-muted-foreground">
                      {custom.primary.toUpperCase()}
                    </span>
                  </div>
                </Field>
                <Field>
                  <FieldLabel htmlFor="appearance-accent">
                    {t("accentColor")}
                  </FieldLabel>
                  <div className="flex items-center gap-2">
                    <Input
                      id="appearance-accent"
                      type="color"
                      value={custom.accent}
                      disabled={!canEdit}
                      onChange={(event) =>
                        updateCustom({ accent: event.target.value })
                      }
                      className="h-9 w-14 shrink-0 p-1"
                    />
                    <span className="font-mono text-sm text-muted-foreground">
                      {custom.accent.toUpperCase()}
                    </span>
                  </div>
                </Field>
              </div>
              <Field>
                <FieldLabel htmlFor="appearance-radius">
                  {t("cornerRadius")}
                </FieldLabel>
                <div className="flex items-center gap-3">
                  <Input
                    id="appearance-radius"
                    type="range"
                    min={0}
                    max={2}
                    step={0.125}
                    value={custom.radius}
                    disabled={!canEdit}
                    onChange={(event) =>
                      updateCustom({ radius: Number(event.target.value) })
                    }
                  />
                  <span className="w-16 shrink-0 text-end text-sm text-muted-foreground tabular-nums">
                    {custom.radius.toFixed(3)} rem
                  </span>
                </div>
              </Field>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <WandSparklesIcon className="size-4" />
              {t("animations")}
            </CardTitle>
            <CardDescription>{t("animationsDescription")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid gap-2 sm:grid-cols-3">
              {ANIMATION_LEVELS.map((option) => {
                const Icon = LEVEL_ICONS[option]
                const selected = level === option
                return (
                  <button
                    key={option}
                    type="button"
                    disabled={!canEdit}
                    aria-pressed={selected}
                    onClick={() => setLevel(option)}
                    className={cn(
                      "flex flex-col gap-1 rounded-lg border p-3 text-start transition-colors hover:bg-muted disabled:pointer-events-none disabled:opacity-60",
                      selected && "border-primary ring-2 ring-primary/30"
                    )}
                  >
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <Icon className="size-4 text-primary" />
                      {t(`levels.${option}`)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {t(`levelDescriptions.${option}`)}
                    </span>
                  </button>
                )
              })}
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">{t("effects")}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("effectsDescription")}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={!canEdit}
                  onClick={() => setEffects(copyEffects(DEFAULT_EFFECTS))}
                >
                  {t("resetEffects")}
                </Button>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {EFFECT_PRESETS.map((preset) => (
                  <Button
                    key={preset.id}
                    type="button"
                    variant="outline"
                    size="xs"
                    disabled={!canEdit}
                    onClick={() => setEffects(copyEffects(preset.effects))}
                  >
                    {t(`presets.${preset.id}`)}
                  </Button>
                ))}
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                {ANIMATION_EFFECTS.map((effect) => {
                  const fantasticOnly =
                    effect === "priorityFire" || effect === "ambientGlow"
                  const id = `appearance-effect-${effect}`
                  return (
                    <div
                      key={effect}
                      className="flex items-start gap-3 rounded-lg border p-3"
                    >
                      <Checkbox
                        id={id}
                        checked={effects[effect]}
                        disabled={!canEdit}
                        onCheckedChange={(checked) =>
                          toggleEffect(effect, checked === true)
                        }
                      />
                      <div className="flex flex-col gap-1">
                        <label
                          htmlFor={id}
                          className="flex flex-wrap items-center gap-1.5 text-sm font-medium"
                        >
                          {t(`effectsList.${effect}.name`)}
                          {fantasticOnly ? (
                            <Badge
                              variant="outline"
                              className="h-4 px-1.5 text-[10px]"
                            >
                              {t("requiresFantastic")}
                            </Badge>
                          ) : null}
                        </label>
                        <p className="text-xs text-muted-foreground">
                          {t(`effectsList.${effect}.description`)}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("preview")}</CardTitle>
          <CardDescription>{t("previewDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div
            {...previewAttributes}
            style={previewStyle}
            className="flex flex-col gap-4 rounded-xl border bg-background p-4 text-foreground"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button">{t("previewPrimary")}</Button>
              <Button type="button" variant="outline">
                {t("previewSecondary")}
              </Button>
              <Button type="button" variant="destructive">
                {t("previewDestructive")}
              </Button>
              <Input
                placeholder={t("previewInput")}
                className="w-full sm:w-56"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {TASK_PRIORITY_VALUES.map((priority) => (
                <PriorityBadge key={priority} priority={priority} />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {canEdit ? (
        <Field orientation="horizontal">
          <Button type="submit" disabled={saving}>
            {saving ? <Spinner /> : null}
            {saving ? t("saving") : t("save")}
          </Button>
        </Field>
      ) : (
        <FieldDescription>{t("readOnly")}</FieldDescription>
      )}
    </form>
  )
}
