import { createHash } from "node:crypto"
import { Readable, Transform } from "node:stream"
import { pipeline } from "node:stream/promises"

import { LargeObject, LargeObjectManager } from "pg-large-object"
import type { LargeObjectManagerSettings } from "pg-large-object"
import type { Pool, PoolClient } from "pg"

/**
 * PostgreSQL large objects.
 *
 * The files app owns the bytes: `asynchrone_files` stores them as large
 * objects, and this package is the engine it runs. Every operation receives
 * the owning app's pool, so no other app opens a files database connection.
 *
 * Each operation acquires a single connection from the pool and runs inside
 * one transaction (`BEGIN` … `COMMIT`/`ROLLBACK`). Large-object calls are
 * connection-scoped server state, so they must never go through
 * `pool.query()` (which may pick a different connection) — always
 * `pool.connect()` and reuse the same `client` for the whole transfer.
 *
 * The buffer size should be divisible by 2048 (`LOBLKSIZE`, the default page
 * size). 1 MiB keeps the per-connection memory small while amortising round
 * trips for large transfers.
 */
export const LARGE_OBJECT_BUFFER_SIZE = 1024 * 1024

export interface UploadedLargeObject {
  oid: number
  size: number
  sha256: string
}

export interface OpenedLargeObject {
  size: number
  stream: Readable
}

/** The slice of a `pg.Pool` the store needs; a per-app pool is enough. */
export type LargeObjectPool = Pick<Pool, "connect">

export class MaxBytesExceededError extends Error {
  constructor(readonly maxBytes: number) {
    super(`Upload exceeds the maximum allowed size of ${maxBytes} bytes.`)
    this.name = "MaxBytesExceededError"
  }
}

export interface LargeObjectStore {
  /** Stream `readable` into a freshly created large object. */
  upload(
    readable: Readable,
    options?: { maxBytes?: number }
  ): Promise<UploadedLargeObject>
  /** Open a large object and stream its bytes. */
  open(oid: number): Promise<OpenedLargeObject>
  /** Unlink (delete) a large object; missing objects are treated as success. */
  unlink(oid: number): Promise<void>
  /** Create an empty large object and return its oid. */
  create(): Promise<number>
  /** Append a chunk to the end of a large object and return its new size. */
  append(oid: number, chunk: Buffer): Promise<number>
  /** Read the whole object back to recompute its size and SHA-256. */
  hash(oid: number): Promise<{ size: number; sha256: string }>
}

function asPgClient(client: PoolClient): LargeObjectManagerSettings {
  // `PoolClient` and `pg.Client` are distinct types in @types/pg but expose the
  // same `query` surface the manager relies on.
  return { pg: client as unknown as LargeObjectManagerSettings["pg"] }
}

async function rollback(client: PoolClient): Promise<void> {
  try {
    await client.query("ROLLBACK")
  } catch {
    // The connection may already be broken; releasing it is best effort.
  }
}

function isMissingLargeObject(error: unknown): boolean {
  if (!error || typeof error !== "object") return false
  const code = (error as { code?: string }).code
  if (code === "42704") return true
  const message = (error as { message?: string }).message ?? ""
  return /large object \d+ does not exist/i.test(message)
}

/**
 * Bind the large-object engine to one app's pool.
 *
 * The files app passes its own pool; tests and other callers can pass any
 * structurally compatible pool. Nothing here reads another app's database.
 */
