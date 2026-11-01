"use client"

import * as React from "react"

import {
  applyAssistantEvent,
  finishAssistantParts,
  type AssistantPart,
  type AssistantStreamEvent,
  type ChatMessage,
} from "./chat"
import {
  ASSISTANT_ORGANIZATION_HEADER,
  removeConversation,
  sortConversations,
  upsertConversation,
  type AssistantConversationSummary,
} from "./conversations"

export type AssistantStatus =
  "loading" | "ready" | "submitted" | "streaming" | "error"

interface AssistantStore {
  messages: ChatMessage[]
  conversationId: string | null
  /** Server-owned list, newest first; optimistic updates keep it in sync. */
  conversations: AssistantConversationSummary[]
  sendMessage: (input: { text: string }) => Promise<void>
  /** Starts a new chat. An untouched conversation is reused, not duplicated. */
  newConversation: () => Promise<void>
  selectConversation: (conversationId: string) => void
  deleteConversation: (conversationId: string) => Promise<void>
  /** Reloads the active conversation after a transient failure. */
  retry: () => void
  status: AssistantStatus
  error: Error | null
}

interface StoredConversation {
  id: string
  title: string
  messages: ChatMessage[]
}

const CONVERSATION_HEADER = "X-Assistant-Conversation-Id"

/** Conversations are scoped per organization, like the server history. */
function conversationStorageKey(organizationId: string) {
  return `assistant:conversation:${organizationId}`
}

function readStoredConversationId(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStoredConversationId(key: string, conversationId: string) {
  try {
    window.localStorage.setItem(key, conversationId)
  } catch {
    // Private mode: the current tab still works, the reload just starts over.
  }
}

function clearStoredConversationId(key: string) {
  try {
    window.localStorage.removeItem(key)
  } catch {
    // Nothing to clear.
  }
}

function notFoundError() {
  const error = new Error("Conversation not found")
  error.name = "ConversationNotFoundError"
  return error
}

function assistantHeaders(
  organizationId: string,
  options: { json?: boolean } = {}
): HeadersInit {
  return {
    [ASSISTANT_ORGANIZATION_HEADER]: organizationId,
    ...(options.json ? { "Content-Type": "application/json" } : {}),
  }
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError"
}

function asError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error))
}

