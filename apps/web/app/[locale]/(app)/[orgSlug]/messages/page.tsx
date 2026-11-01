import { MessagesWorkspace } from "@/components/messaging-workspace"

export default function MessagesPage() {
  return (
    <div className="flex h-[calc(100svh_-_var(--header-height))] min-h-0 flex-col overflow-hidden p-4 md:h-[calc(100svh_-_var(--header-height)_-_1rem)]">
      <MessagesWorkspace />
    </div>
  )
}
