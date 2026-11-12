import type { RequestContext } from "@workspace/core/context"
import type { Page, PageInput } from "@workspace/core/pagination"
import type {
  ActivityInput,
  ClientInput,
  CloseDealInput,
  ContactInput,
  DealInput,
  ExportInput,
  FeedbackAssigneeInput,
  FeedbackFilter,
  FeedbackInput,
  FeedbackStatusInput,
  FieldDefinitionInput,
  ReleaseExportInput,
  ImportClientsInput,
  ImportContactsInput,
  LinkDocumentInput,
  LinkProjectInput,
  MoveDealInput,
  MoveStageInput,
  PipelineInput,
  ReleaseInput,
  StageInput,
  UnlinkProjectInput,
  UpdateDocumentVisibilityInput,
} from "./schemas"
import type {
  ClientActivityData,
  ClientData,
  ClientDetailData,
  ClientContactData,
  ClientContactDetailData,
  ClientDealData,
  ClientDealDetailData,
  ClientDocumentData,
  ClientExportResultData,
  ClientFieldDefinitionData,
  ClientFeedbackData,
  ClientFeedbackPageData,
  ClientFieldEntity,
  ClientFileOptionData,
  ClientImportResultData,
  ClientOverviewData,
  ClientPipelineData,
  ClientProjectLinkOptionData,
  ClientProjectOptionData,
  ClientReleaseData,
  ClientReleaseGroupData,
  ClientReleaseReportData,
} from "./types"

import type { ClientServicePorts } from "./ports"
import type { ClientsRepository } from "./repository"
import { ClientOverviewService } from "./services/overview"
import { ClientCompaniesService } from "./services/clients"
import { ClientContactsService } from "./services/contacts"
import { ClientDealsService } from "./services/deals"
import { ClientPipelinesService } from "./services/pipelines"
import { ClientFieldsService } from "./services/fields"
import { ClientDocumentsService } from "./services/documents"
import { ClientLinksService } from "./services/links"
import { ClientActivitiesService } from "./services/activities"
import { ClientImportExportService } from "./services/import-export"
import { ClientFeedbackService } from "./services/feedback"

/**
 * Clients facade. Each method delegates to the sub-domain service in
 * `./services`, which keeps the public API stable while the
 * implementation stays split by subdomain.
 */
export class ClientsService {
  private readonly overview: ClientOverviewService
  private readonly clients: ClientCompaniesService
  private readonly contacts: ClientContactsService
  private readonly deals: ClientDealsService
  private readonly pipelines: ClientPipelinesService
  private readonly fields: ClientFieldsService
  private readonly documents: ClientDocumentsService
  private readonly links: ClientLinksService
  private readonly activities: ClientActivitiesService
  private readonly importExport: ClientImportExportService
  private readonly feedback: ClientFeedbackService

  constructor(repo: ClientsRepository, ports: ClientServicePorts) {
    this.overview = new ClientOverviewService(repo)
    this.clients = new ClientCompaniesService(repo)
    this.contacts = new ClientContactsService(repo)
    this.deals = new ClientDealsService(repo, ports.notify)
    this.pipelines = new ClientPipelinesService(repo)
    this.fields = new ClientFieldsService(repo)
    this.documents = new ClientDocumentsService(repo)
    this.links = new ClientLinksService(repo)
    this.activities = new ClientActivitiesService(repo)
    this.importExport = new ClientImportExportService(repo)
    this.feedback = new ClientFeedbackService(repo)
  }

  async getOverview(ctx: RequestContext): Promise<ClientOverviewData> {
    return this.overview.getOverview(ctx)
  }

  async getClientDetail(
    ctx: RequestContext,
    clientId: string
  ): Promise<ClientDetailData> {
    return this.overview.getClientDetail(ctx, clientId)
  }

  async getContactDetail(
    ctx: RequestContext,
    contactId: string
  ): Promise<ClientContactDetailData> {
    return this.overview.getContactDetail(ctx, contactId)
  }

  async getDealDetail(
    ctx: RequestContext,
    dealId: string
  ): Promise<ClientDealDetailData> {
    return this.overview.getDealDetail(ctx, dealId)
  }

  async listClientsPage(
    ctx: RequestContext,
    input: PageInput = {}
  ): Promise<Page<ClientData>> {
    return this.clients.listClientsPage(ctx, input)
  }

