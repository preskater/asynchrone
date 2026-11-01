"use client"

import * as React from "react"

import {
  applyAssistantEvent,
  finishAssistantParts,
  type AssistantPart,
  type AssistantStreamEvent,
  type ChatMessage,
} from "./chat"

export type AssistantStatus =
  "loading" | "ready" | "submitted" | "streaming" | "error"

interface AssistantStore {
  messages: ChatMessage[]
  conversationId: string | null
  sendMessage: (input: { text: string }) => Promise<void>
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

async function fetchConversation(
  conversationId: string
): Promise<StoredConversation> {
  const response = await fetch(
    `/api/assistant?conversationId=${encodeURIComponent(conversationId)}`
  )
  if (response.status === 404) throw notFoundError()
  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`)
  }
  return (await response.json()) as StoredConversation
}

const AssistantContext = React.createContext<AssistantStore | null>(null)

/**
 * Owns the visible transcript.
 *
 * The server owns history: the store posts only `{ conversationId?, text }`
 * and reloads the conversation it remembers for the organization. The only
 * client-side state that outlives a reload is the conversation id.
 */
export function AssistantProvider({
  organizationId,
  children,
}: {
  organizationId: string
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
  const [status, setStatus] = React.useState<AssistantStatus>("ready")
  const [error, setError] = React.useState<Error | null>(null)

  const messagesRef = React.useRef(messages)
  messagesRef.current = messages
  const conversationIdRef = React.useRef(conversationId)
  conversationIdRef.current = conversationId

  const replaceMessages = React.useCallback((next: ChatMessage[]) => {
    messagesRef.current = next
    setMessages(next)
  }, [])

  // Reload the conversation the server still has for this organization.
  React.useEffect(() => {
    const stored = readStoredConversationId(storageKey)
    if (!stored) {
      conversationIdRef.current = null
      setConversationId(null)
      replaceMessages([])
      setError(null)
      setStatus("ready")
      return
    }

    let cancelled = false
    setStatus("loading")
    setError(null)

    fetchConversation(stored)
      .then((conversation) => {
        if (cancelled) return
        conversationIdRef.current = conversation.id
        setConversationId(conversation.id)
        replaceMessages(conversation.messages)
        setStatus("ready")
      })
      .catch((err: unknown) => {
        if (cancelled) return
        if (err instanceof Error && err.name === "ConversationNotFoundError") {
          // Deleted or belongs to another user/organization: start clean.
          clearStoredConversationId(storageKey)
          conversationIdRef.current = null
          setConversationId(null)
          replaceMessages([])
          setStatus("ready")
          return
        }
        setError(err instanceof Error ? err : new Error(String(err)))
        setStatus("error")
      })

    return () => {
      cancelled = true
    }
  }, [storageKey, replaceMessages])

  const sendMessage = React.useCallback(
    async ({ text }: { text: string }) => {
      const value = text.trim()
      if (!value) return

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
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: value,
            ...(currentConversationId
              ? { conversationId: currentConversationId }
              : {}),
          }),
        })

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
        setError(err instanceof Error ? err : new Error(String(err)))
        setStatus("error")
      }
    },
    [replaceMessages, storageKey]
  )

  const store = React.useMemo<AssistantStore>(
    () => ({ messages, conversationId, sendMessage, status, error }),
    [messages, conversationId, sendMessage, status, error]
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
