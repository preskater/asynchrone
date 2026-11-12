import { existsSync, readFileSync } from "node:fs"
import { dirname, resolve, sep } from "node:path"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import {
  APPS,
  CUSTOMER_APP_KEYS,
  INTERNAL_ROUTES,
  NotificationInputSchema,
  SERVICE_SCOPES,
  SearchQuerySchema,
} from "@workspace/contracts"
import { toMemberDirectoryEntry } from "@workspace/organization/directory"
import {
  DATA_EXPORT_TTL_DAYS,
  ORGANIZATION_DELETION_GRACE_DAYS,
} from "@workspace/organization/lifecycle"
import { can } from "@workspace/organization/roles"
import { NotificationService } from "@workspace/notifications"
import { notificationIdSchema } from "@workspace/notifications/schemas"
import { createSearchHandler } from "@workspace/search"
import {
  canMarkExportReady,
  createOrganizationDeletionHandler,
  createOrganizationExportHandler,
  createUserDeletionHandler,
  runOrganizationDeletionSaga,
  runUserDeletionSaga,
} from "@workspace/sagas"
import { ProjectRepository } from "@workspace/projects/repository"
import { ProjectService } from "@workspace/projects/service"
import { createTaskSchema } from "@workspace/projects/schemas"
import { CalendarRepository } from "@workspace/calendars/repository"
import { CalendarService } from "@workspace/calendars/service"
import { createEventSchema } from "@workspace/calendars/schemas"
import {
  createFilesRuntime,
  FileRepository,
  FileService,
} from "@workspace/files"
import { createFilesRuntime as createFilesRuntimeFromRuntime } from "@workspace/files/runtime"
import { MessagingRepository, MessagingService } from "@workspace/messaging"
import { sendMessageSchema } from "@workspace/messaging/schemas"
import { ClientsRepository } from "@workspace/clients/repository"
import { ClientsService } from "@workspace/clients/service"
import { resolveClientAccess } from "@workspace/clients/access"
import { clientInputSchema } from "@workspace/clients/schemas"
import { EmployeesRepository } from "@workspace/employees/repository"
import { EmployeesService } from "@workspace/employees/service"
import { resolveEmployeeAccess } from "@workspace/employees/access"
import { fetchRangeSchema } from "@workspace/employees/schemas"
import { MeetingRepository } from "@workspace/meetings/repository"
import { MeetingService } from "@workspace/meetings/service"
import { createMeetingRequestSchema } from "@workspace/meetings/schemas"
import { PortalRepository } from "@workspace/portal/repository"
import {
  PortalService,
  requireInternalMember,
  requirePortalContext,
  requirePortalManager,
} from "@workspace/portal"
import { createPortalRuntime } from "@workspace/portal/runtime"
import { createAuthSession } from "@workspace/auth/session"
import { IMPERSONATION_TTL_SECONDS } from "@workspace/auth/impersonation"
import {
  normalizeRecents,
  RECENTS_MAX_STORED,
  recentsStorageKey,
} from "@workspace/app-shell/recents-storage"

import { allMcpTools } from "@/lib/mcp/server"
import { assistantTools } from "@/lib/assistant/tools"
import { searchWorkspace } from "@/lib/search"

const root = fileURLToPath(new URL("../../../../", import.meta.url))

/** Domain packages whose public surface the contract suite pins. */
const DOMAIN_PACKAGES = [
  "app-shell",
  "auth",
  "calendars",
  "clients",
  "contracts",
  "employees",
  "files",
  "meetings",
  "messaging",
  "notifications",
  "organization",
  "portal",
  "projects",
  "sagas",
  "search",
] as const

function manifest(packageName: string) {
  const dir = resolve(root, "packages", packageName)
  return {
    dir,
    json: JSON.parse(readFileSync(resolve(dir, "package.json"), "utf8")) as {
      exports?: Record<string, unknown>
    },
  }
}

function exportTargets(value: unknown): string[] {
  if (typeof value === "string") return [value]
  if (Array.isArray(value)) return value.flatMap(exportTargets)
  if (value && typeof value === "object") {
    return Object.values(value).flatMap(exportTargets)
  }
  return []
}

