import { toNextJsHandler } from "better-auth/next-js"

import { auth } from "@/lib/auth"

const handler = toNextJsHandler(auth)

/** Better Auth answers 429 with `X-Retry-After`; mirror it to the standard header. */
async function withRetryAfter(response: Response): Promise<Response> {
  const retryAfter = response.headers.get("X-Retry-After")
  if (retryAfter) response.headers.set("Retry-After", retryAfter)
  return response
}

export const GET = async (request: Request) =>
  withRetryAfter(await handler.GET(request))
export const POST = async (request: Request) =>
  withRetryAfter(await handler.POST(request))
