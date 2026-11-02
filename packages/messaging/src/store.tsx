"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { toast } from "sonner"

import { unwrapActionResult, type ActionResult } from "@workspace/core/action"
import type { Page } from "@workspace/core/pagination"
import { useErrorTranslator } from "@workspace/i18n/errors"

import type {
  Attachment,
  Conversation,
  MeetingMeta,
  Message,
  MessagingData,
  MessagingMember,
  Presence,
  Reaction,
  Team,
} from "./types"

/**
 * The read side of the screens: the polls and the conversation pages.
 *
 * These are deliberately *not* server actions. A server-action response applies
 * an RSC payload through the client router, which re-renders the route (the
 * layout passes fresh `initialData`, resetting the client store) and can abort
 * an in-flight navigation — the organization-switch handoff left the app while
 * a poll was landing (#171). Reads therefore go through route handlers with a
 * plain `fetch` and return their data directly, throwing on failure.
 */
export interface MessagingLive {
  poll: () => Promise<MessagingData>
  pollMessages: (
    conversationId: string,
    cursor?: string | null
  ) => Promise<Page<Message>>
  touchPresence: () => Promise<void>
}

/**
 * The server actions the messaging screens call for mutations. The messages app
 * passes its `actions/messaging.ts` exports. Every action returns an
 * `ActionResult` so optimistic updates can roll back on failure.
 */
export interface MessagingActions {
  sendMessageAction: (input: SendMessageInput) => Promise<ActionResult<Message>>
  editMessageAction: (
    id: string,
    body: string
  ) => Promise<ActionResult<Message>>
  deleteMessageAction: (id: string) => Promise<ActionResult<{ id: string }>>
  toggleReactionAction: (
    messageId: string,
    input: { emoji: string }
  ) => Promise<ActionResult<Message>>
  addThreadReplyAction: (
    parentId: string,
    body: string
  ) => Promise<ActionResult<Message>>
  markReadAction: (
    conversationId: string
  ) => Promise<ActionResult<Conversation | null>>
  startDmAction: (memberId: string) => Promise<ActionResult<Conversation>>
  createChannelAction: (input: {
    teamId: string
    name: string
    topic?: string
  }) => Promise<ActionResult<Conversation>>
  toggleMuteAction: (
    conversationId: string,
    muted?: boolean
  ) => Promise<ActionResult<Conversation>>
  togglePinAction: (
    conversationId: string,
    pinned?: boolean
  ) => Promise<ActionResult<Conversation>>
}

