"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { UploadIcon } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"
import { Spinner } from "@workspace/ui/components/spinner"

import { useRouter } from "@workspace/i18n/navigation"
import { useErrorTranslator } from "@workspace/i18n/errors"

/**
 * Uploads one document from the portal (max 25 MB). The file becomes a
 * client-visible document on the company, so both sides can see it.
 */
export function PortalUpload({
  uploadUrl = "/api/portal/documents/upload",
}: {
  /** The app's upload route; the portal routes stay in Copilot. */
  uploadUrl?: string
} = {}) {
  const t = useTranslations("Portal")
  const tT = useTranslations("Toasts")
  const te = useErrorTranslator()
  const router = useRouter()
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [busy, setBusy] = React.useState(false)

  async function handleFiles(files: FileList | null) {
    const file = files?.[0]
    if (!file) return
    setBusy(true)
    try {
      const form = new FormData()
      form.append("file", file)
      const response = await fetch(uploadUrl, {
        method: "POST",
        body: form,
      })
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: {
            code?: string
            message?: string
            params?: Record<string, string | number>
          }
        } | null
        const error = new Error(
          payload?.error?.message ?? "Upload failed."
        ) as Error & {
          code?: string
          params?: Record<string, string | number>
        }
        error.code = payload?.error?.code
        error.params = payload?.error?.params
        throw error
      }
      toast.success(tT("portalDocumentUploaded"))
      router.refresh()
    } catch (error) {
      toast.error(te(error, "internal"))
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={(event) => void handleFiles(event.target.files)}
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? (
          <Spinner className="size-4" />
        ) : (
          <UploadIcon data-icon="inline-start" />
        )}
        {t("upload")}
      </Button>
    </>
  )
}
