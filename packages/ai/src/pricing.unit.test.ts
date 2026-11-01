import { describe, expect, it } from "vitest"

import { DEFAULT_ASSISTANT_MODEL } from "./model"
import { costMicros, FALLBACK_PRICE, MODEL_PRICES, priceFor } from "./pricing"

describe("priceFor", () => {
  it("matches exact names and dated snapshots to the longest base model", () => {
    expect(priceFor("gpt-4o-mini")).toBe(MODEL_PRICES["gpt-4o-mini"])
    expect(priceFor("gpt-4o-mini-2024-07-18")).toBe(MODEL_PRICES["gpt-4o-mini"])
    expect(priceFor("GPT-4o")).toBe(MODEL_PRICES["gpt-4o"])
    expect(priceFor("gpt-4.1-mini-2025-04-14")).toBe(
      MODEL_PRICES["gpt-4.1-mini"]
    )
  })

  it("bills unknown models at the most expensive known rate", () => {
    expect(priceFor("some-new-model")).toBe(FALLBACK_PRICE)
    expect(priceFor("gpt-4omini")).toBe(FALLBACK_PRICE)
    for (const price of Object.values(MODEL_PRICES)) {
      expect(FALLBACK_PRICE.input).toBeGreaterThanOrEqual(price.input)
      expect(FALLBACK_PRICE.cachedInput).toBeGreaterThanOrEqual(
        price.cachedInput
      )
      expect(FALLBACK_PRICE.output).toBeGreaterThanOrEqual(price.output)
    }
  })

  it("prices the model the assistant runs on by default", () => {
    // A default model missing from the table would drain the AI quota at the
    // fallback rate; keep DEFAULT_ASSISTANT_MODEL listed here.
    expect(priceFor(DEFAULT_ASSISTANT_MODEL)).not.toBe(FALLBACK_PRICE)
  })
})

describe("costMicros", () => {
  it("prices input and output tokens", () => {
    // 1M input at $0.15 + 1M output at $0.60 = $0.75
    expect(
      costMicros("gpt-4o-mini", {
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
        cachedTokens: 0,
      })
    ).toBe(750_000)
  })

  it("bills cached input at the cached rate", () => {
    // 600k uncached × 0.15 + 400k cached × 0.075 = 90_000 + 30_000
    expect(
      costMicros("gpt-4o-mini", {
        inputTokens: 1_000_000,
        outputTokens: 0,
        cachedTokens: 400_000,
      })
    ).toBe(120_000)
  })

  it("never counts more cached tokens than input tokens", () => {
    expect(
      costMicros("gpt-4o-mini", {
        inputTokens: 100,
        outputTokens: 0,
        cachedTokens: 1_000,
      })
    ).toBe(
      costMicros("gpt-4o-mini", {
        inputTokens: 100,
        outputTokens: 0,
        cachedTokens: 100,
      })
    )
  })

  it("rounds fractions of a micro-dollar up", () => {
    expect(
      costMicros("gpt-4o-mini", {
        inputTokens: 1,
        outputTokens: 0,
        cachedTokens: 0,
      })
    ).toBe(1)
  })

  it("costs unknown models at the fallback rate", () => {
    expect(
      costMicros("mystery", {
        inputTokens: 1_000,
        outputTokens: 1_000,
        cachedTokens: 0,
      })
    ).toBe(
      Math.ceil(1_000 * FALLBACK_PRICE.input + 1_000 * FALLBACK_PRICE.output)
    )
  })
})