  async listContactsPage(
    ctx: RequestContext,
    input: PageInput = {}
  ): Promise<Page<ClientContactData>> {
    return this.contacts.listContactsPage(ctx, input)
  }

  async listDealsPage(
    ctx: RequestContext,
    input: PageInput = {}
  ): Promise<Page<ClientDealData>> {
    return this.deals.listDealsPage(ctx, input)
  }

  async listActivitiesPage(
    ctx: RequestContext,
    input: PageInput & {
      clientId?: string
      contactId?: string
      dealId?: string
    } = {}
  ): Promise<Page<ClientActivityData>> {
    return this.activities.listActivitiesPage(ctx, input)
  }

  async saveClient(
    ctx: RequestContext,
    input: ClientInput
  ): Promise<ClientData> {
    return this.clients.saveClient(ctx, input)
  }

  async archiveClient(ctx: RequestContext, id: string): Promise<ClientData> {
    return this.clients.archiveClient(ctx, id)
  }

  async restoreClient(ctx: RequestContext, id: string): Promise<ClientData> {
    return this.clients.restoreClient(ctx, id)
  }

  async saveContact(
    ctx: RequestContext,
    input: ContactInput
  ): Promise<ClientContactData> {
    return this.contacts.saveContact(ctx, input)
  }

  async archiveContact(
    ctx: RequestContext,
    id: string
  ): Promise<ClientContactData> {
    return this.contacts.archiveContact(ctx, id)
  }

  async restoreContact(
    ctx: RequestContext,
    id: string
  ): Promise<ClientContactData> {
    return this.contacts.restoreContact(ctx, id)
  }

  async saveDeal(
    ctx: RequestContext,
    input: DealInput
  ): Promise<ClientDealData> {
    return this.deals.saveDeal(ctx, input)
  }

  async moveDeal(
    ctx: RequestContext,
    input: MoveDealInput
  ): Promise<ClientDealData> {
    return this.deals.moveDeal(ctx, input)
  }

  async closeDeal(
    ctx: RequestContext,
    input: CloseDealInput
  ): Promise<ClientDealData> {
    return this.deals.closeDeal(ctx, input)
  }

  async reopenDeal(
    ctx: RequestContext,
    dealId: string
  ): Promise<ClientDealData> {
    return this.deals.reopenDeal(ctx, dealId)
  }

  async archiveDeal(ctx: RequestContext, id: string): Promise<ClientDealData> {
    return this.deals.archiveDeal(ctx, id)
  }

  async restoreDeal(ctx: RequestContext, id: string): Promise<ClientDealData> {
    return this.deals.restoreDeal(ctx, id)
  }

  async savePipeline(
    ctx: RequestContext,
    input: PipelineInput
  ): Promise<ClientPipelineData> {
    return this.pipelines.savePipeline(ctx, input)
  }

  async setDefaultPipeline(
    ctx: RequestContext,
    pipelineId: string
  ): Promise<ClientPipelineData> {
    return this.pipelines.setDefaultPipeline(ctx, pipelineId)
  }

  async deletePipeline(
    ctx: RequestContext,
    pipelineId: string
  ): Promise<{ id: string }> {
    return this.pipelines.deletePipeline(ctx, pipelineId)
  }

  async saveStage(
    ctx: RequestContext,
    input: StageInput
  ): Promise<ClientPipelineData> {
    return this.pipelines.saveStage(ctx, input)
  }

  async moveStage(
    ctx: RequestContext,
    input: MoveStageInput
  ): Promise<ClientPipelineData> {
    return this.pipelines.moveStage(ctx, input)
  }

  async deleteStage(
    ctx: RequestContext,
    stageId: string
  ): Promise<ClientPipelineData> {
    return this.pipelines.deleteStage(ctx, stageId)
  }

  async saveFieldDefinition(
    ctx: RequestContext,
    input: FieldDefinitionInput
  ): Promise<ClientFieldDefinitionData> {
    return this.fields.saveFieldDefinition(ctx, input)
  }

  async deleteFieldDefinition(
    ctx: RequestContext,
    id: string
  ): Promise<{ id: string }> {
    return this.fields.deleteFieldDefinition(ctx, id)
  }

