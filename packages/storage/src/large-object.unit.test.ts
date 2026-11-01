import { describe, expect, it } from "vitest"

import {
  createLargeObjectStore,
  MaxBytesExceededError,
  type LargeObjectPool,
} from "./large-object"

/** A pool that fails the test if the store tries to open a connection. */
const pool: LargeObjectPool = {
  connect: async () => {
    throw new Error("the store must validate before connecting")
  },
} as unknown as LargeObjectPool

describe("createLargeObjectStore", () => {
  it("rejects a missing oid before acquiring a connection", async () => {
    const store = createLargeObjectStore(pool)
    await expect(store.open(0)).rejects.toThrow(/large object id/)
    await expect(store.append(0, Buffer.from("x"))).rejects.toThrow(
      /large object id/
    )
    await expect(store.hash(0)).rejects.toThrow(/large object id/)
  })

  it("treats unlinking a missing oid as success", async () => {
    await expect(
      createLargeObjectStore(pool).unlink(0)
    ).resolves.toBeUndefined()
  })

  it("describes the byte cap", () => {
    expect(new MaxBytesExceededError(1024).message).toBe(
      "Upload exceeds the maximum allowed size of 1024 bytes."
    )
  })
})
