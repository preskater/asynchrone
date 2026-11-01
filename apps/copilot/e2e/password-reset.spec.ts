import { expect, test } from "@playwright/test"

test("forgot password shows a generic confirmation", async ({ page }) => {
  await page.goto("/en/forgot-password")

  await page.getByLabel("Email").fill("nobody@example.com")
  await page.getByRole("button", { name: "Send reset link" }).click()

  await expect(
    page.getByText(
      "If an account exists for that address, a reset link has been sent."
    )
  ).toBeVisible()
  await expect(
    page.getByRole("link", { name: "Back to sign in" })
  ).toBeVisible()
})

test("reset password rejects a missing or invalid token", async ({ page }) => {
  await page.goto("/en/reset-password?error=INVALID_TOKEN")

  await expect(
    page.getByText("This reset link is invalid or has expired.")
  ).toBeVisible()
  await expect(
    page.getByRole("link", { name: "Request a new link" })
  ).toBeVisible()
})

test("reset password submits the new password", async ({ page }) => {
  await page.route("**/api/auth/reset-password*", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ status: true }),
    })
  )

  await page.goto("/en/reset-password?token=test-token")

  await page.getByLabel("New password").fill("NewPassword123!")
  await page.getByLabel("Confirm password").fill("NewPassword123!")
  await page.getByRole("button", { name: "Reset password" }).click()

  await expect(page).toHaveURL(/\/en\/sign-in$/)
})