  async listDocuments(
    ctx: RequestContext,
    entity: ClientFieldEntity,
    entityId: string
  ): Promise<ClientDocumentData[]> {
    return this.documents.listDocuments(ctx, entity, entityId)
  }

  async linkDocument(
    ctx: RequestContext,
    input: LinkDocumentInput
  ): Promise<ClientDocumentData> {
    return this.documents.linkDocument(ctx, input)
  }

  async unlinkDocument(
    ctx: RequestContext,
    id: string
  ): Promise<{ id: string }> {
    return this.documents.unlinkDocument(ctx, id)
  }

  async updateDocumentVisibility(
    ctx: RequestContext,
    input: UpdateDocumentVisibilityInput
  ): Promise<ClientDocumentData> {
    return this.documents.updateDocumentVisibility(ctx, input)
  }

  async fetchFileOptions(ctx: RequestContext): Promise<ClientFileOptionData[]> {
    return this.documents.fetchFileOptions(ctx)
  }

  async fetchProjectOptions(
    ctx: RequestContext
  ): Promise<ClientProjectLinkOptionData[]> {
    return this.links.fetchProjectOptions(ctx)
  }

  async linkProject(
    ctx: RequestContext,
    input: LinkProjectInput
  ): Promise<ClientProjectOptionData> {
    return this.links.linkProject(ctx, input)
  }

  async unlinkProject(
    ctx: RequestContext,
    input: UnlinkProjectInput
  ): Promise<{ id: string }> {
    return this.links.unlinkProject(ctx, input)
  }

  async createActivity(
    ctx: RequestContext,
    input: ActivityInput
  ): Promise<ClientActivityData> {
    return this.activities.createActivity(ctx, input)
  }

  async exportClient(
    ctx: RequestContext,
    input: ExportInput
  ): Promise<ClientExportResultData> {
    return this.importExport.exportClient(ctx, input)
  }

  async importClients(
    ctx: RequestContext,
    input: ImportClientsInput
  ): Promise<ClientImportResultData> {
    return this.importExport.importClients(ctx, input)
  }

  async importContacts(
    ctx: RequestContext,
    input: ImportContactsInput
  ): Promise<ClientImportResultData> {
    return this.importExport.importContacts(ctx, input)
  }

  async listReleaseGroups(
    ctx: RequestContext,
    filter: FeedbackFilter = {}
  ): Promise<ClientReleaseGroupData[]> {
    return this.feedback.listReleaseGroups(ctx, filter)
  }

  async getFeedbackPage(
    ctx: RequestContext,
    filter: FeedbackFilter = {}
  ): Promise<ClientFeedbackPageData> {
    return this.feedback.getFeedbackPage(ctx, filter)
  }

  async getReleaseReport(
    ctx: RequestContext,
    releaseId: string
  ): Promise<ClientReleaseReportData> {
    return this.feedback.getReleaseReport(ctx, releaseId)
  }

  async exportReleaseCsv(
    ctx: RequestContext,
    input: ReleaseExportInput
  ): Promise<ClientExportResultData> {
    return this.feedback.exportReleaseCsv(ctx, input)
  }

  async saveRelease(
    ctx: RequestContext,
    input: ReleaseInput
  ): Promise<ClientReleaseData> {
    return this.feedback.saveRelease(ctx, input)
  }

  async deleteRelease(
    ctx: RequestContext,
    id: string
  ): Promise<{ id: string }> {
    return this.feedback.deleteRelease(ctx, id)
  }

  async saveFeedback(
    ctx: RequestContext,
    input: FeedbackInput
  ): Promise<ClientFeedbackData> {
    return this.feedback.saveFeedback(ctx, input)
  }

  async setFeedbackStatus(
    ctx: RequestContext,
    input: FeedbackStatusInput
  ): Promise<ClientFeedbackData> {
    return this.feedback.setFeedbackStatus(ctx, input)
  }

  async assignFeedback(
    ctx: RequestContext,
    input: FeedbackAssigneeInput
  ): Promise<ClientFeedbackData> {
    return this.feedback.assignFeedback(ctx, input)
  }

  async deleteFeedback(
    ctx: RequestContext,
    id: string
  ): Promise<{ id: string }> {
    return this.feedback.deleteFeedback(ctx, id)
  }
}
