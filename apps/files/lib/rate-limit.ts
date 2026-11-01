import { prisma } from "@/lib/prisma"
import {
  createRateLimiter,
  MAX_WINDOW_MS,
  type RateLimitOptions,
  type RateLimitResult,
} from "@workspace/core/rate-limit"

/**
 * App-side adapter: the limiter itself is database-agnostic in
 * `@workspace/core`; the files app binds it to the shared `rateLimit` table so
 * every replica — and Copilot — enforce the same window.
 */
const limiter = createRateLimiter(
  <T>(query: TemplateStringsArray, ...values: unknown[]) =>
    prisma.$queryRaw<T>(query, ...values)
)

export const { rateLimit, assertRateLimit } = limiter
export { MAX_WINDOW_MS }
export type { RateLimitOptions, RateLimitResult }
