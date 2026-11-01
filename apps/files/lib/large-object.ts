import {
  createLargeObjectStore,
  LARGE_OBJECT_BUFFER_SIZE,
  MaxBytesExceededError,
} from "@workspace/storage"

import { pool } from "@/lib/prisma"

/**
 * The files app's large-object adapter.
 *
 * `@workspace/storage` owns the engine; this file binds it to the pool the app
 * uses. Bytes live in PostgreSQL large objects in the same database as the file
 * metadata — there is no external object store. When the files domain moves to
 * its own database (#190/#171) only this pool changes.
 */
const store = createLargeObjectStore(pool)

/** The bound store, for packages that take the large-object port. */
export const largeObjectStore = store
export const uploadLargeObject = store.upload
export const openLargeObjectStream = store.open
export const unlinkLargeObject = store.unlink
export const createLargeObject = store.create
export const appendLargeObject = store.append
export const hashLargeObject = store.hash

export { LARGE_OBJECT_BUFFER_SIZE, MaxBytesExceededError }