async function fetchConversation(
  conversationId: string,
  organizationId: string,
  signal: AbortSignal
): Promise<StoredConversation> {
  const response = await fetch(
    `/api/assistant?conversationId=${encodeURIComponent(conversationId)}`,
    { signal, headers: assistantHeaders(organizationId) }
  )
  if (response.status === 404) throw notFoundError()
  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`)
  }
  return (await response.json()) as StoredConversation
}

async function fetchConversations(
  organizationId: string,
  signal?: AbortSignal
): Promise<AssistantConversationSummary[]> {
  const response = await fetch("/api/assistant/conversations", {
    signal,
    headers: assistantHeaders(organizationId),
  })
  if (!response.ok) throw new Error(`Request failed (${response.status})`)
  const body = (await response.json()) as {
    conversations?: AssistantConversationSummary[]
  }
  return Array.isArray(body.conversations) ? body.conversations : []
}

const AssistantContext = React.createContext<AssistantStore | null>(null)

/**
 * Owns the visible transcript and the conversation list.
 *
 * The server owns history: the store posts only `{ conversationId?, text }`
 * and loads a conversation through its id. The only client-side state that
 * outlives a reload is the selected conversation id, kept per organization.
 *
 * `initialConversations` comes from the server-rendered page so the list is
 * present on first paint; create and delete update it optimistically and the
 * next reload asks the server again.
 */
export function AssistantProvider({
  organizationId,
  initialConversations = [],
  children,
}: {
  organizationId: string
  initialConversations?: AssistantConversationSummary[]
  children: React.ReactNode
}) {
  const storageKey = React.useMemo(
    () => conversationStorageKey(organizationId),
    [organizationId]
  )
  const [messages, setMessages] = React.useState<ChatMessage[]>([])
  const [conversationId, setConversationId] = React.useState<string | null>(
    null
  )
  const [conversations, setConversations] = React.useState<
    AssistantConversationSummary[]
  >(() => sortConversations(initialConversations))
  const [status, setStatus] = React.useState<AssistantStatus>("ready")
  const [error, setError] = React.useState<Error | null>(null)

  const messagesRef = React.useRef(messages)
  messagesRef.current = messages
  const conversationIdRef = React.useRef(conversationId)
  conversationIdRef.current = conversationId
  const statusRef = React.useRef(status)
  statusRef.current = status
  /** The request that is allowed to update state; newer ones cancel it. */
  const requestRef = React.useRef<AbortController | null>(null)

  const replaceMessages = React.useCallback((next: ChatMessage[]) => {
    messagesRef.current = next
    setMessages(next)
  }, [])

  const cancelActiveRequest = React.useCallback(() => {
    requestRef.current?.abort()
    requestRef.current = null
  }, [])

  const clearConversation = React.useCallback(() => {
    conversationIdRef.current = null
    setConversationId(null)
    replaceMessages([])
    clearStoredConversationId(storageKey)
    setError(null)
    setStatus("ready")
  }, [replaceMessages, storageKey])

  /** Loads one conversation, rejecting ids that are not the user's. */
  const openConversation = React.useCallback(
    async (id: string) => {
      cancelActiveRequest()
      const controller = new AbortController()
      requestRef.current = controller

      conversationIdRef.current = id
      setConversationId(id)
      replaceMessages([])
      writeStoredConversationId(storageKey, id)
      setError(null)
      setStatus("loading")

      try {
        const conversation = await fetchConversation(
          id,
          organizationId,
          controller.signal
        )
        if (requestRef.current !== controller) return
        requestRef.current = null
        conversationIdRef.current = conversation.id
        setConversationId(conversation.id)
        replaceMessages(conversation.messages)
        setStatus("ready")
      } catch (err) {
        if (requestRef.current !== controller || isAbortError(err)) return
        requestRef.current = null
        if (err instanceof Error && err.name === "ConversationNotFoundError") {
          // Deleted or belongs to someone else: forget it and start clean.
          setConversations((previous) => removeConversation(previous, id))
          clearConversation()
          return
        }
        setError(asError(err))
        setStatus("error")
      }
    },
    [
      cancelActiveRequest,
      clearConversation,
      organizationId,
      replaceMessages,
      storageKey,
    ]
  )

  // Reload the conversation the server still has for this organization.
  React.useEffect(() => {
    const stored = readStoredConversationId(storageKey)
    if (!stored) {
      clearConversation()
      return
    }
    void openConversation(stored)

    return () => {
      requestRef.current?.abort()
    }
  }, [storageKey, openConversation, clearConversation])

  // A server reload of the page (or an organization switch) is authoritative.
  React.useEffect(() => {
    setConversations(sortConversations(initialConversations))
  }, [initialConversations])

  const refreshConversations = React.useCallback(async () => {
    try {
      const next = await fetchConversations(organizationId)
      setConversations(sortConversations(next))
    } catch {
      // The transcript already succeeded; the list is cosmetic.
    }
  }, [organizationId])

  const sendMessage = React.useCallback(
    async ({ text }: { text: string }) => {
      const value = text.trim()
      if (!value) return

      cancelActiveRequest()
      const controller = new AbortController()
      requestRef.current = controller

      const userMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        parts: [{ type: "text", text: value }],
      }
      const assistantId = crypto.randomUUID()

      setError(null)
      setStatus("submitted")
      replaceMessages([
        ...messagesRef.current,
        userMessage,
        { id: assistantId, role: "assistant", parts: [] },
      ])

      const updateAssistant = (
        mutate: (parts: AssistantPart[]) => AssistantPart[]
      ) => {
        replaceMessages(
          messagesRef.current.map((message) =>
            message.id === assistantId
              ? { ...message, parts: mutate(message.parts) }
              : message
          )
        )
      }

      const handle = (event: AssistantStreamEvent) => {
        if (event.type === "error") {
          throw new Error(event.message)
        }
        if (event.type === "done") return
        updateAssistant((parts) => applyAssistantEvent(parts, event))
      }

      try {
        const currentConversationId = conversationIdRef.current
        const response = await fetch("/api/assistant", {
          method: "POST",
          headers: assistantHeaders(organizationId, { json: true }),
          signal: controller.signal,
          body: JSON.stringify({
            text: value,
            ...(currentConversationId
              ? { conversationId: currentConversationId }
              : {}),
          }),
        })

        if (requestRef.current !== controller) return

        if (!response.ok || !response.body) {
          // Coded errors (`quota_exceeded`, `upgrade_required`…) carry a
          // `code` that the workspace translates.
          const body = (await response.json().catch(() => null)) as {
            error?: { code?: string; message?: string }
          } | null
          throw Object.assign(
            new Error(
              body?.error?.message ?? `Request failed (${response.status})`
            ),
            { code: body?.error?.code }
          )
        }

        // The server creates the conversation on the first turn and returns it
        // in a header, before any token is streamed.
        const returnedConversationId = response.headers.get(CONVERSATION_HEADER)
        if (
          returnedConversationId &&
          returnedConversationId !== conversationIdRef.current
        ) {
          conversationIdRef.current = returnedConversationId
          setConversationId(returnedConversationId)
          writeStoredConversationId(storageKey, returnedConversationId)
        }

        setStatus("streaming")
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ""

        for (;;) {
          const { done, value: chunk } = await reader.read()
          if (done) break
          if (requestRef.current !== controller) {
            await reader.cancel().catch(() => {})
            return
          }
          buffer += decoder.decode(chunk, { stream: true })
          let newlineIndex = buffer.indexOf("\n")
          while (newlineIndex !== -1) {
            const line = buffer.slice(0, newlineIndex).trim()
            buffer = buffer.slice(newlineIndex + 1)
            if (line) handle(JSON.parse(line) as AssistantStreamEvent)
            newlineIndex = buffer.indexOf("\n")
          }
        }

        updateAssistant((parts) => finishAssistantParts(parts))
        setStatus("ready")
      } catch (err) {
        if (requestRef.current !== controller || isAbortError(err)) return
        setError(asError(err))
        setStatus("error")
      } finally {
        if (requestRef.current === controller) requestRef.current = null
        // The first persisted turn changes the derived title and the ordering.
        void refreshConversations()
      }
    },
    [
      cancelActiveRequest,
      organizationId,
      refreshConversations,
      replaceMessages,
      storageKey,
    ]
  )

  const newConversation = React.useCallback(async () => {
    cancelActiveRequest()
    setError(null)

    // An untouched chat is already a new chat: reusing it keeps the list free
    // of empty rows when the user clicks "New chat" twice.
    if (conversationIdRef.current && messagesRef.current.length === 0) {
      setStatus("ready")
      return
    }

    setStatus("loading")
    try {
      const response = await fetch("/api/assistant/conversations", {
        method: "POST",
        headers: assistantHeaders(organizationId),
      })
      if (!response.ok) {
        throw new Error(`Request failed (${response.status})`)
      }
      const body = (await response.json()) as {
        conversation?: AssistantConversationSummary
      }
      if (!body.conversation) throw new Error("Malformed conversation")

      const conversation = body.conversation
      setConversations((previous) => upsertConversation(previous, conversation))
      conversationIdRef.current = conversation.id
      setConversationId(conversation.id)
      replaceMessages([])
      writeStoredConversationId(storageKey, conversation.id)
      setStatus("ready")
    } catch (err) {
      setError(asError(err))
      setStatus("error")
    }
  }, [cancelActiveRequest, organizationId, replaceMessages, storageKey])

  const selectConversation = React.useCallback(
    (id: string) => {
      if (id === conversationIdRef.current && statusRef.current !== "error") {
        return
      }
      void openConversation(id)
    },
    [openConversation]
  )

  const deleteConversation = React.useCallback(
    async (id: string) => {
      const deletingCurrent = conversationIdRef.current === id
      if (deletingCurrent) cancelActiveRequest()

      try {
        const response = await fetch(
          `/api/assistant/conversations/${encodeURIComponent(id)}`,
          { method: "DELETE", headers: assistantHeaders(organizationId) }
        )
        // A conversation deleted in another tab is already gone here.
        if (!response.ok && response.status !== 404) {
          throw new Error(`Request failed (${response.status})`)
        }
        setConversations((previous) => removeConversation(previous, id))
        if (deletingCurrent) clearConversation()
      } catch (err) {
        setError(asError(err))
        setStatus("error")
      }
    },
    [cancelActiveRequest, clearConversation, organizationId]
  )

  const retry = React.useCallback(() => {
    if (conversationIdRef.current) {
      void openConversation(conversationIdRef.current)
      return
    }
    setError(null)
    setStatus("ready")
  }, [openConversation])

  const store = React.useMemo<AssistantStore>(
    () => ({
      messages,
      conversationId,
      conversations,
      sendMessage,
      newConversation,
      selectConversation,
      deleteConversation,
      retry,
      status,
      error,
    }),
    [
      messages,
      conversationId,
      conversations,
      sendMessage,
      newConversation,
      selectConversation,
      deleteConversation,
      retry,
      status,
      error,
    ]
  )

  return (
    <AssistantContext.Provider value={store}>
      {children}
    </AssistantContext.Provider>
  )
}

export function useAssistant() {
  const context = React.useContext(AssistantContext)
  if (!context) {
    throw new Error("useAssistant must be used within an AssistantProvider")
  }
  return context
}
