"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  DownloadIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  UploadIcon,
} from "lucide-react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Card, CardContent } from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { Spinner } from "@workspace/ui/components/spinner"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import { useClientActions } from "./actions"
import { Link, useRouter } from "@workspace/i18n/navigation"
import { unwrapActionResult } from "@workspace/core/action"
import type { ClientContactData, ClientOverviewData } from "../types"
import { useErrorTranslator } from "@workspace/i18n/errors"

import { ContactDialog } from "./contact-dialog"
import { ImportDialog } from "./import-dialog"
import { downloadCsv } from "./use-clients"

export function ContactsPanel({
  orgSlug,
  data,
}: {
  orgSlug: string
  data: ClientOverviewData
}) {
  const t = useTranslations("Clients")
  const tT = useTranslations("Toasts")
  const te = useErrorTranslator()
  const router = useRouter()
  const {
    listClientContactsAction,
    exportClientAction,
    archiveContactAction,
    restoreContactAction,
  } = useClientActions()

  const [query, setQuery] = React.useState("")
  const [showArchived, setShowArchived] = React.useState(false)
  const [archiveTarget, setArchiveTarget] =
    React.useState<ClientContactData | null>(null)
  const [exporting, setExporting] = React.useState(false)
  const [contacts, setContacts] = React.useState(data.contacts)
  const [cursor, setCursor] = React.useState(data.pagination.contacts)
  const [loadingMore, setLoadingMore] = React.useState(false)

  const clientOptions = data.clientOptions

  React.useEffect(() => {
    setContacts(data.contacts)
    setCursor(data.pagination.contacts)
  }, [data])

  async function loadMore() {
    if (!cursor || loadingMore) return
    setLoadingMore(true)
    try {
      const page = unwrapActionResult(await listClientContactsAction(cursor))
      setContacts((prev) => [...prev, ...page.items])
      setCursor(page.nextCursor)
    } catch (error) {
      toast.error(te(error, "internal"))
    } finally {
      setLoadingMore(false)
    }
  }

  const visible = React.useMemo(() => {
    const needle = query.trim().toLowerCase()
    return contacts.filter((contact) => {
      if (!showArchived && contact.archivedAt) return false
      if (
        needle &&
        !`${contact.fullName} ${contact.email ?? ""} ${
          contact.jobTitle ?? ""
        } ${contact.companies.map((link) => link.clientName).join(" ")}`
          .toLowerCase()
          .includes(needle)
      ) {
        return false
      }
      return true
    })
  }, [contacts, query, showArchived])

  const hasActive = contacts.some((contact) => !contact.archivedAt)

  async function handleExport() {
    setExporting(true)
    try {
      const file = unwrapActionResult(
        await exportClientAction({ entity: "contacts" })
      )
      downloadCsv(file.filename, file.content)
      toast.success(tT("exportReady"))
    } catch (error) {
      toast.error(te(error, "internal"))
    } finally {
      setExporting(false)
    }
  }

  async function confirmArchive() {
    if (!archiveTarget) return
    try {
      unwrapActionResult(await archiveContactAction(archiveTarget.id))
      toast.success(tT("recordArchived"))
      router.refresh()
    } catch (error) {
      toast.error(te(error, "internal"))
    } finally {
      setArchiveTarget(null)
    }
  }

  async function handleRestore(contact: ClientContactData) {
    try {
      unwrapActionResult(await restoreContactAction(contact.id))
      toast.success(tT("recordRestored"))
      router.refresh()
    } catch (error) {
      toast.error(te(error, "internal"))
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1">
          <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            placeholder={t("common.search")}
            className="pl-9"
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <Button
          type="button"
          size="sm"
          variant={showArchived ? "default" : "outline"}
          onClick={() => setShowArchived((prev) => !prev)}
        >
          <ArchiveIcon data-icon="inline-start" />
          {t("common.showArchived")}
        </Button>
        {data.access.canExport ? (
          <>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={exporting}
              onClick={() => void handleExport()}
            >
              {exporting ? (
                <Spinner className="size-4" />
              ) : (
                <DownloadIcon data-icon="inline-start" />
              )}
              {t("common.export")}
            </Button>
            <ImportDialog
              kind="contacts"
              trigger={
                <Button type="button" size="sm" variant="outline">
                  <UploadIcon data-icon="inline-start" />
                  {t("common.import")}
                </Button>
              }
            />
          </>
        ) : null}
        {data.access.canEdit ? (
          <ContactDialog
            clients={clientOptions}
            members={data.members}
            fieldDefinitions={data.fieldDefinitions}
            trigger={
              <Button type="button" size="sm">
                <PlusIcon data-icon="inline-start" />
                {t("contacts.new")}
              </Button>
            }
          />
        ) : null}
      </div>

      <Card>
        <CardContent className="pt-4">
          {visible.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {hasActive ? t("contacts.empty") : t("contacts.emptyAll")}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("contacts.table.name")}</TableHead>
                    <TableHead>{t("contacts.table.email")}</TableHead>
                    <TableHead>{t("contacts.table.phone")}</TableHead>
                    <TableHead>{t("contacts.table.jobTitle")}</TableHead>
                    <TableHead>{t("contacts.table.companies")}</TableHead>
                    <TableHead>{t("contacts.table.owner")}</TableHead>
                    <TableHead className="text-right">
                      {t("contacts.table.deals")}
                    </TableHead>
                    <TableHead className="w-24" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visible.map((contact) => (
                    <TableRow key={contact.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/${orgSlug}/contacts/${contact.id}`}
                            prefetch={false}
                            className="font-medium hover:underline"
                          >
                            {contact.fullName}
                          </Link>
                          {contact.archivedAt ? (
                            <Badge variant="outline">
                              {t("common.archivedBadge")}
                            </Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {contact.email ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {contact.phone ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {contact.jobTitle ?? "—"}
                      </TableCell>
                      <TableCell>
                        {contact.companies.length === 0 ? (
                          <span className="text-muted-foreground">
                            {t("contacts.noCompanies")}
                          </span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {contact.companies.map((link) => (
                              <Badge key={link.clientId} variant="secondary">
                                {link.clientName}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {contact.ownerName ?? t("common.unassigned")}
                      </TableCell>
                      <TableCell className="text-right">
                        {contact.openDealCount > 0
                          ? contact.openDealCount
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          {contact.archivedAt ? (
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              aria-label={t("common.restore")}
                              onClick={() => void handleRestore(contact)}
                            >
                              <ArchiveRestoreIcon className="size-4" />
                            </Button>
                          ) : data.access.canEdit ? (
                            <>
                              <ContactDialog
                                contact={contact}
                                clients={clientOptions}
                                members={data.members}
                                fieldDefinitions={data.fieldDefinitions}
                                trigger={
                                  <Button
                                    type="button"
                                    size="icon"
                                    variant="ghost"
                                    aria-label={t("common.edit")}
                                  >
                                    <PencilIcon className="size-4" />
                                  </Button>
                                }
                              />
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                aria-label={t("common.archive")}
                                onClick={() => setArchiveTarget(contact)}
                              >
                                <ArchiveIcon className="size-4" />
                              </Button>
                            </>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {cursor ? (
            <div className="flex justify-center pb-4">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={loadingMore}
                onClick={() => void loadMore()}
              >
                {loadingMore ? <Spinner className="size-4" /> : null}
                {t("common.loadMore")}
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <AlertDialog
        open={archiveTarget !== null}
        onOpenChange={(open) => {
          if (!open) setArchiveTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("contacts.archiveTitle", {
                name: archiveTarget?.fullName ?? "",
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("common.confirmArchiveDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmArchive()}>
              {t("common.archive")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
