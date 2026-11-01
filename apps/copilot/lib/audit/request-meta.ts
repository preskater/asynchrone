/**
 * Copilot binds the shared request-metadata helpers; the implementation lives
 * in `@workspace/audit` so every app stores the same columns.
 */
export {
  EMPTY_REQUEST_META,
  ipFromHeaders,
  requestMetaFromHeaders,
  type RequestMeta,
} from "@workspace/audit"
