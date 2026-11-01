import { auth } from "@/lib/auth"

export const runtime = "nodejs"

export function GET(request: Request) {
  return auth.handler(request)
}

export function HEAD(request: Request) {
  return auth.handler(request)
}
