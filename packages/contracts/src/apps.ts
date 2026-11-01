/**
 * The app registry.
 *
 * This module is intentionally free of `process.env`: it can be imported by
 * client components that only need app names, database ownership or internal
 * audiences. Server code that needs an origin uses `@workspace/contracts/server`.
 *
 * Hosts, database URLs and OAuth client secrets stay in runtime environment
 * variables; they are never baked into an image.
 */

export const APP_KEYS = [
  "landing",
  "copilot",
  "projects",
  "calendars",
  "files",
  "messages",
  "clients",
  "employees",
  "control-tower",
] as const

export type AppKey = (typeof APP_KEYS)[number]

/** Apps that receive the customer identity and an OAuth client. */
export const CUSTOMER_APP_KEYS = [
  "copilot",
  "projects",
  "calendars",
  "files",
  "messages",
  "clients",
  "employees",
] as const

export type CustomerAppKey = (typeof CUSTOMER_APP_KEYS)[number]

export interface AppDatabase {
  /** PostgreSQL database name, for example `asynchrone_projects`. */
  name: string
  /** Environment variable holding this app's connection string. */
  env: string
}

export interface AppOAuthClient {
  /** Environment variable holding the confidential client ID. */
  clientIdEnv: string
  /** Environment variable holding the confidential client secret or key. */
  clientSecretEnv: string
}

export interface AppDefinition {
  key: AppKey
  /** Environment variable holding the public origin. */
  hostEnv: string
  /** Local development origin when `hostEnv` is unset. */
  devUrl: string
  /** The database this app owns, or null for the stateless landing app. */
  database: AppDatabase | null
  /** OAuth resource/audience used for service-to-service tokens. */
  internalAudience: string
  /** Confidential OAuth client credentials, or null when the app has none. */
  oauth: AppOAuthClient | null
  /** Translation key used by a future app switcher. */
  titleKey: string
}

function audience(key: AppKey): string {
  return `urn:asynchrone:app:${key}`
}

function oauth(key: AppKey): AppOAuthClient {
  const prefix = key.toUpperCase().replaceAll("-", "_")
  return {
    clientIdEnv: `${prefix}_OAUTH_CLIENT_ID`,
    clientSecretEnv: `${prefix}_OAUTH_CLIENT_SECRET`,
  }
}

export const APPS: Record<AppKey, AppDefinition> = {
  landing: {
    key: "landing",
    hostEnv: "LANDING_APP_URL",
    devUrl: "http://localhost:3002",
    database: null,
    internalAudience: audience("landing"),
    oauth: null,
    titleKey: "landing",
  },
  copilot: {
    key: "copilot",
    hostEnv: "COPILOT_APP_URL",
    devUrl: "http://localhost:3003",
    database: { name: "asynchrone_identity", env: "IDENTITY_DATABASE_URL" },
    internalAudience: audience("copilot"),
    oauth: oauth("copilot"),
    titleKey: "workspace",
  },
  projects: {
    key: "projects",
    hostEnv: "PROJECTS_APP_URL",
    devUrl: "http://localhost:3004",
    database: { name: "asynchrone_projects", env: "PROJECTS_DATABASE_URL" },
    internalAudience: audience("projects"),
    oauth: oauth("projects"),
    titleKey: "projects",
  },
  calendars: {
    key: "calendars",
    hostEnv: "CALENDARS_APP_URL",
    devUrl: "http://localhost:3005",
    database: { name: "asynchrone_calendars", env: "CALENDARS_DATABASE_URL" },
    internalAudience: audience("calendars"),
    oauth: oauth("calendars"),
    titleKey: "calendars",
  },
  files: {
    key: "files",
    hostEnv: "FILES_APP_URL",
    devUrl: "http://localhost:3006",
    database: { name: "asynchrone_files", env: "FILES_DATABASE_URL" },
    internalAudience: audience("files"),
    oauth: oauth("files"),
    titleKey: "files",
  },
  messages: {
    key: "messages",
    hostEnv: "MESSAGES_APP_URL",
    devUrl: "http://localhost:3007",
    database: { name: "asynchrone_messages", env: "MESSAGES_DATABASE_URL" },
    internalAudience: audience("messages"),
    oauth: oauth("messages"),
    titleKey: "messages",
  },
  clients: {
    key: "clients",
    hostEnv: "CLIENTS_APP_URL",
    devUrl: "http://localhost:3008",
    database: { name: "asynchrone_clients", env: "CLIENTS_DATABASE_URL" },
    internalAudience: audience("clients"),
    oauth: oauth("clients"),
    titleKey: "clients",
  },
  employees: {
    key: "employees",
    hostEnv: "EMPLOYEES_APP_URL",
    devUrl: "http://localhost:3009",
    database: { name: "asynchrone_employees", env: "EMPLOYEES_DATABASE_URL" },
    internalAudience: audience("employees"),
    oauth: oauth("employees"),
    titleKey: "employees",
  },
  "control-tower": {
    key: "control-tower",
    hostEnv: "CONTROL_TOWER_APP_URL",
    devUrl: "http://localhost:3001",
    database: {
      name: "asynchrone_control_tower",
      env: "CONTROL_TOWER_DATABASE_URL",
    },
    internalAudience: audience("control-tower"),
    oauth: oauth("control-tower"),
    titleKey: "controlTower",
  },
}

/** All app keys, including the landing and control tower. */
export function isAppKey(value: string): value is AppKey {
  return (APP_KEYS as readonly string[]).includes(value)
}

/** Throws when a key is unknown; useful at config boundaries. */
export function appDefinition(key: string): AppDefinition {
  if (!isAppKey(key)) throw new Error(`Unknown app key: ${key}`)
  return APPS[key]
}

/** PostgreSQL database name owned by an app, or null for the landing app. */
export function databaseName(key: AppKey): string | null {
  return APPS[key].database?.name ?? null
}

/** OAuth resource/audience for an app's internal API. */
export function internalAudience(key: AppKey): string {
  return APPS[key].internalAudience
}

/** Confidential OAuth client credentials for an app, or null. */
export function oauthClient(key: AppKey): AppOAuthClient | null {
  return APPS[key].oauth
}
