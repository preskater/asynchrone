"use client"

import { useTranslations } from "next-intl"

/**
 * Translated labels for audit actions and target types. Rows written by older
 * releases (or by a module that has not added its label yet) fall back to the
 * raw database value instead of rendering a missing-key error.
 */
export function useAuditLabels() {
  const t = useTranslations("Audit")

  return {
    action: (value: string): string => {
      const key = `actions.${value}`
      return t.has(key as never) ? t(key as never) : value
    },
    entity: (value: string): string => {
      const key = `entities.${value}`
      return t.has(key as never) ? t(key as never) : value
    },
  }
}
