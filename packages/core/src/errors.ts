export type AppErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "validation_error"
  | "conflict"
  | "bad_request"
  | "internal_error"

/**
 * Stable, translation-friendly codes for service specific errors. The client
 * maps these to `Errors.*` catalog keys (e.g. `role_cannot_modify_projects` ->
 * `Errors.roleCannotModifyProjects`). They are intentionally independent from
 * the HTTP-level {@link AppErrorCode}.
 */
export type ServiceErrorCode =
  | "trial_not_eligible"
  | "trial_already_used"
  | "trial_email_unverified"
  | "trial_already_claimed"
  | "role_cannot_modify_projects"
  | "role_cannot_manage_members"
  | "email_already_member"
  | "last_owner"
  | "role_client_exclusive"
  | "roles_require_upgrade"
  | "role_cannot_modify_files"
  | "file_permission_denied"
  | "storage_quota_exceeded"
  | "upload_offset_mismatch"
  | "upload_size_mismatch"
  | "upload_checksum_mismatch"
  | "upload_not_transient"
  | "role_cannot_modify_calendars"
  | "role_cannot_send_messages"
  | "label_color_already_used"
  | "role_cannot_modify_employees"
  | "role_cannot_manage_employees"
  | "leave_overlapping"
  | "leave_self_approval"
  | "leave_not_pending"
  | "role_cannot_modify_clients"
  | "role_cannot_manage_clients"
  | "role_cannot_export_clients"
  | "client_name_taken"
  | "contact_email_exists"
  | "custom_field_required"
  | "pipeline_is_default"
  | "pipeline_not_empty"
  | "stage_not_empty"
  | "stage_last_required"
  | "file_already_linked"
  | "file_in_trash"
  | "project_already_linked"
  | "project_not_linked"
  | "release_version_taken"
  | "project_not_linked_to_client"
  | "feedback_already_converted"
  | "feedback_project_required"
  | "portal_invite_exists"
  | "portal_read_only"
  | "file_too_large"
  | "message_not_author"
  | "role_cannot_manage_integrations"
  | "repository_already_connected"
  | "repository_connect_failed"
  | "repository_not_connected"
  | "repository_user_token_missing"
  | "repository_access_denied"
  | "repository_issue_create_failed"
  | "role_cannot_manage_meetings"
  | "meeting_requests_disabled"
  | "meeting_overlap"
  | "meeting_slot_too_soon"
  | "meeting_slot_outside_window"
  | "meeting_notice_beyond_window"
  | "meeting_duration_invalid"
  | "meeting_invalid_window"
  | "meeting_slots_invalid"
  | "meeting_slots_duplicate"
  | "meeting_not_pending"
  | "meeting_url_required"
  | "meeting_address_required"
  | "meeting_provider_not_connected"
  | "meeting_attendee_invalid"
  | "feedback_rate_limited"
  | "rate_limited"
  | "feedback_delivery_failed"
  | "upgrade_required"
  | "quota_exceeded"
  | "assistant_unavailable"
  | "role_cannot_manage_billing"
  | "billing_not_configured"
  | "billing_manual_contract"
  | "billing_subscription_exists"
  | "billing_no_payment_account"
  | "export_in_progress"
  | "account_confirmation_mismatch"
  | "account_password_invalid"
  | "account_platform_operator"
  | "account_sole_owner"
  | "account_impersonated"
  | "account_deletion_partial"

export type ErrorCode = AppErrorCode | ServiceErrorCode

const STATUS_BY_CODE: Record<AppErrorCode, number> = {
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  validation_error: 422,
  conflict: 409,
  bad_request: 400,
  internal_error: 500,
}

export interface AppErrorOptions {
  details?: unknown
  params?: Record<string, string | number>
  status?: number
  /** Seconds, sent as `Retry-After` by `jsonError`. */
  retryAfter?: number
}

export class AppError extends Error {
  readonly code: ErrorCode
  readonly status: number
  readonly details?: unknown
  readonly params?: Record<string, string | number>
  readonly retryAfter?: number

  constructor(code: ErrorCode, message: string, options: AppErrorOptions = {}) {
    super(message)
    this.name = "AppError"
    this.code = code
    this.status = options.status ?? STATUS_BY_CODE[code as AppErrorCode] ?? 500
    this.details = options.details
    this.params = options.params
    this.retryAfter = options.retryAfter
  }
}

/**
 * Options accepted by the concrete error subclasses so callers can attach a
 * stable `code` (and interpolation `params`) while keeping the English
 * `message` as a fallback.
 */
export interface CodedErrorOptions {
  code?: ErrorCode
  params?: Record<string, string | number>
}

export class UnauthorizedError extends AppError {
  constructor(message = "You must be signed in to do this.") {
    super("unauthorized", message, { status: 401 })
    this.name = "UnauthorizedError"
  }
}

export class ForbiddenError extends AppError {
  constructor(
    message = "You do not have permission to do this.",
    options: CodedErrorOptions = {}
  ) {
    super(options.code ?? "forbidden", message, {
      params: options.params,
      status: 403,
    })
    this.name = "ForbiddenError"
  }
}

export class NotFoundError extends AppError {
  constructor(resource = "Resource") {
    super("not_found", `${resource} was not found.`, {
      params: { resource },
      status: 404,
    })
    this.name = "NotFoundError"
  }
}

export class ValidationError extends AppError {
  constructor(
    message = "The request was invalid.",
    details?: unknown,
    options: CodedErrorOptions = {}
  ) {
    super(options.code ?? "validation_error", message, {
      details,
      params: options.params,
      status: 422,
    })
    this.name = "ValidationError"
  }
}

export class ConflictError extends AppError {
  constructor(
    message = "That change conflicts with existing data.",
    options: CodedErrorOptions = {}
  ) {
    super(options.code ?? "conflict", message, {
      params: options.params,
      status: 409,
    })
    this.name = "ConflictError"
  }
}

export class BadRequestError extends AppError {
  constructor(message = "Bad request.", options: CodedErrorOptions = {}) {
    super(options.code ?? "bad_request", message, {
      params: options.params,
      status: 400,
    })
    this.name = "BadRequestError"
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError
}

interface ZodLikeError {
  name: string
  issues?: unknown
}

function isZodError(error: unknown): error is ZodLikeError {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as ZodLikeError).name === "ZodError" &&
    "issues" in error
  )
}

export function toAppError(error: unknown): AppError {
  if (isAppError(error)) return error
  if (isZodError(error)) {
    const issues = Array.isArray(error.issues) ? error.issues : []
    const first = issues.find(
      (issue): issue is { message: string } =>
        typeof (issue as { message?: unknown })?.message === "string"
    )
    return new ValidationError(
      first?.message ?? "The request was invalid.",
      error.issues
    )
  }
  if (error instanceof Error) {
    return new AppError("internal_error", error.message)
  }
  return new AppError("internal_error", "Something went wrong.")
}
