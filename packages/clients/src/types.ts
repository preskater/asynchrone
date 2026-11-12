/**
 * Client domain types. Records are plain, serializable shapes produced by
 * `ClientsService` and consumed by client components.
 */

export const CLIENT_STATUSES = ["prospect", "active", "inactive"] as const
export type ClientStatus = (typeof CLIENT_STATUSES)[number]

export const CLIENT_ACTIVITY_TYPES = [
  "note",
  "call",
  "email",
  "meeting",
] as const
export type ClientActivityType = (typeof CLIENT_ACTIVITY_TYPES)[number]

export const CLIENT_FIELD_ENTITIES = ["client", "contact", "deal"] as const
export type ClientFieldEntity = (typeof CLIENT_FIELD_ENTITIES)[number]

export const CLIENT_FIELD_TYPES = [
  "text",
  "number",
  "date",
  "select",
  "multiselect",
  "boolean",
  "url",
  "email",
  "phone",
] as const
export type ClientFieldType = (typeof CLIENT_FIELD_TYPES)[number]

export const DEAL_STATUSES = ["open", "won", "lost"] as const
export type DealStatus = (typeof DEAL_STATUSES)[number]

export const PIPELINE_STAGE_TYPES = ["open", "won", "lost"] as const
export type PipelineStageType = (typeof PIPELINE_STAGE_TYPES)[number]

export const CLIENT_CURRENCIES = ["EUR", "USD", "GBP", "CHF", "CAD"] as const
export type ClientCurrency = (typeof CLIENT_CURRENCIES)[number]

/** Custom field value: string, number, boolean, string list or empty. */
export type ClientFieldValue = string | number | boolean | string[] | null

export type ClientFieldValues = Record<string, ClientFieldValue>

export interface ClientAccessData {
  /** Member and above: create and edit records. */
  canEdit: boolean
  /** Admin and above: pipelines, custom fields, deletion of configuration. */
  canManage: boolean
  /** Member and above: CSV exports and imports. */
  canExport: boolean
  currentUserId: string
}

export interface ClientMemberOptionData {
  id: string
  name: string
  email: string
}

export interface ClientFieldDefinitionData {
  id: string
  entity: ClientFieldEntity
  key: string
  label: string
  type: ClientFieldType
  options: string[]
  isRequired: boolean
  position: number
}

export interface ClientData {
  id: string
  name: string
  status: ClientStatus
  contactEmail?: string
  industry?: string
  website?: string
  phone?: string
  address?: string
  description?: string
  source?: string
  ownerId?: string
  ownerName?: string
  /** Availability for project time tracking (employee/billing flag). */
  isActive: boolean
  customFields: ClientFieldValues
  archivedAt?: string
  createdAt: string
  updatedAt: string
  /** Derived counters used by the list and detail pages. */
  contactCount: number
  openDealCount: number
  openDealValue: number
  projectCount: number
}

export interface ClientContactCompanyData {
  clientId: string
  clientName: string
  jobTitle?: string
  isPrimary: boolean
}

export interface ClientContactData {
  id: string
  firstName: string
  lastName: string
  fullName: string
  email?: string
  phone?: string
  jobTitle?: string
  notes?: string
  ownerId?: string
  ownerName?: string
  customFields: ClientFieldValues
  companies: ClientContactCompanyData[]
  archivedAt?: string
  createdAt: string
  updatedAt: string
  openDealCount: number
}

export interface ClientDealContactData {
  contactId: string
  name: string
  email?: string
  isPrimary: boolean
}

export interface ClientPipelineStageData {
  id: string
  name: string
  position: number
  type: PipelineStageType
  color?: string
  dealCount: number
  totalValue: number
}

export interface ClientPipelineData {
  id: string
  name: string
  isDefault: boolean
  stages: ClientPipelineStageData[]
}

