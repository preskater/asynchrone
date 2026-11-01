"use client"

import * as React from "react"

import { toAgentInput, type AssistantPart, type ChatMessage } from "./chat"

export type AssistantStatus = "ready" | "submitted" | "streaming" | "error"

interface AssistantEvent {
  type: "text" | "reasoning" | "tool_call" | "tool_output" | "error" | "done"
  delta?: string
  text?: string
  name?: string
  callId?: string
  args?: string
  output?: string
  message?: string
}

interface AssistantStore {
  messages: ChatMessage[]
  sendMessage: (input: { text: string }) => Promise<void>
  status: AssistantStatus
  error: Error | null
}

const AssistantContext = React.createContext<AssistantStore | null>(null)

export function AssistantProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = React.useState<ChatMessage[]>([])
  const [status, setStatus] = React.useState<AssistantStatus>("ready")
  const [error, setError] = React.useState<Error | null>(null)

  const messagesRef = React.useRef(messages)
  messagesRef.current = messages

  const sendMessage = React.useCallback(async ({ text }: { text: string }) => {
    const value = text.trim()
    if (!value) return

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      parts: [{ type: "text", text: value }],
    }
    const assistantId = crypto.randomUUID()
    const history = [...messagesRef.current, userMessage]

    setError(null)
    setStatus("submitted")
    setMessages((prev) => {
      const next: ChatMessage[] = [
        ...prev,
        userMessage,
        { id: assistantId, role: "assistant", parts: [] },
      ]
      messagesRef.current = next
      return next
    })

    const updateAssistant = (
      mutate: (parts: AssistantPart[]) => AssistantPart[]
    ) => {
      setMessages((prev) => {
        const next = prev.map((message) =>
          message.id === assistantId
            ? { ...message, parts: mutate(message.parts) }
            : message
        )
        messagesRef.current = next
        return next
      })
    }

    const handle = (event: AssistantEvent) => {
      if (event.type === "text") {
        const delta = event.delta ?? ""
        updateAssistant((parts) => {
          const last = parts[parts.length - 1]
          if (last && last.type === "text") {
            return [...parts.slice(0, -1), { ...last, text: last.text + delta }]
          }
          return [...parts, { type: "text", text: delta }]
        })
      } else if (event.type === "reasoning") {
        const text = event.text ?? ""
        updateAssistant((parts) => {
          const last = parts[parts.length - 1]
          if (last && last.type === "reasoning" && last.state === "streaming") {
            return [...parts.slice(0, -1), { ...last, text: last.text + text }]
          }
          return [...parts, { type: "reasoning", text, state: "streaming" }]
        })
      } else if (event.type === "tool_call") {
        updateAssistant((parts) => [
          ...parts,
          {
            type: "tool",
            name: event.name ?? "tool",
            callId: event.callId ?? "",
            args: event.args ?? "",
            state: "call",
          },
        ])
      } else if (event.type === "tool_output") {
        updateAssistant((parts) =>
          parts.map((part) =>
            part.type === "tool" && part.callId === event.callId
              ? { ...part, state: "output", output: event.output }
              : part
          )
        )
      } else if (event.type === "error") {
        throw new Error(event.message ?? "The assistant failed.")
      }
    }

    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: toAgentInput(history) }),
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

      setStatus("streaming")
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""

      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        let newlineIndex = buffer.indexOf("\n")
        while (newlineIndex !== -1) {
          const line = buffer.slice(0, newlineIndex).trim()
          buffer = buffer.slice(newlineIndex + 1)
          if (line) handle(JSON.parse(line) as AssistantEvent)
          newlineIndex = buffer.indexOf("\n")
        }
      }

      updateAssistant((parts) =>
        parts.map((part) =>
          part.type === "reasoning" && part.state === "streaming"
            ? { ...part, state: "done" }
            : part
        )
      )
      setStatus("ready")
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)))
      setStatus("error")
    }
  }, [])

  const store = React.useMemo<AssistantStore>(
    () => ({ messages, sendMessage, status, error }),
    [messages, sendMessage, status, error]
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
