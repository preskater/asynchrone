import { EmployeesRepository } from "@workspace/employees/repository"
import { EmployeesService } from "@workspace/employees/service"

import { recordAuditMany, withActorIdentity } from "@/lib/audit/record"
import { prisma } from "@/lib/prisma"

/**
 * App adapter for the employees domain.
 *
 * `@workspace/employees` owns the repository, service, schemas, types and UI.
 * The app binds the database client and the audit writer here; the package
 * never imports `apps/copilot`.
 */
export const employeesRepository = new EmployeesRepository(
  prisma,
  async (entries) => {
    await recordAuditMany(await withActorIdentity(entries, prisma), prisma)
    return { count: entries.length }
  }
)

export const employeesService = new EmployeesService(employeesRepository)

export { EmployeesRepository, EmployeesService }