export interface ClientDealData {
  id: string
  name: string
  clientId?: string
  clientName?: string
  pipelineId?: string
  stageId?: string
  stageName?: string
  stageType?: PipelineStageType
  amount: number
  currency: string
  probability: number
  status: DealStatus
  expectedCloseDate?: string
  actualCloseDate?: string
  lossReason?: string
  source?: string
  description?: string
  ownerId?: string
  ownerName?: string
  position: number
  customFields: ClientFieldValues
  archivedAt?: string
  createdAt: string
  updatedAt: string
  contacts: ClientDealContactData[]
}

export interface ClientActivityData {
  id: string
  type: ClientActivityType
  subject?: string
  body: string
  occurredAt: string
  authorId: string
  authorName: string
  clientId?: string
  contactId?: string
  dealId?: string
}

export interface ClientSystemEventData {
  id: string
  action: string
  /** Related entity snapshot values (e.g. the new stage name). */
  details: Record<string, string>
  occurredAt: string
  authorName: string
}

export interface ClientTimelineEntryData {
  id: string
  kind: "activity" | "system"
  occurredAt: string
  activity?: ClientActivityData
  system?: ClientSystemEventData
}

export interface ClientProjectOptionData {
  id: string
  name: string
  status: string
}

/** Project entry with its current company link, used by the link picker. */
export interface ClientProjectLinkOptionData {
  id: string
  name: string
  status: string
  clientId: string | null
  clientName: string | null
}

export interface ClientOptionData {
  id: string
  name: string
}

export interface ClientContactOptionData {
  id: string
  name: string
  email?: string
}

export const CLIENT_DOCUMENT_VISIBILITIES = ["internal", "client"] as const
export type ClientDocumentVisibility =
  (typeof CLIENT_DOCUMENT_VISIBILITIES)[number]

/** A file linked to a client record. */
export interface ClientDocumentData {
  id: string
  fileId: string
  name: string
  kind: string
  mimeType?: string
  sizeBytes?: number
  visibility: ClientDocumentVisibility
  trashed: boolean
  addedById: string
  addedByName?: string
  createdAt: string
}

/** Light file entry used by the "add document" picker. */
export interface ClientFileOptionData {
  id: string
  name: string
  kind: string
  mimeType?: string
  modifiedAt: string
}

export interface ClientOverviewStats {
  clients: {
    total: number
    active: number
    prospects: number
    openValue: number
  }
  deals: {
    openCount: number
    openValue: number
    weighted: number
    won30: number
  }
}

/** Keyset cursors for the next page of each overview list. */
export interface ClientOverviewPagination {
  clients: string | null
  contacts: string | null
  deals: string | null
  recentActivities: string | null
}

export interface ClientOverviewData {
  todayKey: string
  access: ClientAccessData
  members: ClientMemberOptionData[]
  fieldDefinitions: ClientFieldDefinitionData[]
  /** Light option lists so forms do not depend on the paginated rows. */
  clientOptions: ClientOptionData[]
  contactOptions: ClientContactOptionData[]
  clients: ClientData[]
  contacts: ClientContactData[]
  pipelines: ClientPipelineData[]
  deals: ClientDealData[]
  pagination: ClientOverviewPagination
  stats: ClientOverviewStats
  /** Latest activity across all records (desk feed). */
  recentActivities: ClientActivityData[]
  /** Releases currently in test, newest first (ADR 0040). */
  testRounds: ClientTestRoundData[]
}

export interface ClientDetailData {
  access: ClientAccessData
  members: ClientMemberOptionData[]
  fieldDefinitions: ClientFieldDefinitionData[]
  clients: ClientOptionData[]
  client: ClientData
  contacts: ClientContactData[]
  deals: ClientDealData[]
  projects: ClientProjectOptionData[]
  documents: ClientDocumentData[]
  timeline: ClientTimelineEntryData[]
}

export interface ClientContactDetailData {
  access: ClientAccessData
  members: ClientMemberOptionData[]
  fieldDefinitions: ClientFieldDefinitionData[]
  clients: ClientOptionData[]
  contact: ClientContactData
  deals: ClientDealData[]
  documents: ClientDocumentData[]
  timeline: ClientTimelineEntryData[]
}

