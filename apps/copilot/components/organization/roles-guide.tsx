"use client"

import { useTranslations } from "next-intl"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

import { RoleBadges } from "@/components/organization/role-picker"
import { useEnumLabel } from "@workspace/i18n/labels"
import { ORG_ROLES } from "@workspace/organization/roles"

/** What each role grants, so support can explain the difference. */
export function RolesGuide() {
  const t = useTranslations("Org")
  const L = useEnumLabel()
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("rolesGuideTitle")}</CardTitle>
        <CardDescription>{t("rolesGuideDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="flex flex-col gap-3">
          {ORG_ROLES.map(({ value }) => (
            <div
              key={value}
              className="flex flex-col gap-1 sm:flex-row sm:gap-4"
            >
              <dt className="sm:w-32 sm:shrink-0">
                <RoleBadges roles={[value]} tooltips={false} />
              </dt>
              <dd className="text-sm text-muted-foreground">
                {L.orgRoleDescription(value)}
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  )
}
