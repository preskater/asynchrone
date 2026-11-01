import { getTranslations } from "next-intl/server"
import type { ZodType } from "zod"
import type { $ZodErrorMap } from "zod/v4/core"

import { zodErrorMap } from "@workspace/i18n/zod"

/**
 * Server-only zod parse that localizes validation messages through the
 * `Errors.validationMessages` catalog. Use from server actions (locale-scoped)
 * in place of `schema.parse(input)`.
 *
 * Falls back to zod's default (English) messages when no locale is available
 * (e.g. the action was invoked without the next-intl locale header) so a
 * missing locale never turns a validation error into a 500.
 */
export async function parseLocalized<T>(
  schema: ZodType<T>,
  input: unknown
): Promise<T> {
  let errorMap: $ZodErrorMap | undefined
  try {
    const t = await getTranslations("Errors.validationMessages")
    errorMap = zodErrorMap((key, values) => t(key as never, values as never))
  } catch {
    errorMap = undefined
  }
  return errorMap
    ? schema.parse(input, { error: errorMap })
    : schema.parse(input)
}
