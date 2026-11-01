import { toCsv } from "@workspace/core/csv"
import type { RequestContext } from "@workspace/core/context"
import { toDateKey } from "../dates"
import type {
  ExportInput,
  ImportClientsInput,
  ImportContactsInput,
} from "../schemas"
import type { ClientExportResultData, ClientImportResultData } from "../types"
import { ClientsServiceCore, requireEdit, requireExport } from "./core"

export class ClientImportExportService extends ClientsServiceCore {
  async exportClient(
    ctx: RequestContext,
    input: ExportInput
  ): Promise<ClientExportResultData> {
    const access = this.accessFor(ctx)
    requireExport(access)
    const today = toDateKey(new Date())
    if (input.entity === "clients") {
      const [rows, memberRows] = await Promise.all([
        this.repo.listClients(ctx.organizationId),
        this.repo.listMembers(ctx.organizationId),
      ])
      const nameById = this.nameById(memberRows)
      const csvRows: (string | number)[][] = [
        [
          "Name",
          "Status",
          "Industry",
          "Website",
          "Phone",
          "Address",
          "Contact email",
          "Source",
          "Owner",
          "Active",
          "Created",
        ],
      ]
      for (const row of rows) {
        if (row.deletedAt) continue
        csvRows.push([
          row.name,
          row.status,
          row.industry ?? "",
          row.website ?? "",
          row.phone ?? "",
          row.address ?? "",
          row.contactEmail ?? "",
          row.source ?? "",
          row.ownerId ? (nameById.get(row.ownerId) ?? "") : "",
          row.isActive ? "yes" : "no",
          toDateKey(row.createdAt),
        ])
      }
      return {
        filename: `asynchrone-space-clients-${today}.csv`,
        content: toCsv(csvRows),
      }
    }

    if (input.entity === "contacts") {
      const [rows, memberRows] = await Promise.all([
        this.repo.listContacts(ctx.organizationId),
        this.repo.listMembers(ctx.organizationId),
      ])
      const nameById = this.nameById(memberRows)
      const csvRows: (string | number)[][] = [
        [
          "First name",
          "Last name",
          "Email",
          "Phone",
          "Job title",
          "Companies",
          "Owner",
          "Created",
        ],
      ]
      for (const row of rows) {
        if (row.deletedAt) continue
        csvRows.push([
          row.firstName,
          row.lastName,
          row.email ?? "",
          row.phone ?? "",
          row.jobTitle ?? "",
          row.companies.map((link) => link.client.name).join(", "),
          row.ownerId ? (nameById.get(row.ownerId) ?? "") : "",
          toDateKey(row.createdAt),
        ])
      }
      return {
        filename: `asynchrone-space-contacts-${today}.csv`,
        content: toCsv(csvRows),
      }
    }

    const [rows, memberRows] = await Promise.all([
      this.repo.listDeals(ctx.organizationId),
      this.repo.listMembers(ctx.organizationId),
    ])
    const nameById = this.nameById(memberRows)
    const csvRows: (string | number)[][] = [
      [
        "Name",
        "Company",
        "Stage",
        "Status",
        "Amount",
        "Currency",
        "Probability",
        "Expected close",
        "Actual close",
        "Loss reason",
        "Owner",
        "Created",
      ],
    ]
    for (const row of rows) {
      if (row.deletedAt) continue
      csvRows.push([
        row.name,
        row.client?.name ?? "",
        row.stage?.name ?? "",
        row.status,
        row.amount,
        row.currency,
        row.probability,
        row.expectedCloseDate ? toDateKey(row.expectedCloseDate) : "",
        row.actualCloseDate ? toDateKey(row.actualCloseDate) : "",
        row.lossReason ?? "",
        row.ownerId ? (nameById.get(row.ownerId) ?? "") : "",
        toDateKey(row.createdAt),
      ])
    }
    return {
      filename: `asynchrone-space-deals-${today}.csv`,
      content: toCsv(csvRows),
    }
  }

