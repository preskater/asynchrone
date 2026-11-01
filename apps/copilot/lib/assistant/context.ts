import { ASSISTANT_ORGANIZATION_HEADER } from "@workspace/ai/conversations"
import type { RequestContext } from "@workspace/core/context"

import {
  getRequestContext,
  getRequestContextForOrganization,
} from "@/lib/core/auth-context"

/**
 * Resolves the request context from the session.
 *
 * The home screen sends the organization in the URL so the conversation list
 * does not briefly disagree with reload/create/delete while `OrganizationSync`
 * updates the shell's active organization. The header is not trusted:
 * `getRequestContextForOrganization` checks that the signed-in user really is a
 * member of that organization.
 */
export async function assistantRequestContext(
  request: Request
): Promise<RequestContext> {
  const organizationId = request.headers.get(ASSISTANT_ORGANIZATION_HEADER)
  return organizationId
    ? getRequestContextForOrganization(organizationId)
    : getRequestContext()
}
