import { prisma } from "@/lib/prisma"
import {
  createRateLimiter,
  MAX_WINDOW_MS,
  type RateLimitOptions,
  type RateLimitResult,
} from "@workspace/core/rate-limit"

/**
 * App-side adapter: the limiter itself is database-agnostic in
 * `@workspace/core`; Copilot binds it to the identity database's `rateLimit`
 * table so every replica shares the window.
 */
const limiter = createRateLimiter(
  <T>(query: TemplateStringsArray, ...values: unknown[]) =>
    prisma.$queryRaw<T>(query, ...values)
)

export const { rateLimit, assertRateLimit } = limiter
export { MAX_WINDOW_MS }
export type { RateLimitOptions, RateLimitResult }
