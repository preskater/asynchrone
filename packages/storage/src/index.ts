/**
 * Storage primitives for file bytes.
 *
 * File bytes live in the files app's database (`asynchrone_files`) as
 * PostgreSQL large objects. This package is the engine that app runs and the
 * contract every caller binds to; it never opens a database of its own.
 *
 * Domain apps read and write bytes through the files app's internal API (see
 * `@workspace/contracts`), not by importing a files database client.
 */
export {
  LARGE_OBJECT_BUFFER_SIZE,
  MaxBytesExceededError,
  createLargeObjectStore,
  type LargeObjectPool,
  type LargeObjectStore,
  type OpenedLargeObject,
  type UploadedLargeObject,
} from "./large-object"
