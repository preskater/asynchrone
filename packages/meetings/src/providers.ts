import { ForbiddenError } from "@workspace/core/errors"

import type { MeetingProviderId } from "./types"

/** What a provider adapter needs to create an online meeting. */
export interface ProviderMeetingInput {
  organizationId: string
  title: string
  startAt: Date
  endAt: Date
  /** Join link supplied by the client (manual meetings). */
  meetingUrl?: string
  /** Optional access code supplied by the client. */
  meetingPassword?: string
}

/** Details returned by a provider when the meeting is created. */
export interface ProviderMeetingResult {
  provider: MeetingProviderId
  joinUrl?: string
  password?: string
  externalId?: string
}

/**
 * A meeting app adapter. `manual` is always available; the other adapters are
 * the extension point for connecting an app later.
 *
 * To connect a real app:
 * 1. store its credentials (encrypted with `lib/integrations/crypto.ts`) in a
 *    `MeetingConnection` model or organization metadata,
 * 2. implement `createMeeting`/`cancelMeeting` against its REST API here,
 * 3. let owners/admins pick the provider in Settings → Meetings.
 *
 * The rest of the flow (calendar event, client notification) does not need to
 * change: it only consumes {@link ProviderMeetingResult}.
 */
export interface MeetingProviderAdapter {
  id: MeetingProviderId
  label: string
  /** True when the organization must connect an account before using it. */
  requiresConnection: boolean
  createMeeting(input: ProviderMeetingInput): Promise<ProviderMeetingResult>
  cancelMeeting?(input: {
    organizationId: string
    externalMeetingId: string
  }): Promise<void>
}

const manualProvider: MeetingProviderAdapter = {
  id: "manual",
  label: "No app (use the client's link)",
  requiresConnection: false,
  async createMeeting(input) {
    return {
      provider: "manual",
      joinUrl: input.meetingUrl,
      password: input.meetingPassword,
    }
  },
}

function connectionRequiredProvider(
  id: Exclude<MeetingProviderId, "manual">,
  label: string
): MeetingProviderAdapter {
  return {
    id,
    label,
    requiresConnection: true,
    async createMeeting() {
      throw new ForbiddenError(
        `${label} is not connected. Connect the meeting app in settings first.`,
        { code: "meeting_provider_not_connected", params: { provider: label } }
      )
    },
  }
}

export const MEETING_PROVIDER_ADAPTERS: Record<
  MeetingProviderId,
  MeetingProviderAdapter
> = {
  manual: manualProvider,
  google_meet: connectionRequiredProvider("google_meet", "Google Meet"),
  microsoft_teams: connectionRequiredProvider(
    "microsoft_teams",
    "Microsoft Teams"
  ),
  zoom: connectionRequiredProvider("zoom", "Zoom"),
}

/** Resolve the configured adapter, falling back to the manual flow. */
export function resolveMeetingProvider(
  provider: string | null | undefined
): MeetingProviderAdapter {
  if (provider && provider in MEETING_PROVIDER_ADAPTERS) {
    return MEETING_PROVIDER_ADAPTERS[provider as MeetingProviderId]
  }
  return manualProvider
}
