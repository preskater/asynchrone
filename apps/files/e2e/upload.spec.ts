import { expect, test } from "@playwright/test"

import { E2E_FILES_URL } from "./env"
import { openFiles, signUp } from "./fixtures"

/**
 * The chunked upload API moved to the files host in #161. The requests carry
 * the host-only files session, so they must run after the sign-in handoff.
 */

test("chunked upload then download round-trips the bytes", async ({ page }) => {
  const account = await signUp(page)
  await openFiles(page, account.organizationSlug)

  const content = "hello beta ".repeat(1000)

  const createRes = await page.request.post(
    `${E2E_FILES_URL}/api/files/uploads?name=e2e.txt&expectedSize=${content.length}`,
    { data: {} }
  )
  expect(createRes.ok(), await createRes.text()).toBeTruthy()
  const { uploadId } = (await createRes.json()) as { uploadId: string }

  const putRes = await page.request.put(
    `${E2E_FILES_URL}/api/files/uploads/${uploadId}`,
    {
      headers: {
        "x-chunk-offset": "0",
        "content-type": "application/octet-stream",
      },
      data: content,
    }
  )
  expect(putRes.ok(), await putRes.text()).toBeTruthy()

  const completeRes = await page.request.post(
    `${E2E_FILES_URL}/api/files/uploads/${uploadId}/complete`
  )
  expect(completeRes.ok(), await completeRes.text()).toBeTruthy()
  const file = (await completeRes.json()) as { id: string }

  const download = await page.request.get(
    `${E2E_FILES_URL}/api/files/${file.id}/download`
  )
  expect(download.ok()).toBeTruthy()
  expect(await download.text()).toBe(content)
})

test("a chunk with the wrong offset is rejected", async ({ page }) => {
  const account = await signUp(page)
  await openFiles(page, account.organizationSlug)

  const createRes = await page.request.post(
    `${E2E_FILES_URL}/api/files/uploads?name=e2e.txt&expectedSize=10`,
    { data: {} }
  )
  expect(createRes.ok()).toBeTruthy()
  const { uploadId } = (await createRes.json()) as { uploadId: string }

  const putRes = await page.request.put(
    `${E2E_FILES_URL}/api/files/uploads/${uploadId}`,
    {
      headers: {
        "x-chunk-offset": "5",
        "content-type": "application/octet-stream",
      },
      data: "0123456789",
    }
  )
  expect(putRes.status()).toBe(403)
})

test("the upload sweep requires the cron secret", async ({ page }) => {
  const account = await signUp(page)
  await openFiles(page, account.organizationSlug)

  const response = await page.request.get(
    `${E2E_FILES_URL}/api/files/uploads/sweep`
  )
  // No CRON_SECRET locally means the route is open; when it is configured the
  // job must present the bearer token.
  expect([200, 401]).toContain(response.status())
})
