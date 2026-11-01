"use client"

import * as React from "react"
import { CheckIcon } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { cn } from "@workspace/ui/lib/utils"

export const LABEL_COLOR_PALETTE = [
  "#ef4444",
  "#f97316",
  "#f59e0b",
  "#eab308",
  "#84cc16",
  "#22c55e",
  "#10b981",
  "#14b8a6",
  "#06b6d4",
  "#3b82f6",
  "#6366f1",
  "#8b5cf6",
  "#a855f7",
  "#d946ef",
  "#ec4899",
  "#f43f5e",
] as const

const HEX_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

function normalize(hex: string) {
  const value = hex.trim()

  if (/^#[0-9a-fA-F]{3}$/.test(value)) {
    return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`.toLowerCase()
  }

  return value.toLowerCase()
}

export function LabelColorPicker({
  value,
  onChange,
}: {
  value: string
  onChange: (color: string) => void
}) {
  const [custom, setCustom] = React.useState(value)
  const isPaletteColor = LABEL_COLOR_PALETTE.includes(
    value as (typeof LABEL_COLOR_PALETTE)[number]
  )
  const customValid = HEX_PATTERN.test(custom.trim())

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-8 gap-2">
        {LABEL_COLOR_PALETTE.map((option) => {
          const selected = normalize(value) === option
          return (
            <button
              key={option}
              type="button"
              aria-pressed={selected}
              onClick={() => {
                setCustom(option)
                onChange(option)
              }}
              className="flex size-7 items-center justify-center rounded-full ring-offset-2 ring-offset-background transition-shadow data-[selected=true]:ring-2 data-[selected=true]:ring-ring"
              data-selected={selected}
              style={{ backgroundColor: option }}
            >
              {selected ? (
                <CheckIcon className="size-3.5 text-white drop-shadow" />
              ) : null}
            </button>
          )
        })}
      </div>

      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="size-7 shrink-0 rounded-full border"
          style={{
            backgroundColor: customValid ? custom.trim() : "transparent",
          }}
        />
        <Input
          value={custom}
          spellCheck={false}
          aria-label="Custom color"
          placeholder="#6366f1"
          onChange={(event) => {
            const next = event.target.value
            setCustom(next)
            if (HEX_PATTERN.test(next.trim())) {
              onChange(normalize(next))
            }
          }}
          className={cn(
            "font-mono",
            custom.length > 0 && !customValid && "border-destructive"
          )}
        />
        <input
          type="color"
          aria-label="Pick a custom color"
          value={customValid ? normalize(custom) : "#6366f1"}
          onChange={(event) => {
            setCustom(event.target.value)
            onChange(event.target.value)
          }}
          className="size-7 shrink-0 cursor-pointer rounded-md border bg-transparent"
        />
      </div>

      {!isPaletteColor && custom.length > 0 && !customValid ? (
        <p className="text-xs text-destructive">
          Enter a hex color like #6366f1.
        </p>
      ) : null}
    </div>
  )
}
