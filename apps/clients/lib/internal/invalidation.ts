import { revalidatePath, revalidateTag } from "next/cache"

import type { InvalidateRequest } from "@workspace/contracts"

/**
 * Apply an invalidation request from Copilot (issue #170).
 *
 * `revalidatePath` only affects this app, which is exactly why Copilot calls
 * this endpoint after a mutation that changes a read model another host
 * renders. The paths are validated by the shared handler; unknown paths are a
 * no-op in Next.js.
 */
export async function revalidateCachedReads(
  request: InvalidateRequest
): Promise<void> {
  for (const path of request.paths) {
    revalidatePath(path, "layout")
  }
  for (const tag of request.tags) {
    revalidateTag(tag, { expire: 0 })
  }
}
