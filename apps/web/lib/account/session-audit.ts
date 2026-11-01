import { createSessionAudit } from "@workspace/auth/session-audit"

import { prisma } from "@/lib/prisma"

export const { recordSessionRevocation } = createSessionAudit(prisma)
export { sessionAuditAction } from "@workspace/auth/session-audit"
