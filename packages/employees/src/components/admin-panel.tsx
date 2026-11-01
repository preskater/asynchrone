"use client"

import * as React from "react"
import { useLocale, useTranslations } from "next-intl"
import { DownloadIcon, PencilIcon, PlusIcon } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
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

import { useEmployeeActions } from "./actions"
import { useRouter } from "@workspace/i18n/navigation"
import { unwrapActionResult } from "@workspace/core/action"
import { formatDateKey } from "../date-utils"
import type { EmployeeOverviewData } from "../types"
import { useErrorTranslator } from "@workspace/i18n/errors"
import { useEnumLabel } from "@workspace/i18n/labels"

import {
  ActivityDialog,
  ClientDialog,
  ProfileDialog,
  ProjectDialog,
} from "./admin-dialogs"
import { downloadCsv } from "./use-employees"

type ExportReport =
  | "attendance"
  | "leave"
  | "project-time"
  | "client-time"
  | "capacity"
  | "payroll"
  | "audit"

export function AdminPanel({ data }: { data: EmployeeOverviewData }) {
  const t = useTranslations("Employees")
  const { exportCsvAction, updateEmployeeSettingsAction } = useEmployeeActions()
  const tT = useTranslations("Toasts")
  const te = useErrorTranslator()
  const L = useEnumLabel()
  const locale = useLocale()
  const router = useRouter()

  const [exporting, setExporting] = React.useState<ExportReport | null>(null)
  const [settings, setSettings] = React.useState({
    defaultWeeklyHours: String(data.settings.defaultWeeklyHours),
    defaultAllowanceDays: String(data.settings.defaultAllowanceDays),
    lowBalanceThreshold: String(data.settings.lowBalanceThreshold),
    pendingValidationDays: String(data.settings.pendingValidationDays),
    defaultEmployeeRate: String(data.settings.defaultEmployeeRate),
    defaultEmployerRate: String(data.settings.defaultEmployerRate),
  })
  const [savingSettings, setSavingSettings] = React.useState(false)

  const reports: { key: ExportReport; label: string; adminOnly?: boolean }[] = [
    { key: "attendance", label: t("admin.reportAttendance") },
    { key: "leave", label: t("admin.reportLeave") },
    { key: "project-time", label: t("admin.reportProjectTime") },
    { key: "client-time", label: t("admin.reportClientTime") },
    { key: "capacity", label: t("admin.reportCapacity") },
    { key: "payroll", label: t("admin.reportPayroll"), adminOnly: true },
    { key: "audit", label: t("admin.reportAudit"), adminOnly: true },
  ]

  async function runExport(report: ExportReport) {
    setExporting(report)
    try {
      const file = unwrapActionResult(await exportCsvAction({ report }))
      downloadCsv(file.filename, file.content)
      toast.success(tT("exportReady"))
    } catch (error) {
      toast.error(te(error, "employeesExportFailed"))
    } finally {
      setExporting(null)
    }
  }

  async function saveSettings(event: React.FormEvent) {
    event.preventDefault()
    setSavingSettings(true)
    try {
      unwrapActionResult(
        await updateEmployeeSettingsAction({
          defaultWeeklyHours: Number(settings.defaultWeeklyHours),
          defaultAllowanceDays: Number(settings.defaultAllowanceDays),
          lowBalanceThreshold: Number(settings.lowBalanceThreshold),
          pendingValidationDays: Number(settings.pendingValidationDays),
          defaultEmployeeRate: Number(settings.defaultEmployeeRate),
          defaultEmployerRate: Number(settings.defaultEmployerRate),
        })
      )
      toast.success(tT("settingsUpdated"))
      router.refresh()
    } catch (error) {
      toast.error(te(error, "employeeSettingsFailed"))
    } finally {
      setSavingSettings(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("admin.exportsTitle")}</CardTitle>
          <CardDescription>{t("admin.exportsDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {reports
            .filter((report) => !report.adminOnly || data.access.isAdmin)
            .map((report) => (
              <Button
                key={report.key}
                size="sm"
                variant="outline"
                disabled={exporting !== null}
                onClick={() => void runExport(report.key)}
              >
                {exporting === report.key ? (
                  <Spinner className="size-4" />
                ) : (
                  <DownloadIcon data-icon="inline-start" />
                )}
                {report.label}
              </Button>
            ))}
        </CardContent>
      </Card>

      {data.access.isAdmin ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {t("admin.settingsTitle")}
              </CardTitle>
              <CardDescription>
                {t("admin.settingsDescription")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
                onSubmit={saveSettings}
              >
                <label className="flex flex-col gap-1.5 text-sm">
                  {t("admin.defaultWeeklyHours")}
                  <Input
                    type="number"
                    min={1}
                    max={80}
                    step={0.5}
                    value={settings.defaultWeeklyHours}
                    onChange={(event) =>
                      setSettings((prev) => ({
                        ...prev,
                        defaultWeeklyHours: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm">
                  {t("admin.defaultAllowance")}
                  <Input
                    type="number"
                    min={0}
                    max={365}
                    step={0.5}
                    value={settings.defaultAllowanceDays}
                    onChange={(event) =>
                      setSettings((prev) => ({
                        ...prev,
                        defaultAllowanceDays: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm">
                  {t("admin.lowBalanceThreshold")}
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={settings.lowBalanceThreshold}
                    onChange={(event) =>
                      setSettings((prev) => ({
                        ...prev,
                        lowBalanceThreshold: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm">
                  {t("admin.pendingValidationDays")}
                  <Input
                    type="number"
                    min={0}
                    max={30}
                    value={settings.pendingValidationDays}
                    onChange={(event) =>
                      setSettings((prev) => ({
                        ...prev,
                        pendingValidationDays: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm">
                  {t("admin.defaultEmployeeRate")}
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={settings.defaultEmployeeRate}
                    onChange={(event) =>
                      setSettings((prev) => ({
                        ...prev,
                        defaultEmployeeRate: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="flex flex-col gap-1.5 text-sm">
                  {t("admin.defaultEmployerRate")}
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={settings.defaultEmployerRate}
                    onChange={(event) =>
                      setSettings((prev) => ({
                        ...prev,
                        defaultEmployerRate: event.target.value,
                      }))
                    }
                  />
                </label>
                <div className="sm:col-span-2 xl:col-span-4">
                  <Button type="submit" size="sm" disabled={savingSettings}>
                    {savingSettings ? <Spinner className="size-4" /> : null}
                    {t("common.save")}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {t("admin.profilesTitle")}
              </CardTitle>
              <CardDescription>
                {t("admin.profilesDescription")}
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("admin.member")}</TableHead>
                    <TableHead>{t("admin.employmentType")}</TableHead>
                    <TableHead>{t("admin.contractType")}</TableHead>
                    <TableHead className="text-end">
                      {t("admin.weeklyHours")}
                    </TableHead>
                    <TableHead>{t("admin.role")}</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.members.map((member) => (
                    <TableRow
                      key={member.id}
                      className={
                        !member.profile.isActive ? "opacity-50" : undefined
                      }
                    >
                      <TableCell className="text-sm font-medium">
                        {member.name}
                      </TableCell>
                      <TableCell className="text-sm">
                        {L.employmentType(member.profile.employmentType)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {L.contractType(member.profile.contractType)}
                      </TableCell>
                      <TableCell className="text-end text-sm">
                        {member.profile.weeklyHours} h
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {member.profile.isValidator ? (
                            <Badge variant="secondary">
                              {t("admin.validatorBadge")}
                            </Badge>
                          ) : null}
                          {!member.profile.isActive ? (
                            <Badge variant="outline">
                              {t("admin.inactiveBadge")}
                            </Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell>
                        <ProfileDialog
                          member={member}
                          trigger={
                            <Button
                              size="icon-sm"
                              variant="ghost"
                              aria-label={t("admin.editProfile")}
                              title={t("admin.editProfile")}
                            >
                              <PencilIcon />
                            </Button>
                          }
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card className="self-start">
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="text-base">
                    {t("admin.clientsTitle")}
                  </CardTitle>
                  <ClientDialog
                    trigger={
                      <Button size="sm" variant="outline">
                        <PlusIcon data-icon="inline-start" />
                        {t("admin.addClient")}
                      </Button>
                    }
                  />
                </div>
              </CardHeader>
              <CardContent className="px-0">
                {data.clients.length === 0 ? (
                  <p className="px-6 py-6 text-center text-sm text-muted-foreground">
                    {t("admin.noClients")}
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("admin.clientName")}</TableHead>
                        <TableHead>{t("admin.contactEmail")}</TableHead>
                        <TableHead className="w-10" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.clients.map((client) => (
                        <TableRow
                          key={client.id}
                          className={
                            !client.isActive ? "opacity-50" : undefined
                          }
                        >
                          <TableCell className="text-sm font-medium">
                            {client.name}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {client.contactEmail ?? "—"}
                          </TableCell>
                          <TableCell>
                            <ClientDialog
                              client={client}
                              trigger={
                                <Button
                                  size="icon-sm"
                                  variant="ghost"
                                  aria-label={t("admin.editClient")}
                                  title={t("admin.editClient")}
                                >
                                  <PencilIcon />
                                </Button>
                              }
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card className="self-start">
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="text-base">
                    {t("admin.activitiesTitle")}
                  </CardTitle>
                  <ActivityDialog
                    trigger={
                      <Button size="sm" variant="outline">
                        <PlusIcon data-icon="inline-start" />
                        {t("admin.addActivity")}
                      </Button>
                    }
                  />
                </div>
              </CardHeader>
              <CardContent className="px-0">
                {data.activities.length === 0 ? (
                  <p className="px-6 py-6 text-center text-sm text-muted-foreground">
                    {t("admin.noActivities")}
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("admin.activityName")}</TableHead>
                        <TableHead>{t("admin.activityKind")}</TableHead>
                        <TableHead className="w-10" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.activities.map((activity) => (
                        <TableRow
                          key={activity.id}
                          className={
                            !activity.isActive ? "opacity-50" : undefined
                          }
                        >
                          <TableCell className="text-sm font-medium">
                            {activity.name}
                          </TableCell>
                          <TableCell className="text-sm">
                            {L.activityKind(activity.kind)}
                          </TableCell>
                          <TableCell>
                            <ActivityDialog
                              activity={activity}
                              trigger={
                                <Button
                                  size="icon-sm"
                                  variant="ghost"
                                  aria-label={t("admin.editActivity")}
                                  title={t("admin.editActivity")}
                                >
                                  <PencilIcon />
                                </Button>
                              }
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {t("admin.projectsTitle")}
              </CardTitle>
              <CardDescription>
                {t("admin.projectsDescription")}
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              {data.projects.length === 0 ? (
                <p className="px-6 py-6 text-center text-sm text-muted-foreground">
                  {t("admin.noProjects")}
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("admin.projectName")}</TableHead>
                      <TableHead>{t("admin.client")}</TableHead>
                      <TableHead className="text-end">
                        {t("admin.plannedHours")}
                      </TableHead>
                      <TableHead>{t("admin.billableLabel")}</TableHead>
                      <TableHead className="w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.projects.map((project) => (
                      <TableRow key={project.id}>
                        <TableCell className="text-sm font-medium">
                          {project.name}
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {project.clientName ?? "—"}
                        </TableCell>
                        <TableCell className="text-end text-sm">
                          {project.plannedHours !== undefined
                            ? `${project.plannedHours} h`
                            : "—"}
                        </TableCell>
                        <TableCell>
                          {project.isBillable ? (
                            <Badge variant="secondary">
                              {t("entry.billable")}
                            </Badge>
                          ) : (
                            <Badge variant="outline">
                              {t("entry.nonBillable")}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <ProjectDialog
                            data={data}
                            project={project}
                            trigger={
                              <Button
                                size="icon-sm"
                                variant="ghost"
                                aria-label={t("admin.editProject")}
                                title={t("admin.editProject")}
                              >
                                <PencilIcon />
                              </Button>
                            }
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {t("admin.auditTitle")}
              </CardTitle>
              <CardDescription>{t("admin.auditDescription")}</CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              {data.audit.length === 0 ? (
                <p className="px-6 py-6 text-center text-sm text-muted-foreground">
                  {t("admin.noAudit")}
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("admin.auditDate")}</TableHead>
                      <TableHead>{t("admin.auditActor")}</TableHead>
                      <TableHead>{t("admin.auditAction")}</TableHead>
                      <TableHead>{t("admin.auditEntity")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.audit.slice(0, 30).map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell className="text-sm whitespace-nowrap">
                          {formatDateKey(entry.createdAt.slice(0, 10), locale)}
                        </TableCell>
                        <TableCell className="text-sm">
                          {entry.actorName}
                        </TableCell>
                        <TableCell className="text-sm">
                          {
                            t(
                              `auditActions.${entry.action.replace(/\./g, "_")}` as never,
                              {} as never
                            ) as string
                          }
                        </TableCell>
                        <TableCell className="truncate text-xs text-muted-foreground">
                          {entry.entityType}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  )
}