describe("domain package export contract", () => {
  for (const packageName of DOMAIN_PACKAGES) {
    it(`${packageName} publishes only existing files`, () => {
      const { dir, json } = manifest(packageName)
      const entries = Object.entries(json.exports ?? {})
      expect(entries.length).toBeGreaterThan(0)

      for (const [subpath, value] of entries) {
        const targets = exportTargets(value)
        expect(targets.length, `${packageName} ${subpath}`).toBeGreaterThan(0)
        for (const target of targets) {
          const absolute = resolve(dir, target)
          expect(
            absolute.startsWith(`${dir}${sep}`),
            `${packageName} ${subpath} must stay inside its package`
          ).toBe(true)
          expect(
            existsSync(absolute),
            `${packageName} ${subpath} points at a missing file: ${target}`
          ).toBe(true)
        }
      }
    })
  }

  it("keeps the server-safe entrypoints importable", () => {
    const exported: [string, unknown][] = [
      ["organization/directory#toMemberDirectoryEntry", toMemberDirectoryEntry],
      [
        "organization/lifecycle#ORGANIZATION_DELETION_GRACE_DAYS",
        ORGANIZATION_DELETION_GRACE_DAYS,
      ],
      ["organization/lifecycle#DATA_EXPORT_TTL_DAYS", DATA_EXPORT_TTL_DAYS],
      ["organization/roles#can", can],
      ["notifications#NotificationService", NotificationService],
      ["notifications/schemas#notificationIdSchema", notificationIdSchema],
      ["search#createSearchHandler", createSearchHandler],
      ["sagas#runOrganizationDeletionSaga", runOrganizationDeletionSaga],
      ["sagas#runUserDeletionSaga", runUserDeletionSaga],
      ["sagas#canMarkExportReady", canMarkExportReady],
      [
        "sagas#createOrganizationDeletionHandler",
        createOrganizationDeletionHandler,
      ],
      [
        "sagas#createOrganizationExportHandler",
        createOrganizationExportHandler,
      ],
      ["sagas#createUserDeletionHandler", createUserDeletionHandler],
      ["projects/repository#ProjectRepository", ProjectRepository],
      ["projects/service#ProjectService", ProjectService],
      ["projects/schemas#createTaskSchema", createTaskSchema],
      ["calendars/repository#CalendarRepository", CalendarRepository],
      ["calendars/service#CalendarService", CalendarService],
      ["calendars/schemas#createEventSchema", createEventSchema],
      ["files#createFilesRuntime", createFilesRuntime],
      ["files/runtime#createFilesRuntime", createFilesRuntimeFromRuntime],
      ["files#FileRepository", FileRepository],
      ["files#FileService", FileService],
      ["messaging#MessagingRepository", MessagingRepository],
      ["messaging#MessagingService", MessagingService],
      ["messaging/schemas#sendMessageSchema", sendMessageSchema],
      ["clients/repository#ClientsRepository", ClientsRepository],
      ["clients/service#ClientsService", ClientsService],
      ["clients/access#resolveClientAccess", resolveClientAccess],
      ["clients/schemas#clientInputSchema", clientInputSchema],
      ["employees/repository#EmployeesRepository", EmployeesRepository],
      ["employees/service#EmployeesService", EmployeesService],
      ["employees/access#resolveEmployeeAccess", resolveEmployeeAccess],
      ["employees/schemas#fetchRangeSchema", fetchRangeSchema],
      ["meetings/repository#MeetingRepository", MeetingRepository],
      ["meetings/service#MeetingService", MeetingService],
      [
        "meetings/schemas#createMeetingRequestSchema",
        createMeetingRequestSchema,
      ],
      ["portal/repository#PortalRepository", PortalRepository],
      ["portal#PortalService", PortalService],
      ["portal#requirePortalContext", requirePortalContext],
      ["portal#requirePortalManager", requirePortalManager],
      ["portal#requireInternalMember", requireInternalMember],
      ["portal/runtime#createPortalRuntime", createPortalRuntime],
      ["auth/session#createAuthSession", createAuthSession],
      [
        "auth/impersonation#IMPERSONATION_TTL_SECONDS",
        IMPERSONATION_TTL_SECONDS,
      ],
      ["app-shell/recents-storage#recentsStorageKey", recentsStorageKey],
      ["app-shell/recents-storage#normalizeRecents", normalizeRecents],
      ["app-shell/recents-storage#RECENTS_MAX_STORED", RECENTS_MAX_STORED],
      ["contracts#APPS", APPS],
      ["contracts#CUSTOMER_APP_KEYS", CUSTOMER_APP_KEYS],
      ["contracts#INTERNAL_ROUTES", INTERNAL_ROUTES],
      ["contracts#SERVICE_SCOPES", SERVICE_SCOPES],
      ["contracts#SearchQuerySchema", SearchQuerySchema],
      ["contracts#NotificationInputSchema", NotificationInputSchema],
      ["mcp/server#allMcpTools", allMcpTools],
      ["assistant/tools#assistantTools", assistantTools],
      ["search#searchWorkspace", searchWorkspace],
    ]

    for (const [name, value] of exported) {
      expect(value, name).toBeDefined()
    }

    const functions = exported.filter(
      ([, value]) => typeof value === "function"
    )
    expect(functions.length).toBeGreaterThan(10)
  })

  it("keeps the MCP and assistant tool surfaces aligned", () => {
    const mcpNames = new Set(allMcpTools.map((tool) => tool.name))
    expect(mcpNames.size).toBe(allMcpTools.length)
    for (const tool of assistantTools) {
      expect(mcpNames.has(tool.name), `assistant tool ${tool.name}`).toBe(true)
    }
    expect(allMcpTools.length).toBeGreaterThanOrEqual(30)
  })
})
