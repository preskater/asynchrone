import {
  createLargeObjectStore,
  LARGE_OBJECT_BUFFER_SIZE,
  MaxBytesExceededError,
} from "@workspace/storage"

import { pool } from "@/lib/prisma"

/**
 * The files app's large-object adapter.
 *
 * `@workspace/storage` owns the engine; this file only binds it to the
 * identity/files pool the current deployment uses. When files moves to
 * `apps/files` it binds its own pool instead — no other app does.
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
