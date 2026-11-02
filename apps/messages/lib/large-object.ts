import { createLargeObjectStore } from "@workspace/storage"

import { pool } from "@workspace/db-messages"

/**
 * The large-object adapter for message attachments.
 *
 * `@workspace/storage` owns the engine (PostgreSQL large objects); this file
 * only binds it to the pool the app already owns. Attachments keep the same
 * upload semantics as before #162: the composer uploads through
 * `@workspace/files/upload-client`, the transient upload session returns the
 * `oid`, and the message row persists it.
 */
const store = createLargeObjectStore(pool)

/** The bound store, for the messaging runtime's attachment port. */
export const largeObjectStore = store
