/**
 * The files domain: file tree, versions, shares, chunked upload sessions and
 * the large-object bytes they reference (ADR 0005, ADR 0010).
 *
 * The package owns every rule; the owning app binds its database client, pool,
 * audit writer, plan check and rate limiter through `createFilesRuntime`.
 */
export { FileRepository } from "./repository"
export { FileService, type FileServiceDeps } from "./service"
export {
  UploadSessionService,
  type CompletedUpload,
  type CreateUploadSessionInput,
  type UploadRateLimit,
  type UploadReferenceChecker,
  type UploadSessionDeps,
  type UploadSessionView,
} from "./upload-session"
export {
  createFileQuota,
  type FileQuotaOptions,
  type QuotaPlanSource,
} from "./storage"
export {
  createFileObjects,
  type FileObjects,
  type OrganizationFileObject,
  type OrganizationFileObjects,
  type OrganizationFileSnapshot,
  type OrganizationFileVersionObject,
} from "./objects"
export {
  createFilesRuntime,
  type FilesRuntime,
  type FilesRuntimeOptions,
} from "./runtime"
export type {
  FileAudit,
  FileAuditInput,
  FileEntitlementCheck,
  FileQuota,
  FileStorage,
} from "./deps"
export {
  UPLOAD_CHUNK_RETRIES,
  UPLOAD_CHUNK_SIZE,
  UPLOAD_SESSION_TTL_MS,
  uploadSessionExpiry,
} from "./upload-config"
export * from "./schemas"
export type {
  FileActivity,
  FileKind,
  FileLocation,
  FilesData,
  FilesMember,
  FilesNavigation,
  FileVersion,
  FileNode,
  ShareEntry,
  SharePermission,
  UploadItem,
  UploadStatus,
} from "./types"
