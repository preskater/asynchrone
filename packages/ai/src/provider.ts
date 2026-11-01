import {
  OpenAIProvider,
  setDefaultModelProvider,
  setOpenAIAPI,
  setTracingDisabled,
} from "@openai/agents"

// Avoid exporting traces to api.openai.com unless tracing is explicitly wanted.
setTracingDisabled(true)

// Use the Responses API for real OpenAI endpoints; fall back to Chat
// Completions for custom OpenAI-compatible base URLs.
setOpenAIAPI(process.env.OPENAI_API_URL ? "chat_completions" : "responses")

setDefaultModelProvider(
  new OpenAIProvider({
    apiKey: process.env.OPENAI_API_KEY,
    ...(process.env.OPENAI_API_URL
      ? { baseURL: process.env.OPENAI_API_URL }
      : {}),
  })
)
