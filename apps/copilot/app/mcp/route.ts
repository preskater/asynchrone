import { requireMcpAuth } from "@better-auth/mcp"
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server"

import { auth } from "@/lib/auth"
import { authInfoFromClaims } from "@/lib/mcp/context"
import { registerTools } from "@/lib/mcp/server"

export const runtime = "nodejs"
export const maxDuration = 60

const resource =
  process.env.MCP_RESOURCE_URL || `${process.env.BETTER_AUTH_URL}/mcp`

/**
 * Stateless MCP 2026-07-28 endpoint. `requireMcpAuth` verifies the OAuth
 * access token against the authorization server's JWKS, checks the audience
 * against `resource`, and rejects legacy (2025-era) traffic.
 */
const mcpHandler = createMcpHandler(
  (requestContext) => {
    const server = new McpServer({
      name: "asynchrone-space-mcp",
      version: "0.1.0",
    })
    registerTools(server, requestContext.authInfo)
    return server
  },
  { legacy: "reject" }
)

const POST = requireMcpAuth(
  auth,
  (request, claims) =>
    mcpHandler.fetch(request, { authInfo: authInfoFromClaims(claims) }),
  { resource }
)

export { POST }
