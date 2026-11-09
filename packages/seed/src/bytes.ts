import { createHash } from "node:crypto"
import { Readable } from "node:stream"

import {
  createLargeObjectStore,
  type LargeObjectPool,
} from "@workspace/storage"

export interface StoredBytes {
  oid: bigint
  sizeBytes: number
  sha256: string
}

/** Writes `text` as a large object; callers skip this for rows that already exist. */
export async function storeText(
  pool: LargeObjectPool,
  text: string
): Promise<StoredBytes> {
  const { oid, size } = await createLargeObjectStore(pool).upload(
    Readable.from([Buffer.from(text)])
  )
  return {
    oid: BigInt(oid),
    sizeBytes: size,
    sha256: createHash("sha256").update(text).digest("hex"),
  }
}
