import { AccountSettings } from "@/components/account/account-settings"

/**
 * Social providers are configured through environment variables; the linking
 * card is hidden unless the corresponding OAuth apps exist. Reading
 * `process.env` here keeps those server-only values out of the client bundle.
 */
export default function AccountPage() {
  const socialProviders: Array<"github" | "gitlab"> = []
  if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
    socialProviders.push("github")
  }
  if (process.env.GITLAB_CLIENT_ID && process.env.GITLAB_CLIENT_SECRET) {
    socialProviders.push("gitlab")
  }

  return (
    <div className="flex flex-1 flex-col gap-4 px-4 py-4 md:py-6 lg:px-6">
      <AccountSettings socialProviders={socialProviders} />
    </div>
  )
}
