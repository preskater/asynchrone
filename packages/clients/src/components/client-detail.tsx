"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import {
  ArchiveIcon,
  ArchiveRestoreIcon,
  ExternalLinkIcon,
  GlobeIcon,
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
import type { ClientDetailData } from "../types"
import type { PortalAccessData } from "../portal"
import { useErrorTranslator } from "@workspace/i18n/errors"
import { useEnumLabel } from "@workspace/i18n/labels"

import { ClientDialog } from "./client-dialog"
import { ContactDialog } from "./contact-dialog"
import { DocumentsCard } from "./documents"
import { PortalAccessCard } from "./portal-access"
import { ProjectsCard } from "./project-links"
import { ActivityDialog, ActivityTimeline } from "./timeline"
import { CustomFieldValuesView } from "./custom-fields"
import { useClientFormat } from "./use-clients"

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "outline"> = {
  active: "default",
  prospect: "secondary",
  inactive: "outline",
}

export function ClientDetail({
  orgSlug,
  data,
  portal,
}: {
  orgSlug: string
  data: ClientDetailData
  portal: PortalAccessData
}) {
  const t = useTranslations("Clients")
  const tT = useTranslations("Toasts")
  const te = useErrorTranslator()
  const L = useEnumLabel()
  const { money, day, dateTime } = useClientFormat()
  const router = useRouter()
  const { archiveClientAction, restoreClientAction } = useClientActions()

  const { client, contacts, deals, projects, timeline } = data
  const [archiveOpen, setArchiveOpen] = React.useState(false)

  async function confirmArchive() {
    try {
      unwrapActionResult(await archiveClientAction(client.id))
      toast.success(tT("recordArchived"))
      setArchiveOpen(false)
      router.refresh()
    } catch (error) {
      toast.error(te(error, "internal"))
    }
  }

  async function handleRestore() {
    try {
      unwrapActionResult(await restoreClientAction(client.id))
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
                  <CardTitle className="text-xl">{client.name}</CardTitle>
                  <Badge variant={STATUS_VARIANTS[client.status]}>
                    {L.clientStatus(client.status)}
                  </Badge>
                  {client.archivedAt ? (
                    <Badge variant="outline">{t("common.archivedBadge")}</Badge>
                  ) : null}
                </div>
                <p className="text-sm text-muted-foreground">
                  {t("common.created")} {day(client.createdAt.slice(0, 10))} ·{" "}
                  {t("common.updated")} {dateTime(client.updatedAt)}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {data.access.canEdit ? (
                  <>
                    <ClientDialog
                      client={client}
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
                      clientId={client.id}
                      trigger={
                        <Button type="button" size="sm">
                          <PlusIcon data-icon="inline-start" />
                          {t("activity.add")}
                        </Button>
                      }
                    />
                    {client.archivedAt ? (
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
              {client.industry ? (
                <InfoRow
                  label={t("clients.fields.industry")}
                  value={client.industry}
                />
              ) : null}
              {client.website ? (
                <div className="flex flex-col">
                  <dt className="text-xs text-muted-foreground">
                    {t("clients.fields.website")}
                  </dt>
                  <dd className="text-sm">
                    <a
                      href={client.website}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 hover:underline"
                    >
                      <GlobeIcon className="size-3.5" />
                      {client.website}
                      <ExternalLinkIcon className="size-3" />
                    </a>
                  </dd>
                </div>
              ) : null}
              {client.phone ? (
                <div className="flex flex-col">
                  <dt className="text-xs text-muted-foreground">
                    {t("clients.fields.phone")}
                  </dt>
                  <dd className="inline-flex items-center gap-1 text-sm">
                    <PhoneIcon className="size-3.5" />
                    <a href={`tel:${client.phone}`} className="hover:underline">
                      {client.phone}
                    </a>
                  </dd>
                </div>
              ) : null}
              {client.contactEmail ? (
                <div className="flex flex-col">
                  <dt className="text-xs text-muted-foreground">
                    {t("clients.fields.contactEmail")}
                  </dt>
                  <dd className="inline-flex items-center gap-1 text-sm">
                    <MailIcon className="size-3.5" />
                    <a
                      href={`mailto:${client.contactEmail}`}
                      className="hover:underline"
                    >
                      {client.contactEmail}
                    </a>
                  </dd>
                </div>
              ) : null}
              {client.address ? (
                <InfoRow
                  label={t("clients.fields.address")}
                  value={client.address}
                />
              ) : null}
              {client.source ? (
                <InfoRow
                  label={t("clients.fields.source")}
                  value={client.source}
                />
              ) : null}
              <InfoRow
                label={t("clients.fields.owner")}
                value={client.ownerName ?? t("common.unassigned")}
              />
            </dl>
            {client.description ? (
              <p className="text-sm whitespace-pre-wrap text-muted-foreground">
                {client.description}
              </p>
            ) : null}
            <CustomFieldValuesView
              definitions={data.fieldDefinitions.filter(
                (def) => def.entity === "client"
              )}
              values={client.customFields}
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
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base">
                {t("clients.related.contacts")}
              </CardTitle>
              {data.access.canEdit ? (
                <ContactDialog
                  clients={data.clients}
                  members={data.members}
                  fieldDefinitions={data.fieldDefinitions}
                  defaultClientId={client.id}
                  trigger={
                    <Button type="button" size="sm" variant="outline">
                      <PlusIcon data-icon="inline-start" />
                      {t("contacts.new")}
                    </Button>
                  }
                />
              ) : null}
            </div>
          </CardHeader>
          <CardContent>
            {contacts.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("clients.related.noContacts")}
              </p>
            ) : (
              <ul className="flex flex-col gap-2">
                {contacts.map((contact) => (
                  <li key={contact.id} className="flex flex-col">
                    <Link
                      href={`/${orgSlug}/contacts/${contact.id}`}
                      prefetch={false}
                      className="text-sm font-medium hover:underline"
                    >
                      {contact.fullName}
                    </Link>
                    <span className="text-xs text-muted-foreground">
                      {[contact.jobTitle, contact.email]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {t("clients.related.deals")}
            </CardTitle>
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

        <ProjectsCard
          orgSlug={orgSlug}
          clientId={client.id}
          projects={projects}
          canEdit={data.access.canEdit}
        />

        <DocumentsCard
          entity="client"
          entityId={client.id}
          documents={data.documents}
          canEdit={data.access.canEdit}
        />

        <PortalAccessCard
          clientId={client.id}
          access={portal}
          canManage={data.access.canManage}
        />
      </div>

      <AlertDialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("clients.archiveTitle", { name: client.name })}
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

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{value}</dd>
    </div>
  )
}
