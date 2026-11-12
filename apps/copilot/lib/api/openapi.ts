import { z } from "zod"

import { API_TOKEN_SCOPES } from "@/lib/api-tokens/scopes"
import {
  ApiMemberSchema,
  ApiProjectSchema,
  ApiTaskSchema,
  ApiTokenInfoSchema,
  CreateTaskBodySchema,
  ErrorEnvelopeSchema,
  UpdateTaskBodySchema,
} from "./schemas"

/**
 * OpenAPI 3.1 document for `/api/v1`, generated from the same zod schemas the
 * routes parse with, so the published contract cannot drift from validation.
 * `openapi.unit.test.ts` checks that every route file is documented.
 */
function schema(value: z.ZodType, io: "input" | "output" = "output") {
  return z.toJSONSchema(value, { target: "draft-2020-12", io })
}

const json = (value: unknown) => ({ "application/json": { schema: value } })
const data = (value: z.ZodType) =>
  json({
    type: "object",
    required: ["data"],
    properties: { data: schema(value) },
  })
const list = (value: z.ZodType) =>
  json({
    type: "object",
    required: ["data", "nextCursor"],
    properties: {
      data: { type: "array", items: schema(value) },
      nextCursor: { type: ["string", "null"] },
    },
  })

const errors = {
  "401": {
    description: "token_invalid, token_expired or token_revoked",
    content: json(schema(ErrorEnvelopeSchema)),
  },
  "403": {
    description: "token_scope_missing, upgrade_required or a role refusal",
    content: json(schema(ErrorEnvelopeSchema)),
  },
  "429": {
    description: "rate_limited; see Retry-After",
    content: json(schema(ErrorEnvelopeSchema)),
  },
}

const idempotencyKey = {
  name: "Idempotency-Key",
  in: "header",
  required: false,
  schema: { type: "string", maxLength: 200 },
  description: "Retrying with the same key never applies the change twice.",
}

function op<T extends object>(scope: string, summary: string, extra: T) {
  return { summary, security: [{ bearer: [scope] }], ...extra }
}

export function buildOpenApiDocument(serverUrl = "/") {
  return {
    openapi: "3.1.0",
    info: {
      title: "Asynchrone Space API",
      version: "1",
      description:
        "Personal access token API (ADR 0042). Send `Authorization: Bearer asy_…`.",
    },
    servers: [{ url: serverUrl }],
    components: {
      securitySchemes: {
        bearer: {
          type: "http",
          scheme: "bearer",
          description: `Personal access token. Scopes: ${API_TOKEN_SCOPES.join(", ")}.`,
        },
      },
    },
    paths: {
      "/api/v1/token": {
        get: {
          summary: "Describe the calling token",
          security: [{ bearer: [] }],
          responses: {
            "200": { description: "Token", content: data(ApiTokenInfoSchema) },
            ...errors,
          },
        },
      },
      "/api/v1/projects": {
        get: op("projects:read", "List projects with their labels", {
          responses: {
            "200": { description: "Projects", content: list(ApiProjectSchema) },
            ...errors,
          },
        }),
      },
      "/api/v1/members": {
        get: op("members:read", "List workspace members", {
          responses: {
            "200": { description: "Members", content: list(ApiMemberSchema) },
            ...errors,
          },
        }),
      },
      "/api/v1/tasks": {
        get: op("tasks:read", "List the tasks of a project", {
          parameters: [
            {
              name: "projectId",
              in: "query",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": { description: "Tasks", content: list(ApiTaskSchema) },
            "404": {
              description: "Unknown project",
              content: json(schema(ErrorEnvelopeSchema)),
            },
            ...errors,
          },
        }),
        post: op("tasks:write", "Create a task", {
          parameters: [idempotencyKey],
          requestBody: {
            required: true,
            content: json(schema(CreateTaskBodySchema, "input")),
          },
          responses: {
            "201": {
              description: "Created task",
              content: data(ApiTaskSchema),
            },
            "422": {
              description: "validation_error",
              content: json(schema(ErrorEnvelopeSchema)),
            },
            ...errors,
          },
        }),
      },
      "/api/v1/tasks/{taskId}": {
        patch: op("tasks:write", "Update a task", {
          parameters: [
            {
              name: "taskId",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
            idempotencyKey,
          ],
          requestBody: {
            required: true,
            content: json(schema(UpdateTaskBodySchema, "input")),
          },
          responses: {
            "200": {
              description: "Updated task",
              content: data(ApiTaskSchema),
            },
            "404": {
              description: "Unknown task",
              content: json(schema(ErrorEnvelopeSchema)),
            },
            "422": {
              description: "validation_error",
              content: json(schema(ErrorEnvelopeSchema)),
            },
            ...errors,
          },
        }),
      },
    },
  }
}
