import { notify } from "@/lib/identity"

/**
 * The inbox lives in Copilot. This app only emits notifications through
 * `/internal/v1/notifications`; failures are logged by `notify` and never fail
 * the mutation that triggered them.
 */
export const notificationService = { notify }

export function createNotificationService() {
  return { notify }
}
