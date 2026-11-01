import { redirect } from "next/navigation"

/**
 * Account settings entry point (`/settings`). Organization settings live at
 * `/<orgSlug>/settings`; this keeps the old apex `/settings` link working.
 */
export default function SettingsPage() {
  redirect("/settings/account")
}
