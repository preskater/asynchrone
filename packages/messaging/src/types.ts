export type Presence = "online" | "away" | "busy" | "offline"

/**
 * A member of the organization, as the conversation screens render it. The
 * owning app binds its member directory (see `MessagingMember` in `deps.ts`).
 */
export interface MessagingMember {
  id: string
  name: string
  email: string
  avatarUrl?: string
  role: string
}

export type ConversationKind = "channel" | "dm"

export type AttachmentKind = "file" | "image"

export interface Attachment {
  id: string
  name: string
  kind: AttachmentKind
  meta?: string
  oid?: number
  sha256?: string
  mimeType?: string
  sizeBytes?: number
  hasStorage?: boolean
}

export interface Reaction {
  emoji: string
  memberIds: string[]
}

export interface Message {
  id: string
  conversationId: string
  authorId: string
  body: string
  createdAt: string
  reactions: Reaction[]
  attachments: Attachment[]
  parentId?: string
  edited?: boolean
  system?: boolean
  meeting?: MeetingMeta
}

export interface MeetingMeta {
  title: string
  startsAt: string
  durationMinutes: number
}

export interface Team {
  id: string
  name: string
  description?: string
  channelIds: string[]
}

export interface Conversation {
  id: string
  kind: ConversationKind
  name: string
  teamId?: string
  memberIds: string[]
  topic?: string
  unreadCount: number
  lastMessageAt: string
  muted?: boolean
  pinned?: boolean
}

export interface MessagingData {
  teams: Team[]
  conversations: Conversation[]
  messages: Message[]
  presence: Record<string, Presence>
  typing: Record<string, string[]>
}
