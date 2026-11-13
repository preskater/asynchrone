"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { CheckCircle2Icon, KeyRoundIcon, Trash2Icon } from "lucide-react"
import { toast } from "sonner"

import {
  removeSsoProviderAction,
  requestSsoDomainVerificationAction,
  saveSsoProviderAction,
  setSsoEnforcedAction,
  verifySsoDomainAction,
} from "@/actions/sso"
import { PlanUpgradePrompt } from "@/components/organization/plan-upgrade-prompt"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@workspace/ui/components/alert-dialog"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { Tabs, TabsList, TabsTrigger } from "@workspace/ui/components/tabs"
import { Textarea } from "@workspace/ui/components/textarea"

import { unwrapActionResult, type ActionResult } from "@workspace/core/action"
import { useErrorTranslator } from "@workspace/i18n/errors"
import type { SsoSettings } from "@/lib/organization/sso"
import { useEntitlements } from "@/lib/organization/use-entitlements"

type Kind = "oidc" | "saml"

function Value({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <code className="rounded-md bg-muted px-2 py-1 break-all">{value}</code>
    </div>
  )
}

export function SsoCard({ settings }: { settings: SsoSettings }) {
  const t = useTranslations("Org.sso")
  const te = useErrorTranslator()
  const router = useRouter()
  const entitled = useEntitlements().can("sso")
  const provider = settings.provider
  const [kind, setKind] = React.useState<Kind>(provider?.kind ?? "oidc")
  const [pending, setPending] = React.useState(false)

  async function run(
    action: () => Promise<ActionResult<unknown>>,
    success: string
  ) {
    setPending(true)
    try {
      unwrapActionResult(await action())
      toast.success(success)
      router.refresh()
    } catch (error) {
      toast.error(te(error, "internal"))
    } finally {
      setPending(false)
    }
  }

  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = Object.fromEntries(new FormData(event.currentTarget))
    void run(() => saveSsoProviderAction({ ...form, kind }), t("saved"))
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRoundIcon className="size-4" />
          {t("title")}
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {entitled ? null : <PlanUpgradePrompt feature="sso" />}

        {entitled ? (
          <form onSubmit={save} className="space-y-4">
            <Tabs
              value={kind}
              onValueChange={(value) => setKind(value as Kind)}
            >
              <TabsList aria-label={t("protocol")}>
                <TabsTrigger value="oidc">OIDC</TabsTrigger>
                <TabsTrigger value="saml">SAML</TabsTrigger>
              </TabsList>
            </Tabs>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="sso-domain">{t("domain")}</FieldLabel>
                <Input
                  id="sso-domain"
                  name="domain"
                  required
                  placeholder="example.com"
                  defaultValue={provider?.domain}
                />
                <FieldDescription>{t("domainHint")}</FieldDescription>
              </Field>
              {kind === "oidc" ? (
                <>
                  <Field>
                    <FieldLabel htmlFor="sso-issuer">{t("issuer")}</FieldLabel>
                    <Input
                      id="sso-issuer"
                      name="issuer"
                      type="url"
                      required
                      placeholder="https://login.example.com"
                      defaultValue={
                        provider?.kind === "oidc" ? provider.issuer : undefined
                      }
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="sso-client-id">
                      {t("clientId")}
                    </FieldLabel>
                    <Input
                      id="sso-client-id"
                      name="clientId"
                      required
                      defaultValue={provider?.clientId}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="sso-client-secret">
                      {t("clientSecret")}
                    </FieldLabel>
                    <Input
                      id="sso-client-secret"
                      name="clientSecret"
                      type="password"
                      autoComplete="off"
                      required={provider?.kind !== "oidc"}
                      placeholder={
                        provider?.kind === "oidc" ? t("secretKept") : undefined
                      }
                    />
                  </Field>
                  <Value
                    label={t("redirectUri")}
                    value={settings.urls.oidcCallback}
                  />
                </>
              ) : (
                <>
                  <Field>
                    <FieldLabel htmlFor="sso-entry-point">
                      {t("entryPoint")}
                    </FieldLabel>
                    <Input
                      id="sso-entry-point"
                      name="entryPoint"
                      type="url"
                      required
                      defaultValue={provider?.entryPoint}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="sso-entity-id">
                      {t("entityId")}
                    </FieldLabel>
                    <Input
                      id="sso-entity-id"
                      name="entityId"
                      required
                      defaultValue={provider?.entityId}
                    />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="sso-certificate">
                      {t("certificate")}
                    </FieldLabel>
                    <Textarea
                      id="sso-certificate"
                      name="certificate"
                      required
                      rows={4}
                      placeholder="-----BEGIN CERTIFICATE-----"
                    />
                  </Field>
                  <Value label={t("acsUrl")} value={settings.urls.samlAcs} />
                  <Value
                    label={t("metadataUrl")}
                    value={settings.urls.samlMetadata}
                  />
                </>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="sso-email-attribute">
                    {t("emailAttribute")}
                  </FieldLabel>
                  <Input
                    id="sso-email-attribute"
                    name="emailAttribute"
                    placeholder="email"
                    defaultValue={provider?.emailAttribute}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="sso-name-attribute">
                    {t("nameAttribute")}
                  </FieldLabel>
                  <Input
                    id="sso-name-attribute"
                    name="nameAttribute"
                    placeholder="name"
                    defaultValue={provider?.nameAttribute}
                  />
                </Field>
              </div>
            </FieldGroup>
            <Button type="submit" disabled={pending}>
              {t("save")}
            </Button>
          </form>
        ) : null}

        {provider ? (
          <div className="space-y-4 border-t pt-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">{provider.domain}</span>
              {provider.domainVerified ? (
                <Badge variant="secondary">
                  <CheckCircle2Icon data-icon="inline-start" />
                  {t("verified")}
                </Badge>
              ) : (
                <Badge variant="outline">{t("unverified")}</Badge>
              )}
            </div>

            {!provider.domainVerified && entitled ? (
              <div className="space-y-3">
                <FieldDescription>{t("dnsInstructions")}</FieldDescription>
                {settings.verification ? (
                  <>
                    <Value
                      label={t("dnsName")}
                      value={settings.verification.name}
                    />
                    <Value
                      label={t("dnsValue")}
                      value={settings.verification.value}
                    />
                  </>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={pending || !settings.verification}
                    onClick={() =>
                      run(verifySsoDomainAction, t("domainVerified"))
                    }
                  >
                    {t("verify")}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={pending}
                    onClick={() =>
                      run(requestSsoDomainVerificationAction, t("tokenIssued"))
                    }
                  >
                    {t("newToken")}
                  </Button>
                </div>
              </div>
            ) : null}

            {/* A downgraded org can still turn SSO-only off. */}
            {entitled || settings.enforced ? (
              <Field orientation="horizontal">
                <Checkbox
                  id="org-sso-enforced"
                  checked={settings.enforced}
                  disabled={
                    pending || (!settings.enforced && !provider.domainVerified)
                  }
                  onCheckedChange={(checked) =>
                    run(
                      () => setSsoEnforcedAction(checked === true),
                      checked === true ? t("enforced") : t("notEnforced")
                    )
                  }
                />
                <div className="flex flex-col gap-1">
                  <FieldLabel htmlFor="org-sso-enforced">
                    {t("enforce")}
                  </FieldLabel>
                  <FieldDescription>{t("enforceHint")}</FieldDescription>
                </div>
              </Field>
            ) : null}

            <AlertDialog>
              <AlertDialogTrigger
                render={<Button variant="outline" disabled={pending} />}
              >
                <Trash2Icon data-icon="inline-start" />
                {t("remove")}
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t("removeTitle")}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t("removeDescription")}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    onClick={() => run(removeSsoProviderAction, t("removed"))}
                  >
                    {t("remove")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
