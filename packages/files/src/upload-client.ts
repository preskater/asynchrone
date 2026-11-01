import type { FileNode } from "./types"
import { UPLOAD_CHUNK_RETRIES, UPLOAD_CHUNK_SIZE } from "./upload-config"

export interface UploadedLargeObject {
  oid: number
  size: number
  sha256: string
}

export interface UploadProgress {
  loaded: number
  total: number
  percentage: number
}

interface UploadSessionResponse {
  uploadId: string
  oid: number
  receivedBytes: number
  expectedSize: number | null
}

export class UploadError extends Error {
  readonly code?: string
  constructor(message: string, code?: string) {
    super(message)
    this.name = "UploadError"
    this.code = code
  }
}

function parseErrorBody(body: unknown, fallback: string): UploadError {
  const error = (body as { error?: { message?: string; code?: string } } | null)
    ?.error
  return new UploadError(error?.message ?? fallback, error?.code)
}

async function jsonRequest(
  url: string,
  init: RequestInit
): Promise<unknown> {
  const response = await fetch(url, init)
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    throw parseErrorBody(body, "Upload failed.")
  }
  return body
}

/** Send one raw-bytes chunk, reporting progress relative to the whole file. */
function putChunk(
  uploadId: string,
  blob: Blob,
  offset: number,
  fileSize: number,
  onProgress?: (progress: UploadProgress) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open("PUT", `/api/files/uploads/${uploadId}`)
    xhr.setRequestHeader("x-chunk-offset", String(offset))
    xhr.responseType = "json"

    if (onProgress) {
      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable || fileSize === 0) return
        const loaded = Math.min(fileSize, offset + event.loaded)
        onProgress({
          loaded,
          total: fileSize,
          percentage: (loaded / fileSize) * 100,
        })
      }
    }

    xhr.onload = () => {
      const body = xhr.response as
        | { error?: { message?: string; code?: string } }
        | null
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve()
        return
      }
      reject(parseErrorBody(body, "Upload failed."))
    }
    xhr.onerror = () => reject(new UploadError("Upload failed."))
    xhr.onabort = () => reject(new UploadError("Upload cancelled."))

    xhr.send(blob)
  })
}

interface UploadOptions {
  parentId?: string | null
  transient?: boolean
  onProgress?: (progress: UploadProgress) => void
}

async function uploadInChunks(
  file: File,
  options: UploadOptions
): Promise<
  { session: UploadSessionResponse; completed: UploadedLargeObject | FileNode }
> {
  const params = new URLSearchParams({ name: file.name })
  if (file.type) params.set("mimeType", file.type)
  if (options.parentId) params.set("parentId", options.parentId)
  if (options.transient) params.set("transient", "1")
  if (Number.isFinite(file.size)) params.set("expectedSize", String(file.size))

  const session = (await jsonRequest(`/api/files/uploads?${params}`, {
    method: "POST",
  })) as UploadSessionResponse

  try {
    let offset = 0
    while (offset < file.size) {
      const end = Math.min(file.size, offset + UPLOAD_CHUNK_SIZE)
      const slice = file.slice(offset, end)

      let attempt = 0
      for (;;) {
        try {
          await putChunk(session.uploadId, slice, offset, file.size, options.onProgress)
          break
        } catch (error) {
          attempt += 1
          if (attempt > UPLOAD_CHUNK_RETRIES) throw error
        }
      }
      offset = end
    }

    const completed = await jsonRequest(
      `/api/files/uploads/${session.uploadId}/complete`,
      { method: "POST" }
    )
    options.onProgress?.({
      loaded: file.size,
      total: file.size,
      percentage: 100,
    })
    return { session, completed: completed as UploadedLargeObject | FileNode }
  } catch (error) {
    // Best-effort abort so the server can unlink the partial large object.
    void fetch(`/api/files/uploads/${session.uploadId}`, {
      method: "DELETE",
    }).catch(() => undefined)
    throw error
  }
}

/**
 * Chunked upload of a workspace file. Returns the created `FileNode`. Files are
 * split into small chunks so each request stays below typical body limits; each
 * chunk is retried in memory.
 */
export async function uploadFile(
  file: File,
  options: { parentId: string | null; onProgress?: (progress: UploadProgress) => void }
): Promise<FileNode> {
  const { completed } = await uploadInChunks(file, {
    parentId: options.parentId,
    transient: false,
    onProgress: options.onProgress,
  })
  return completed as FileNode
}

/**
 * Chunked upload of message-attachment bytes. Returns the large-object
 * reference; the `oid` is persisted when the message is sent.
 */
export async function uploadAttachment(
  file: File,
  options: { onProgress?: (progress: UploadProgress) => void } = {}
): Promise<UploadedLargeObject> {
  const { completed } = await uploadInChunks(file, {
    transient: true,
    onProgress: options.onProgress,
  })
  return completed as UploadedLargeObject
}
