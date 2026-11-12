import { apiList, withApiToken } from "@/lib/api/v1"
import { ApiMemberSchema } from "@/lib/api/schemas"
import { prisma } from "@/lib/prisma"
import { parseRoles } from "@workspace/organization/roles"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Workspace members (portal accounts excluded), to resolve task assignees. */
export const GET = withApiToken(
  "/api/v1/members",
  "members:read",
  async (token) => {
    const rows = await prisma.member.findMany({
      where: { organizationId: token.ctx.organizationId, clientId: null },
      select: {
        role: true,
        user: { select: { id: true, name: true, email: true } },
      },
      orderBy: { user: { name: "asc" } },
    })
    return apiList(
      rows.map(({ role, user }) =>
        ApiMemberSchema.parse({ ...user, roles: parseRoles(role) })
      )
    )
  }
)
