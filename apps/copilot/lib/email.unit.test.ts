import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { send } = vi.hoisted(() => ({ send: vi.fn() }))

vi.mock("resend", () => ({
  Resend: class {
    emails = { send }
  },
}))

import {
  sendEmail,
  sendResetPasswordEmail,
  sendVerificationEmail,
} from "./email"

describe("email", () => {
  beforeEach(() => {
    vi.stubEnv("RESEND_API_KEY", "re_test")
    vi.stubEnv("EMAIL_FROM", "Asynchrone Space <noreply@example.com>")
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "")
    send.mockReset()
    send.mockResolvedValue({ data: { id: "email_1" }, error: null })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("skips sending when no provider is configured", () => {
    vi.stubEnv("RESEND_API_KEY", "")

    sendEmail({ to: "user@example.com", subject: "Hi", html: "<p>Hi</p>" })

    expect(send).not.toHaveBeenCalled()
  })

  it("sends the verification email to the user", () => {
    sendVerificationEmail({
      to: "user@example.com",
      url: "https://app.example.com/api/auth/verify-email?token=abc",
    })

    expect(send).toHaveBeenCalledWith({
      from: "Asynchrone Space <noreply@example.com>",
      to: "user@example.com",
      subject: "Verify your email address",
      html: expect.stringContaining(
        "https://app.example.com/api/auth/verify-email?token=abc"
      ),
    })
  })

  it("sends the reset email and rewrites the link to NEXT_PUBLIC_APP_URL", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://asynchrone-space.example.com")

    sendResetPasswordEmail({
      to: "user@example.com",
      url: "http://internal:3000/api/auth/reset-password/tok_1?callbackURL=%2Fen",
    })

    expect(send).toHaveBeenCalledWith({
      from: "Asynchrone Space <noreply@example.com>",
      to: "user@example.com",
      subject: "Reset your password",
      html: expect.stringContaining(
        "https://asynchrone-space.example.com/api/auth/reset-password/tok_1?callbackURL=%2Fen"
      ),
    })
  })
})
