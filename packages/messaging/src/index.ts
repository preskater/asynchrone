/**
 * The messaging domain: conversations, members, messages, reactions, threads,
 * attachments, unread state and the screens that render them.
 *
 * The package owns every rule; the owning app binds its database client, member
 * directory and large-object store through `createMessagingRuntime` and the
 * `MessagingProvider` actions port.
 */
export {
  MessagingRepository,
  messageInclude,
  type MessagingDb,
} from "./repository"
export { MessagingService, type MessagingServiceDeps } from "./service"
export {
  createMessagingObjects,
  type MessagingObjects,
  type OrganizationMessageAttachment,
  type OrganizationMessagingSnapshot,
} from "./objects"
export {
  createMessagingRuntime,
  type MessagingRuntime,
  type MessagingRuntimeOptions,
} from "./runtime"
export type { MessagingMember, MessagingStorage } from "./deps"
export * from "./schemas"
export type {
  Attachment,
  AttachmentKind,
  Conversation,
  ConversationKind,
  MeetingMeta,
  Message,
  MessagingData,
  Presence,
  Reaction,
  Team,
} from "./types"
