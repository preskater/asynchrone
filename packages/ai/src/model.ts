/**
 * The model the assistant runs on when `ASSISTANT_MODEL` is unset.
 *
 * It must stay in `MODEL_PRICES` (`./pricing.ts`): a model missing from that
 * table is billed at the fallback rate, which would drain an organization's AI
 * allowance faster than the real spend.
 */
export const DEFAULT_ASSISTANT_MODEL = "gpt-4o-mini"