function uid(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`
}

const unwrap = unwrapActionResult

export interface SendMessageInput {
  conversationId: string
  body: string
  attachments?: Attachment[]
  meeting?: MeetingMeta
  parentId?: string
}

interface MessagingStore extends MessagingData {
  members: MessagingMember[]
  currentUserId: string
  organizationId: string
  getMember: (id?: string) => MessagingMember | undefined
  getTeam: (id?: string) => Team | undefined
  getConversation: (id?: string) => Conversation | undefined
  messagesFor: (conversationId: string) => Message[]
  repliesFor: (parentId: string) => Message[]
  ensureMessages: (conversationId: string) => void
  loadOlderMessages: (conversationId: string) => void
  hasMoreMessages: (conversationId: string) => boolean
  messagesLoading: Record<string, boolean>
  lastMessageFor: (conversationId: string) => Message | undefined
  dmPartner: (conversation: Conversation) => string | undefined
  unreadTotal: number
  sendMessage: (input: SendMessageInput) => void
  editMessage: (id: string, body: string) => void
  deleteMessage: (id: string) => void
  toggleReaction: (messageId: string, emoji: string) => void
  addThreadReply: (parentId: string, body: string) => void
  markRead: (conversationId: string) => void
  startDirectMessage: (memberId: string) => string
  createChannel: (teamId: string, name: string, topic?: string) => string
  setTyping: (
    conversationId: string,
    memberId: string,
    isTyping: boolean
  ) => void
  toggleMute: (conversationId: string) => void
  togglePin: (conversationId: string) => void
}

const MessagingContext = React.createContext<MessagingStore | null>(null)

export function MessagingProvider({
  children,
  actions,
  live,
  initialData,
  currentUserId,
  organizationId,
  members = [],
}: {
  children: React.ReactNode
  actions: MessagingActions
  live: MessagingLive
  initialData: MessagingData
  currentUserId: string
  organizationId: string
  members?: MessagingMember[]
}) {
  const t = useTranslations("Toasts")
  const te = useErrorTranslator()
  const [conversations, setConversations] = React.useState<Conversation[]>(
    initialData.conversations
  )
  const [messages, setMessages] = React.useState<Message[]>(
    initialData.messages
  )
  const [cursors, setCursors] = React.useState<Record<string, string | null>>(
    {}
  )
  const [messagesLoading, setMessagesLoading] = React.useState<
    Record<string, boolean>
  >({})
  const activeConversationRef = React.useRef<string | null>(null)
  const [teams, setTeams] = React.useState<Team[]>(initialData.teams)
  const [presence, setPresence] = React.useState<Record<string, Presence>>(
    initialData.presence
  )
  const [typing, setTypingState] = React.useState<Record<string, string[]>>(
    initialData.typing
  )

  React.useEffect(() => {
    setConversations(initialData.conversations)
    setMessages(initialData.messages)
    setTeams(initialData.teams)
    setPresence(initialData.presence)
    setTypingState(initialData.typing)
  }, [initialData])

  const mergeConversation = React.useCallback(
    (conversationId: string, fetched: Message[]) => {
      setMessages((prev) => {
        const fetchedIds = new Set(fetched.map((message) => message.id))
        const oldestFetched = fetched.reduce(
          (oldest, message) =>
            Math.min(oldest, new Date(message.createdAt).getTime()),
          Number.POSITIVE_INFINITY
        )
        const newestFetched = fetched.reduce(
          (newest, message) =>
            Math.max(newest, new Date(message.createdAt).getTime()),
          Number.NEGATIVE_INFINITY
        )
        const others = prev.filter(
          (message) => message.conversationId !== conversationId
        )
        // Keep pages loaded through "load earlier" plus pending optimistic
        // messages; replace the newest page with the server copy. Optimistic
        // rows have a `m_` id and are appended below, so `older` must exclude
        // them (an empty first page makes every row older than `Infinity`).
        const older = prev.filter(
          (message) =>
            message.conversationId === conversationId &&
            !fetchedIds.has(message.id) &&
            !message.id.startsWith("m_") &&
            new Date(message.createdAt).getTime() < oldestFetched
        )
        // A sent message the snapshot predates: the read started before this
        // row was persisted, so keeping it is the only correct outcome — the
        // next poll includes it anyway (a stale response used to drop it).
        const newer = prev.filter(
          (message) =>
            message.conversationId === conversationId &&
            !fetchedIds.has(message.id) &&
            !message.id.startsWith("m_") &&
            new Date(message.createdAt).getTime() > newestFetched
        )
        const optimistic = prev.filter(
          (message) =>
            message.conversationId === conversationId &&
            message.id.startsWith("m_") &&
            !fetchedIds.has(message.id)
        )
        return [...others, ...older, ...fetched, ...newer, ...optimistic]
      })
    },
    []
  )

  const ensureMessages = React.useCallback(
    (conversationId: string) => {
      activeConversationRef.current = conversationId
      if (
        cursors[conversationId] !== undefined ||
        messagesLoading[conversationId]
      ) {
        return
      }
      setMessagesLoading((prev) => ({ ...prev, [conversationId]: true }))
      void live
        .pollMessages(conversationId)
        .then((page) => {
          mergeConversation(conversationId, page.items)
          setCursors((prev) => ({
            ...prev,
            [conversationId]: page.nextCursor,
          }))
        })
        .catch(() => {})
        .finally(() =>
          setMessagesLoading((prev) => ({
            ...prev,
            [conversationId]: false,
          }))
        )
    },
    [live, cursors, messagesLoading, mergeConversation]
  )

  const loadOlderMessages = React.useCallback(
    (conversationId: string) => {
      const cursor = cursors[conversationId]
      if (!cursor || messagesLoading[conversationId]) return
      setMessagesLoading((prev) => ({ ...prev, [conversationId]: true }))
      void live
        .pollMessages(conversationId, cursor)
        .then((page) => {
          setMessages((prev) => {
            const existing = new Set(
              prev
                .filter((message) => message.conversationId === conversationId)
                .map((message) => message.id)
            )
            const older = page.items.filter(
              (message) => !existing.has(message.id)
            )
            return [...older, ...prev]
          })
          setCursors((prev) => ({
            ...prev,
            [conversationId]: page.nextCursor,
          }))
        })
        .catch(() => {})
        .finally(() =>
          setMessagesLoading((prev) => ({
            ...prev,
            [conversationId]: false,
          }))
        )
    },
    [live, cursors, messagesLoading]
  )

  React.useEffect(() => {
    let active = true
    const refetch = () => {
      void live
        .poll()
        .then((data) => {
          if (!active) return
          setConversations(data.conversations)
          setTeams(data.teams)
          setPresence(data.presence)
          setTypingState(data.typing)
        })
        .catch(() => {})
      const conversationId = activeConversationRef.current
      if (conversationId) {
        void live
          .pollMessages(conversationId)
          .then((page) => {
            if (!active) return
            mergeConversation(conversationId, page.items)
          })
          .catch(() => {})
      }
    }

    const onVisible = () => {
      if (document.visibilityState === "visible") refetch()
    }
    window.addEventListener("focus", onVisible)
    document.addEventListener("visibilitychange", onVisible)
    const poll = window.setInterval(() => {
      if (document.visibilityState === "visible") refetch()
    }, 5000)
    // Presence is coarse: write at most once every 30s, not on every poll.
    const presence = window.setInterval(() => {
      if (document.visibilityState === "visible")
        void live.touchPresence().catch(() => {})
    }, 30000)
    void live.touchPresence().catch(() => {})

    return () => {
      active = false
      window.clearInterval(poll)
      window.clearInterval(presence)
      window.removeEventListener("focus", onVisible)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [live, mergeConversation])

  const store = React.useMemo<MessagingStore>(() => {
    const getMember = (id?: string) =>
      id ? members.find((member) => member.id === id) : undefined
    const getTeam = (id?: string) => teams.find((team) => team.id === id)
    const getConversation = (id?: string) =>
      conversations.find((conversation) => conversation.id === id)

    const messagesFor = (conversationId: string) =>
      messages
        .filter(
          (message) =>
            message.conversationId === conversationId && !message.parentId
        )
        .sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        )

    const repliesFor = (parentId: string) =>
      messages
        .filter((message) => message.parentId === parentId)
        .sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        )

    const lastMessageFor = (conversationId: string) => {
      const list = messages
        .filter((message) => message.conversationId === conversationId)
        .sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        )
      return list[list.length - 1]
    }

    const dmPartner = (conversation: Conversation) =>
      conversation.kind === "dm"
        ? conversation.memberIds.find((id) => id !== currentUserId)
        : undefined

    function sendMessage(input: SendMessageInput) {
      const optimistic: Message = {
        id: uid("m"),
        conversationId: input.conversationId,
        authorId: currentUserId,
        body: input.body,
        createdAt: new Date().toISOString(),
        reactions: [],
        attachments: input.attachments ?? [],
        parentId: input.parentId,
        meeting: input.meeting,
      }
      setMessages((prev) => {
        const next = [...prev, optimistic]
        const inConversation = next.filter(
          (message) => message.conversationId === input.conversationId
        )
        if (inConversation.length <= 200) return next
        const keep = new Set(
          inConversation.slice(-200).map((message) => message.id)
        )
        return next.filter(
          (message) =>
            message.conversationId !== input.conversationId ||
            keep.has(message.id)
        )
      })
      if (!input.parentId) {
        setConversations((prev) =>
          prev.map((conversation) =>
            conversation.id === input.conversationId
              ? {
                  ...conversation,
                  lastMessageAt: optimistic.createdAt,
                  unreadCount: 0,
                }
              : conversation
          )
        )
      }
      void actions
        .sendMessageAction(input)
        .then((result) => {
          const message = unwrap(result)
          setMessages((prev) =>
            prev.map((item) => (item.id === optimistic.id ? message : item))
          )
        })
        .catch((error) => {
          setMessages((prev) =>
            prev.filter((item) => item.id !== optimistic.id)
          )
          toast.error(te(error, "messageFailed"))
        })
    }

    return {
      teams,
      conversations,
      messages,
      presence,
      typing,
      members,
      currentUserId,
      organizationId,
      getMember,
      getTeam,
      getConversation,
      messagesFor,
      repliesFor,
      ensureMessages,
      loadOlderMessages,
      hasMoreMessages: (conversationId) => Boolean(cursors[conversationId]),
      messagesLoading,
      lastMessageFor,
      dmPartner,
      unreadTotal: conversations.reduce(
        (total, conversation) => total + conversation.unreadCount,
        0
      ),
      sendMessage,
      editMessage: (id, body) => {
        setMessages((prev) =>
          prev.map((message) =>
            message.id === id ? { ...message, body, edited: true } : message
          )
        )
        void actions
          .editMessageAction(id, body)
          .then((result) => {
            unwrap(result)
            toast.success(t("messageEdited"))
          })
          .catch((error) => toast.error(te(error, "editFailed")))
      },
      deleteMessage: (id) => {
        setMessages((prev) =>
          prev.filter((message) => message.id !== id && message.parentId !== id)
        )
        void actions
          .deleteMessageAction(id)
          .then((result) => {
            unwrap(result)
            toast.success(t("messageDeleted"))
          })
          .catch((error) => toast.error(te(error, "deleteFailed")))
      },
      toggleReaction: (messageId, emoji) => {
        setMessages((prev) =>
          prev.map((message) => {
            if (message.id !== messageId) return message
            return {
              ...message,
              reactions: toggleReactionFor(
                message.reactions,
                emoji,
                currentUserId
              ),
            }
          })
        )
        void actions
          .toggleReactionAction(messageId, { emoji })
          .then((result) => unwrap(result))
          .catch((error) => toast.error(te(error, "reactionFailed")))
      },
      addThreadReply: (parentId, body) => {
        const parentMessage = messages.find(
          (message) => message.id === parentId
        )
        if (!parentMessage) return
        const optimistic: Message = {
          id: uid("m"),
          conversationId: parentMessage.conversationId,
          authorId: currentUserId,
          body,
          createdAt: new Date().toISOString(),
          reactions: [],
          attachments: [],
          parentId,
        }
        setMessages((prev) => [...prev, optimistic])
        void actions
          .addThreadReplyAction(parentId, body)
          .then((result) => {
            const message = unwrap(result)
            setMessages((prev) =>
              prev.map((item) => (item.id === optimistic.id ? message : item))
            )
          })
          .catch((error) => toast.error(te(error, "replyFailed")))
      },
      markRead: (conversationId) => {
        const target = getConversation(conversationId)
        if (!target || target.unreadCount === 0) return
        setConversations((prev) =>
          prev.map((conversation) =>
            conversation.id === conversationId
              ? { ...conversation, unreadCount: 0 }
              : conversation
          )
        )
        void actions.markReadAction(conversationId).catch(() => undefined)
      },
      startDirectMessage: (memberId) => {
        const existing = conversations.find(
          (conversation) =>
            conversation.kind === "dm" &&
            conversation.memberIds.includes(memberId)
        )
        if (existing) return existing.id
        const member = getMember(memberId)
        const id = uid("dm")
        setConversations((prev) => [
          {
            id,
            kind: "dm",
            name: member?.name ?? "Direct message",
            memberIds: [currentUserId, memberId],
            unreadCount: 0,
            lastMessageAt: new Date().toISOString(),
          },
          ...prev,
        ])
        void actions
          .startDmAction(memberId)
          .then((result) => {
            const conversation = unwrap(result)
            setConversations((prev) =>
              prev.map((item) => (item.id === id ? conversation : item))
            )
            toast.success(
              t("chatStarted", { name: member?.name ?? t("teammate") })
            )
          })
          .catch((error) => {
            setConversations((prev) => prev.filter((item) => item.id !== id))
            toast.error(te(error, "chatFailed"))
          })
        return id
      },
      createChannel: (teamId, name, topic) => {
        const id = uid("c")
        setConversations((prev) => [
          ...prev,
          {
            id,
            kind: "channel",
            name,
            teamId,
            topic,
            memberIds: [currentUserId],
            unreadCount: 0,
            lastMessageAt: new Date().toISOString(),
          },
        ])
        setTeams((prev) =>
          prev.map((team) =>
            team.id === teamId
              ? { ...team, channelIds: [...team.channelIds, id] }
              : team
          )
        )
        void actions
          .createChannelAction({ teamId, name, topic })
          .then((result) => {
            const conversation = unwrap(result)
            setConversations((prev) =>
              prev.map((item) => (item.id === id ? conversation : item))
            )
            toast.success(t("channelCreated", { name }))
          })
          .catch((error) => {
            setConversations((prev) => prev.filter((item) => item.id !== id))
            toast.error(te(error, "channelFailed"))
          })
        return id
      },
      setTyping: () => {
        // Ephemeral typing indicators require realtime transport; without it
        // we avoid per-keystroke server round-trips entirely.
      },
      toggleMute: (conversationId) => {
        let muted = false
        setConversations((prev) =>
          prev.map((conversation) => {
            if (conversation.id !== conversationId) return conversation
            muted = !conversation.muted
            return { ...conversation, muted }
          })
        )
        void actions
          .toggleMuteAction(conversationId, muted)
          .then((result) => unwrap(result))
          .catch((error) => toast.error(te(error, "updateFailed")))
      },
      togglePin: (conversationId) => {
        let pinned = false
        setConversations((prev) =>
          prev.map((conversation) => {
            if (conversation.id !== conversationId) return conversation
            pinned = !conversation.pinned
            return { ...conversation, pinned }
          })
        )
        void actions
          .togglePinAction(conversationId, pinned)
          .then((result) => unwrap(result))
          .catch((error) => toast.error(te(error, "updateFailed")))
      },
    }
  }, [
    conversations,
    messages,
    teams,
    presence,
    typing,
    members,
    currentUserId,
    organizationId,
    cursors,
    messagesLoading,
    ensureMessages,
    loadOlderMessages,
    actions,
  ])

  return (
    <MessagingContext.Provider value={store}>
      {children}
    </MessagingContext.Provider>
  )
}

function toggleReactionFor(
  reactions: Reaction[],
  emoji: string,
  memberId: string
): Reaction[] {
  const existing = reactions.find((reaction) => reaction.emoji === emoji)
  if (!existing) {
    return [...reactions, { emoji, memberIds: [memberId] }]
  }
  const hasReacted = existing.memberIds.includes(memberId)
  const memberIds = hasReacted
    ? existing.memberIds.filter((id) => id !== memberId)
    : [...existing.memberIds, memberId]
  return reactions
    .map((reaction) =>
      reaction.emoji === emoji ? { ...reaction, memberIds } : reaction
    )
    .filter((reaction) => reaction.memberIds.length > 0)
}

export function useMessaging() {
  const context = React.useContext(MessagingContext)
  if (!context) {
    throw new Error("useMessaging must be used within a MessagingProvider")
  }
  return context
}
