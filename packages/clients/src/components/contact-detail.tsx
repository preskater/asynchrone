"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  MailIcon,
  PencilIcon,
  PhoneIcon,
  PlusIcon,
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
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

import { useClientActions } from "./actions"
import { Link, useRouter } from "@workspace/i18n/navigation"
import { unwrapActionResult } from "@workspace/core/action"
import type { ClientContactDetailData } from "../types"
import { useErrorTranslator } from "@workspace/i18n/errors"
import { useEnumLabel } from "@workspace/i18n/labels"

import { ContactDialog } from "./contact-dialog"
import { CustomFieldValuesView } from "./custom-fields"
import { DocumentsCard } from "./documents"
import { ActivityDialog, ActivityTimeline } from "./timeline"
import { useClientFormat } from "./use-clients"

export function ContactDetail({
  orgSlug,
  data,
}: {
  orgSlug: string
  data: ClientContactDetailData
}) {
  const t = useTranslations("Clients")
  const tT = useTranslations("Toasts")
  const te = useErrorTranslator()
  const L = useEnumLabel()
  const { money, day, dateTime } = useClientFormat()
  const router = useRouter()
  const { archiveContactAction, restoreContactAction } = useClientActions()

  const { contact, deals, timeline } = data
  const [archiveOpen, setArchiveOpen] = React.useState(false)

  async function confirmArchive() {
    try {
      unwrapActionResult(await archiveContactAction(contact.id))
      toast.success(tT("recordArchived"))
      setArchiveOpen(false)
      router.refresh()
    } catch (error) {
      toast.error(te(error, "internal"))
    }
  }

  async function handleRestore() {
    try {
      unwrapActionResult(await restoreContactAction(contact.id))
      toast.success(tT("recordRestored"))
      router.refresh()
    } catch (error) {
      toast.error(te(error, "internal"))
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <div className="flex flex-col gap-4 lg:col-span-2">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <CardTitle className="text-xl">{contact.fullName}</CardTitle>
                  {contact.archivedAt ? (
                    <Badge variant="outline">{t("common.archivedBadge")}</Badge>
                  ) : null}
                </div>
                <p className="text-sm text-muted-foreground">
                  {contact.jobTitle ?? "—"} · {t("common.created")}{" "}
                  {day(contact.createdAt.slice(0, 10))}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {data.access.canEdit ? (
                  <>
                    <ContactDialog
                      contact={contact}
                      clients={data.clients}
                      members={data.members}
                      fieldDefinitions={data.fieldDefinitions}
                      trigger={
                        <Button type="button" size="sm" variant="outline">
                          <PencilIcon data-icon="inline-start" />
                          {t("common.edit")}
                        </Button>
                      }
                    />
                    <ActivityDialog
                      contactId={contact.id}
                      trigger={
                        <Button type="button" size="sm">
                          <PlusIcon data-icon="inline-start" />
                          {t("activity.add")}
                        </Button>
                      }
                    />
                    {contact.archivedAt ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => void handleRestore()}
                      >
                        <ArchiveRestoreIcon data-icon="inline-start" />
                        {t("common.restore")}
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => setArchiveOpen(true)}
                      >
                        <ArchiveIcon data-icon="inline-start" />
                        {t("common.archive")}
                      </Button>
                    )}
                  </>
                ) : null}
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <dl className="grid gap-3 sm:grid-cols-2">
              {contact.email ? (
                <div className="flex flex-col">
                  <dt className="text-xs text-muted-foreground">
                    {t("contacts.fields.email")}
                  </dt>
                  <dd className="inline-flex items-center gap-1 text-sm">
                    <MailIcon className="size-3.5" />
                    <a
                      href={`mailto:${contact.email}`}
                      className="hover:underline"
                    >
                      {contact.email}
                    </a>
                  </dd>
                </div>
              ) : null}
              {contact.phone ? (
                <div className="flex flex-col">
                  <dt className="text-xs text-muted-foreground">
                    {t("contacts.fields.phone")}
                  </dt>
                  <dd className="inline-flex items-center gap-1 text-sm">
                    <PhoneIcon className="size-3.5" />
                    <a
                      href={`tel:${contact.phone}`}
                      className="hover:underline"
                    >
                      {contact.phone}
                    </a>
                  </dd>
                </div>
              ) : null}
              <div className="flex flex-col">
                <dt className="text-xs text-muted-foreground">
                  {t("contacts.fields.owner")}
                </dt>
                <dd className="text-sm">
                  {contact.ownerName ?? t("common.unassigned")}
                </dd>
              </div>
              <div className="flex flex-col">
                <dt className="text-xs text-muted-foreground">
                  {t("common.updated")}
                </dt>
                <dd className="text-sm">{dateTime(contact.updatedAt)}</dd>
              </div>
            </dl>
            {contact.notes ? (
              <p className="text-sm whitespace-pre-wrap text-muted-foreground">
                {contact.notes}
              </p>
            ) : null}
            <CustomFieldValuesView
              definitions={data.fieldDefinitions.filter(
                (def) => def.entity === "contact"
              )}
              values={contact.customFields}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("activity.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ActivityTimeline entries={timeline} limit={8} />
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {t("contacts.fields.companies")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {contact.companies.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("contacts.noCompanies")}
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {contact.companies.map((link) => (
                  <li
                    key={link.clientId}
                    className="flex items-center justify-between gap-2"
                  >
                    <Link
                      href={`/${orgSlug}/clients/${link.clientId}`}
                      prefetch={false}
                      className="text-sm font-medium hover:underline"
                    >
                      {link.clientName}
                    </Link>
                    {link.isPrimary ? (
                      <Badge variant="secondary">
                        {t("contacts.fields.primary")}
                      </Badge>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("tabs.deals")}</CardTitle>
          </CardHeader>
          <CardContent>
            {deals.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("clients.related.noDeals")}
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {deals.map((deal) => (
                  <li
                    key={deal.id}
                    className="flex items-center justify-between gap-2"
                  >
                    <Link
                      href={`/${orgSlug}/deals/${deal.id}`}
                      prefetch={false}
                      className="text-sm font-medium hover:underline"
                    >
                      {deal.name}
                    </Link>
                    <span className="flex items-center gap-2 text-xs text-muted-foreground">
                      {money(deal.amount, deal.currency)}
                      <Badge
                        variant={
                          deal.status === "won"
                            ? "default"
                            : deal.status === "lost"
                              ? "destructive"
                              : "secondary"
                        }
                      >
                        {L.dealStatus(deal.status)}
                      </Badge>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <DocumentsCard
          entity="contact"
          entityId={contact.id}
          documents={data.documents}
          canEdit={data.access.canEdit}
        />
      </div>

      <AlertDialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("contacts.archiveTitle", { name: contact.fullName })}
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
