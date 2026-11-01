import { createTwoFactorAudit } from "@workspace/auth/two-factor-audit"

import { prisma } from "@/lib/prisma"

export const { recordTwoFactorChange } = createTwoFactorAudit(prisma)
export { twoFactorAuditAction } from "@workspace/auth/two-factor-audit"
