"use client"

import * as React from "react"
import { useTranslations } from "next-intl"

const CODE_KEYS: Record<string, string> = {
  unauthorized: "unauthorized",
  forbidden: "forbidden",
  not_found: "notFound",
  validation_error: "validation",
  conflict: "conflict",
  bad_request: "badRequest",
  internal_error: "internal",
  role_cannot_modify_projects: "roleCannotModifyProjects",
  role_cannot_manage_members: "roleCannotManageMembers",
  email_already_member: "emailAlreadyMember",
  last_owner: "lastOwner",
  role_client_exclusive: "roleClientExclusive",
  roles_require_upgrade: "rolesRequireUpgrade",
  role_cannot_modify_files: "roleCannotModifyFiles",
  file_permission_denied: "filePermissionDenied",
  storage_quota_exceeded: "storageQuotaExceeded",
  upload_offset_mismatch: "uploadOffsetMismatch",
  upload_size_mismatch: "uploadSizeMismatch",
  upload_checksum_mismatch: "uploadChecksumMismatch",
  role_cannot_modify_calendars: "roleCannotModifyCalendars",
  role_cannot_send_messages: "roleCannotSendMessages",
  label_color_already_used: "labelColorAlreadyUsed",
  role_cannot_modify_employees: "roleCannotModifyEmployees",
  role_cannot_manage_employees: "roleCannotManageEmployees",
  leave_overlapping: "leaveOverlapping",
  leave_self_approval: "leaveSelfApproval",
  leave_not_pending: "leaveNotPending",
  role_cannot_modify_clients: "roleCannotModifyClients",
  role_cannot_manage_clients: "roleCannotManageClients",
  role_cannot_export_clients: "roleCannotExportClients",
  client_name_taken: "clientNameTaken",
  contact_email_exists: "contactEmailExists",
  custom_field_required: "customFieldRequired",
  pipeline_is_default: "pipelineIsDefault",
  pipeline_not_empty: "pipelineNotEmpty",
  stage_not_empty: "stageNotEmpty",
  stage_last_required: "stageLastRequired",
  file_already_linked: "fileAlreadyLinked",
  file_in_trash: "fileInTrash",
  release_version_taken: "releaseVersionTaken",
  project_not_linked_to_client: "projectNotLinkedToClient",
  feedback_already_converted: "feedbackAlreadyConverted",
  feedback_project_required: "feedbackProjectRequired",
  project_already_linked: "projectAlreadyLinked",
  project_not_linked: "projectNotLinked",
  portal_invite_exists: "portalInviteExists",
  portal_read_only: "portalReadOnly",
  file_too_large: "fileTooLarge",
  message_not_author: "messageNotAuthor",
  role_cannot_manage_integrations: "roleCannotManageIntegrations",
  repository_already_connected: "repositoryAlreadyConnected",
  repository_connect_failed: "repositoryConnectFailed",
  repository_not_connected: "repositoryNotConnected",
  repository_user_token_missing: "repositoryUserTokenMissing",
  repository_access_denied: "repositoryAccessDenied",
  repository_issue_create_failed: "repositoryIssueCreateFailed",
  role_cannot_manage_meetings: "roleCannotManageMeetings",
  meeting_requests_disabled: "meetingRequestsDisabled",
  meeting_overlap: "meetingOverlap",
  meeting_slot_too_soon: "meetingSlotTooSoon",
  meeting_slot_outside_window: "meetingSlotOutsideWindow",
  meeting_notice_beyond_window: "meetingNoticeBeyondWindow",
  meeting_duration_invalid: "meetingDurationInvalid",
  meeting_invalid_window: "meetingInvalidWindow",
  meeting_slots_invalid: "meetingSlotsInvalid",
  meeting_slots_duplicate: "meetingSlotsDuplicate",
  meeting_not_pending: "meetingNotPending",
  meeting_url_required: "meetingUrlRequired",
  meeting_address_required: "meetingAddressRequired",
  meeting_provider_not_connected: "meetingProviderNotConnected",
  meeting_attendee_invalid: "meetingAttendeeInvalid",
  feedback_rate_limited: "feedbackRateLimited",
  rate_limited: "rateLimited",
  feedback_delivery_failed: "feedbackDeliveryFailed",
  upgrade_required: "upgradeRequired",
  quota_exceeded: "quotaExceeded",
  assistant_unavailable: "assistantUnavailable",
  trial_not_eligible: "trialNotEligible",
  trial_already_used: "trialAlreadyUsed",
  trial_email_unverified: "trialEmailUnverified",
  trial_already_claimed: "trialAlreadyClaimed",
  role_cannot_manage_billing: "roleCannotManageBilling",
  billing_not_configured: "billingNotConfigured",
  billing_manual_contract: "billingManualContract",
  billing_subscription_exists: "billingSubscriptionExists",
  billing_no_payment_account: "billingNoPaymentAccount",
  export_in_progress: "exportInProgress",
  account_confirmation_mismatch: "accountConfirmationMismatch",
  account_password_invalid: "accountPasswordInvalid",
  account_platform_operator: "accountPlatformOperator",
  account_sole_owner: "accountSoleOwner",
  sso_provider_invalid: "ssoProviderInvalid",
  sso_domain_unverified: "ssoDomainUnverified",
  sso_domain_verification_failed: "ssoDomainVerificationFailed",
  account_impersonated: "accountImpersonated",
}

export function useErrorTranslator() {
  const t = useTranslations("Errors")
  const tEnums = useTranslations("Enums")

  // Memoised so the translator can safely be used in effect dependencies.
  return React.useCallback(
    (error: unknown, fallbackKey?: string): string => {
      const err = error as {
        code?: string
        message?: string
        params?: Record<string, string | number> & { resource?: string }
      }
      const code = err?.code
      if (code && CODE_KEYS[code]) {
        if (code === "not_found") {
          const resource = err?.params?.resource
          return t("notFound", {
            resource: resource ? tEnums(`resource.${resource}` as never) : "",
          })
        }
        return t(CODE_KEYS[code] as never, (err?.params ?? {}) as never)
      }
      if (fallbackKey) return t(fallbackKey as never)
      return err?.message ?? t("internal")
    },
    [t, tEnums]
  )
}