  async importClients(
    ctx: RequestContext,
    input: ImportClientsInput
  ): Promise<ClientImportResultData> {
    const access = this.accessFor(ctx)
    requireEdit(access)
    const existing = await this.repo.listClientNames(ctx.organizationId)
    const byName = new Map(existing.map((row) => [row.name.toLowerCase(), row]))
    const result: ClientImportResultData = {
      created: 0,
      restored: 0,
      skipped: 0,
      errors: [],
    }

    for (const [index, row] of input.rows.entries()) {
      const key = row.name.toLowerCase()
      const found = byName.get(key)
      try {
        if (found) {
          if (found.deletedAt) {
            await this.repo.setClientArchived(found.id, null)
            const updated = await this.repo.updateClient(found.id, {
              status: row.status ?? "prospect",
              industry: row.industry ?? null,
              website: row.website ?? null,
              phone: row.phone ?? null,
              address: row.address ?? null,
              contactEmail: row.contactEmail ?? null,
              description: row.description ?? null,
              source: row.source ?? null,
            })
            byName.set(key, updated)
            result.restored += 1
          } else {
            result.skipped += 1
          }
          continue
        }
        const created = await this.repo.createClient({
          organizationId: ctx.organizationId,
          name: row.name,
          status: row.status ?? "prospect",
          industry: row.industry ?? null,
          website: row.website ?? null,
          phone: row.phone ?? null,
          address: row.address ?? null,
          contactEmail: row.contactEmail ?? null,
          description: row.description ?? null,
          source: row.source ?? null,
          ownerId: null,
          isActive: true,
        })
        byName.set(key, created)
        result.created += 1
      } catch {
        result.errors.push({
          row: index + 1,
          message: "Could not be imported.",
        })
      }
    }

    await this.repo.createAudit([
      {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "client.import",
        entityType: "client",
        entityId: "import",
        after: {
          created: result.created,
          restored: result.restored,
          skipped: result.skipped,
        },
      },
    ])
    return result
  }

  async importContacts(
    ctx: RequestContext,
    input: ImportContactsInput
  ): Promise<ClientImportResultData> {
    const access = this.accessFor(ctx)
    requireEdit(access)
    const [existingEmails, clientRows] = await Promise.all([
      this.repo.listContactEmails(ctx.organizationId),
      this.repo.listClientOptions(ctx.organizationId),
    ])
    const emailSet = new Set(
      existingEmails
        .map((row) => row.email?.toLowerCase())
        .filter((email): email is string => Boolean(email))
    )
    const clientByName = new Map(
      clientRows.map((row) => [row.name.toLowerCase(), row])
    )
    const result: ClientImportResultData = {
      created: 0,
      restored: 0,
      skipped: 0,
      errors: [],
    }

    for (const [index, row] of input.rows.entries()) {
      try {
        const email = row.email?.toLowerCase()
        if (email && emailSet.has(email)) {
          result.skipped += 1
          continue
        }
        const company = row.company
          ? clientByName.get(row.company.toLowerCase())
          : undefined
        await this.repo.createContact(
          {
            organizationId: ctx.organizationId,
            firstName: row.firstName,
            lastName: row.lastName ?? "",
            email: row.email ?? null,
            phone: row.phone ?? null,
            jobTitle: row.jobTitle ?? null,
            notes: null,
            ownerId: null,
          },
          company
            ? [{ clientId: company.id, jobTitle: null, isPrimary: true }]
            : []
        )
        if (email) emailSet.add(email)
        result.created += 1
      } catch {
        result.errors.push({
          row: index + 1,
          message: "Could not be imported.",
        })
      }
    }

    await this.repo.createAudit([
      {
        organizationId: ctx.organizationId,
        actorId: ctx.userId,
        action: "contact.import",
        entityType: "contact",
        entityId: "import",
        after: { created: result.created, skipped: result.skipped },
      },
    ])
    return result
  }
}
