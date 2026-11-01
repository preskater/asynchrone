import { expect, test } from "@playwright/test"

import { signUp } from "./fixtures"

test("chunked upload then download round-trips the bytes", async ({ page }) => {
  await signUp(page)

  const content = "hello beta ".repeat(1000)

  const createRes = await page.request.post(
    `/api/files/uploads?name=e2e.txt&expectedSize=${content.length}`,
    { data: {} }
  )
  expect(createRes.ok(), await createRes.text()).toBeTruthy()
  const { uploadId } = (await createRes.json()) as { uploadId: string }

  const putRes = await page.request.put(`/api/files/uploads/${uploadId}`, {
    headers: {
      "x-chunk-offset": "0",
      "content-type": "application/octet-stream",
    },
    data: content,
  })
  expect(putRes.ok(), await putRes.text()).toBeTruthy()

  const completeRes = await page.request.post(
    `/api/files/uploads/${uploadId}/complete`
  )
  expect(completeRes.ok(), await completeRes.text()).toBeTruthy()
  const file = (await completeRes.json()) as { id: string }

  const download = await page.request.get(`/api/files/${file.id}/download`)
  expect(download.ok()).toBeTruthy()
  expect(await download.text()).toBe(content)
})

test("a chunk with the wrong offset is rejected", async ({ page }) => {
  await signUp(page)

  const createRes = await page.request.post(
    `/api/files/uploads?name=e2e.txt&expectedSize=10`,
    { data: {} }
  )
  expect(createRes.ok()).toBeTruthy()
  const { uploadId } = (await createRes.json()) as { uploadId: string }

  const putRes = await page.request.put(`/api/files/uploads/${uploadId}`, {
    headers: { "x-chunk-offset": "5", "content-type": "application/octet-stream" },
    data: "0123456789",
  })
  expect(putRes.status()).toBe(403)
})
