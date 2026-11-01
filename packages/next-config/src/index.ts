import createMDX from "@next/mdx"
import createNextIntlPlugin from "next-intl/plugin"

import type { NextConfig } from "next"

/** Shared security headers for every workspace app. */
export interface SecurityHeaderOptions {
  /** Ask crawlers not to index the app (control tower). */
  noindex?: boolean
  referrerPolicy?: string
  /** Set to false for apps that cannot use the product's CSP yet. */
  contentSecurityPolicy?: false | string
}

export function securityHeaders(
  options: SecurityHeaderOptions = {}
): { key: string; value: string }[] {
  const {
    noindex = false,
    referrerPolicy = "strict-origin-when-cross-origin",
    contentSecurityPolicy = "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; connect-src 'self'",
  } = options

  return [
    ...(noindex ? [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] : []),
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: referrerPolicy },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=()",
    },
    {
      key: "Strict-Transport-Security",
      value: "max-age=63072000; includeSubDomains; preload",
    },
    ...(contentSecurityPolicy
      ? [
          {
            key: "Content-Security-Policy-Report-Only",
            value: contentSecurityPolicy,
          },
        ]
      : []),
  ]
}

export interface WorkspaceNextConfigOptions {
  /** Repo root, usually `path.join(projectRoot, "../..")`. */
  outputFileTracingRoot: string
  transpilePackages?: string[]
  serverExternalPackages?: string[]
  redirects?: NextConfig["redirects"]
  headers?: NextConfig["headers"]
  experimental?: NextConfig["experimental"]
  env?: NextConfig["env"]
  poweredByHeader?: boolean
  /** App-relative next-intl request config; `false` disables the plugin. */
  i18nRequestConfig?: string | false
}

/**
 * The shared Next.js configuration: standalone output, MDX, security headers,
 * Sentry's public DSN and the next-intl plugin. App-specific routes, packages
 * and experiments are passed in by the app.
 */
export function createNextConfig(
  options: WorkspaceNextConfigOptions
): NextConfig {
  const nextConfig: NextConfig = {
    output: "standalone",
    outputFileTracingRoot: options.outputFileTracingRoot,
    transpilePackages: [
      "@workspace/ui",
      "@workspace/core",
      "@workspace/app-shell",
      "@workspace/auth",
      "@workspace/organization",
      "@workspace/i18n",
      ...(options.transpilePackages ?? []),
    ],
    serverExternalPackages: options.serverExternalPackages,
    pageExtensions: ["js", "jsx", "md", "mdx", "ts", "tsx"],
    // The browser SDK needs the DSN at build time; it is public, not a secret.
    env: {
      NEXT_PUBLIC_SENTRY_DSN: process.env.SENTRY_DSN ?? "",
      ...options.env,
    },
    ...(options.poweredByHeader === undefined
      ? {}
      : { poweredByHeader: options.poweredByHeader }),
    experimental: {
      agentUpgrade: "security",
      ...options.experimental,
      serverActions: {
        bodySizeLimit: "8mb",
        ...options.experimental?.serverActions,
      },
    },
    redirects: options.redirects,
    headers:
      options.headers ??
      (() => [
        {
          source: "/(.*)",
          headers: securityHeaders(),
        },
      ]),
  }

  const withMDX = createMDX({
    options: {
      remarkPlugins: [
        "remark-frontmatter",
        ["remark-mdx-frontmatter", { name: "frontmatter" }],
      ],
    },
  })

  const mdxConfig = withMDX(nextConfig)
  if (options.i18nRequestConfig === false) return mdxConfig

  const withNextIntl = createNextIntlPlugin(
    options.i18nRequestConfig ?? "./i18n/request.ts"
  )
  return withNextIntl(mdxConfig)
}