export function createLargeObjectStore(
  pool: LargeObjectPool
): LargeObjectStore {
  async function upload(
    readable: Readable,
    options: { maxBytes?: number } = {}
  ): Promise<UploadedLargeObject> {
    const { maxBytes } = options
    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      const manager = new LargeObjectManager(asPgClient(client))
      const [oid, writeStream] = await manager.createAndWritableStreamAsync(
        LARGE_OBJECT_BUFFER_SIZE
      )

      const hash = createHash("sha256")
      let size = 0
      const meter = new Transform({
        transform(chunk: Buffer, _encoding, callback) {
          size += chunk.length
          if (maxBytes !== undefined && size > maxBytes) {
            callback(new MaxBytesExceededError(maxBytes))
            return
          }
          hash.update(chunk)
          callback(null, chunk)
        },
      })

      await pipeline(readable, meter, writeStream)

      await client.query("COMMIT")

      return { oid, size, sha256: hash.digest("hex") }
    } catch (error) {
      await rollback(client)
      throw error
    } finally {
      client.release()
    }
  }

  /**
   * Open a large object and stream its bytes.
   *
   * The returned stream keeps one pooled connection (and its transaction) open
   * until it ends. Commit happens on `end`; an error or an early `close` (e.g.
   * the HTTP client aborted the download) rolls the transaction back and
   * releases the connection.
   */
  async function open(oid: number): Promise<OpenedLargeObject> {
    if (!oid) throw new Error("A large object id is required.")

    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      const manager = new LargeObjectManager(asPgClient(client))
      const [rawSize, stream] = await manager.openAndReadableStreamAsync(
        oid,
        LARGE_OBJECT_BUFFER_SIZE
      )
      // `lo_lseek64`/`lo_tell64` are bigint and node-postgres returns int8 as
      // a string; normalise to a number so callers get a real size.
      const size = Number(rawSize)

      let settled = false
      const finalize = (commit: boolean) => {
        if (settled) return
        settled = true
        if (commit) {
          client
            .query("COMMIT")
            .catch(() => undefined)
            .finally(() => client.release())
        } else {
          // A read error or a client abort leaves the transaction unusable; the
          // rollback (or release) discards the open handle and its snapshot.
          rollback(client).finally(() => client.release())
        }
      }

      stream.on("end", () => finalize(true))
      stream.on("error", () => finalize(false))
      stream.on("close", () => finalize(false))

      return { size, stream }
    } catch (error) {
      await rollback(client)
      client.release()
      throw error
    }
  }

  async function unlink(oid: number): Promise<void> {
    if (!oid) return

    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      const manager = new LargeObjectManager(asPgClient(client))
      await manager.unlinkAsync(oid)
      await client.query("COMMIT")
    } catch (error) {
      await rollback(client)
      if (isMissingLargeObject(error)) {
        console.warn(`[large-object] large object ${oid} already removed`)
        return
      }
      throw error
    } finally {
      client.release()
    }
  }

  async function create(): Promise<number> {
    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      const manager = new LargeObjectManager(asPgClient(client))
      const oid = await manager.createAsync()
      await client.query("COMMIT")
      return oid
    } catch (error) {
      await rollback(client)
      throw error
    } finally {
      client.release()
    }
  }

  async function append(oid: number, chunk: Buffer): Promise<number> {
    if (!oid) throw new Error("A large object id is required.")

    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      const manager = new LargeObjectManager(asPgClient(client))
      const object = await manager.openAsync(oid, LargeObjectManager.READWRITE)
      let size: number
      try {
        await object.seekAsync(0, LargeObject.SEEK_END)
        await object.writeAsync(chunk)
        // `write` advances the position to the new end of the object.
        size = Number(await object.tellAsync())
        await object.closeAsync()
      } catch (error) {
        await object.closeAsync().catch(() => undefined)
        throw error
      }
      await client.query("COMMIT")
      return size
    } catch (error) {
      await rollback(client)
      throw error
    } finally {
      client.release()
    }
  }

  async function hash(oid: number): Promise<{ size: number; sha256: string }> {
    if (!oid) throw new Error("A large object id is required.")

    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      const manager = new LargeObjectManager(asPgClient(client))
      const [rawSize, stream] = await manager.openAndReadableStreamAsync(
        oid,
        LARGE_OBJECT_BUFFER_SIZE
      )
      const size = Number(rawSize)
      const digest = createHash("sha256")

      await new Promise<void>((resolve, reject) => {
        let settled = false
        const done = (error?: Error) => {
          if (settled) return
          settled = true
          if (error) reject(error)
          else resolve()
        }
        stream.on("data", (chunk: Buffer) => digest.update(chunk))
        stream.on("end", () => done())
        stream.on("error", (error: Error) => done(error))
        stream.on("close", () => done())
      })

      await client.query("COMMIT")
      return { size, sha256: digest.digest("hex") }
    } catch (error) {
      await rollback(client)
      throw error
    } finally {
      client.release()
    }
  }

  return { upload, open, unlink, create, append, hash }
}
