import { apiJson, withApiToken } from "@/lib/api/v1"
import { ApiTokenInfoSchema } from "@/lib/api/schemas"
import { prisma } from "@/lib/prisma"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** The calling token, its owner and its organization; needs no scope. */
export const GET = withApiToken("/api/v1/token", null, async (token) => {
  const organization = await prisma.organization.findUniqueOrThrow({
    where: { id: token.ctx.organizationId },
    select: { id: true, name: true, slug: true },
  })
  return apiJson(
    ApiTokenInfoSchema.parse({
      prefix: token.prefix,
      scopes: token.scopes,
      expiresAt: token.expiresAt.toISOString(),
      user: {
        id: token.ctx.userId,
        name: token.ctx.userName,
        email: token.ctx.userEmail,
      },
      organization,
    })
  )
})