export interface ClientDealDetailData {
  access: ClientAccessData
  members: ClientMemberOptionData[]
  fieldDefinitions: ClientFieldDefinitionData[]
  clients: ClientOptionData[]
  contactOptions: ClientContactOptionData[]
  pipelines: ClientPipelineData[]
  deal: ClientDealData
  documents: ClientDocumentData[]
  timeline: ClientTimelineEntryData[]
}

export interface ClientImportRowErrorData {
  row: number
  message: string
}

export interface ClientImportResultData {
  created: number
  restored: number
  skipped: number
  errors: ClientImportRowErrorData[]
}

export interface ClientExportResultData {
  filename: string
  content: string
}

// --- Releases and test feedback (ADR 0040) -------------------------------------

export const CLIENT_RELEASE_STATUSES = [
  "planned",
  "in_test",
  "approved",
  "rejected",
] as const
export type ClientReleaseStatus = (typeof CLIENT_RELEASE_STATUSES)[number]

export const CLIENT_FEEDBACK_STATUSES = [
  "new",
  "triaged",
  "accepted",
  "rejected",
  "fixed",
  "deferred",
] as const
export type ClientFeedbackStatus = (typeof CLIENT_FEEDBACK_STATUSES)[number]

/** Statuses that still need work; the others close the report. */
export const CLIENT_FEEDBACK_OPEN_STATUSES = [
  "new",
  "triaged",
  "accepted",
] as const satisfies readonly ClientFeedbackStatus[]

export const CLIENT_FEEDBACK_ENVIRONMENTS = [
  "development",
  "staging",
  "production",
  "other",
] as const
export type ClientFeedbackEnvironment =
  (typeof CLIENT_FEEDBACK_ENVIRONMENTS)[number]

export interface ClientReleaseData {
  id: string
  clientId: string
  /** Set on list reads, for the cross-client page. */
  clientName?: string
  projectId?: string
  version: string
  label?: string
  /** `YYYY-MM-DD` release day. */
  releasedAt?: string
  status: ClientReleaseStatus
  notes?: string
  portalVisible: boolean
  /** First and last `testedAt` of its feedback (ISO), when there is any. */
  testedFrom?: string
  testedTo?: string
  feedbackCount: number
  openCount: number
  createdAt: string
  updatedAt: string
}

export interface ClientFeedbackData {
  id: string
  clientId: string
  releaseId: string
  projectId?: string
  /** Release version when the report was recorded. */
  version: string
  contactId?: string
  contactName?: string
  authorId: string
  authorName: string
  assigneeId?: string
  assigneeName?: string
  /** ISO date and time of the test. */
  testedAt: string
  environment: ClientFeedbackEnvironment
  category: string
  impact: string
  status: ClientFeedbackStatus
  statusChangedAt: string
  title: string
  body: string
  linkedTaskId?: string
  documentId?: string
  createdAt: string
  updatedAt: string
}

/** One release with the feedback that matches the current filters. */
export interface ClientReleaseGroupData {
  release: ClientReleaseData
  feedback: ClientFeedbackData[]
}

export interface ClientFeedbackPageData {
  access: ClientAccessData
  members: ClientMemberOptionData[]
  groups: ClientReleaseGroupData[]
}

/** Counts of a set of feedback entries, for a release report. */
export interface ClientFeedbackSummaryData {
  total: number
  open: number
  byStatus: Record<string, number>
  byCategory: Record<string, number>
  byImpact: Record<string, number>
}

/** The per-release report ("compte rendu"), printed or shared. */
export interface ClientReleaseReportData {
  release: ClientReleaseData
  clientName: string
  generatedAt: string
  summary: ClientFeedbackSummaryData
  /** Oldest test first, as the client ran them. */
  feedback: ClientFeedbackData[]
}

/** A release in test, for the CRM overview. */
export interface ClientTestRoundData {
  releaseId: string
  clientId: string
  clientName: string
  version: string
  openCount: number
  feedbackCount: number
}
