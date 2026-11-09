"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"

import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"

import { updateSupportTicket } from "@/actions/support"

type TicketAction = "assign" | "unassign" | "acknowledge" | "resolve" | "reopen"

export function SupportTicketActions({
  ticketId,
  status,
  assignedToMe,
}: {
  ticketId: string
  status: "open" | "acknowledged" | "resolved"
  assignedToMe: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function run(action: TicketAction) {
    startTransition(async () => {
      const result = await updateSupportTicket({ ticketId, action })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success("Ticket updated.")
      router.refresh()
    })
  }

  const buttons: { action: TicketAction; label: string; primary?: boolean }[] =
    [
      assignedToMe
        ? { action: "unassign", label: "Unassign" }
        : { action: "assign", label: "Assign to me" },
      ...(status === "open"
        ? [
            {
              action: "acknowledge" as const,
              label: "Acknowledge",
              primary: true,
            },
          ]
        : []),
      ...(status !== "resolved"
        ? [
            {
              action: "resolve" as const,
              label: "Resolve",
              primary: status === "acknowledged",
            },
          ]
        : [{ action: "reopen" as const, label: "Reopen" }]),
    ]

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {buttons.map((button) => (
        <Button
          key={button.action}
          size="sm"
          variant={button.primary ? "default" : "outline"}
          disabled={pending}
          onClick={() => run(button.action)}
        >
          {button.label}
        </Button>
      ))}
    </div>
  )
}
