/**
 * Model prices in USD per million tokens, which is also micro-USD per token.
 * Cost is stored on each `AiUsageEvent`, so editing a price never rewrites
 * history; add a model here before switching `ASSISTANT_MODEL` (or
 * `DEFAULT_ASSISTANT_MODEL`) to it.
 */
export interface ModelPrice {
  input: number
  cachedInput: number
  output: number
}

// ponytail: list prices copied by hand from openai.com/api/pricing; re-check on every model change.
export const MODEL_PRICES: Record<string, ModelPrice> = {
  "gpt-4o-mini": { input: 0.15, cachedInput: 0.075, output: 0.6 },
  "gpt-4o": { input: 2.5, cachedInput: 1.25, output: 10 },
  "gpt-4.1-nano": { input: 0.1, cachedInput: 0.025, output: 0.4 },
  "gpt-4.1-mini": { input: 0.4, cachedInput: 0.1, output: 1.6 },
  "gpt-4.1": { input: 2, cachedInput: 0.5, output: 8 },
}

/** Unknown models are billed at the most expensive known rate so a quota can't be bypassed. */
export const FALLBACK_PRICE: ModelPrice = {
  input: Math.max(...Object.values(MODEL_PRICES).map((p) => p.input)),
  cachedInput: Math.max(
    ...Object.values(MODEL_PRICES).map((p) => p.cachedInput)
  ),
  output: Math.max(...Object.values(MODEL_PRICES).map((p) => p.output)),
}

/** Matches dated snapshots (`gpt-4o-mini-2024-07-18`) to their base model. */
export function priceFor(model: string): ModelPrice {
  const name = model.toLowerCase()
  const match = Object.keys(MODEL_PRICES)
    .filter((key) => name === key || name.startsWith(`${key}-`))
    .sort((a, b) => b.length - a.length)[0]
  return match ? MODEL_PRICES[match]! : FALLBACK_PRICE
}

export interface TokenUsage {
  inputTokens: number
  outputTokens: number
  /** Subset of `inputTokens` served from the provider's prompt cache. */
  cachedTokens: number
}

export function costMicros(model: string, usage: TokenUsage): number {
  const price = priceFor(model)
  const cached = Math.min(usage.cachedTokens, usage.inputTokens)
  return Math.ceil(
    (usage.inputTokens - cached) * price.input +
      cached * price.cachedInput +
      usage.outputTokens * price.output
  )
}
