import { chmod, mkdir, readFile, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import path from "node:path"

import { CliError, EXIT } from "./errors.js"

export const DEFAULT_API_URL = "https://copilot.asynchrone.space"

export interface StoredConfig {
  token?: string
  apiUrl?: string
}

export interface ResolvedConfig {
  token: string | null
  apiUrl: string
  /** Where the token came from, for `auth status`. */
  tokenSource: "flag" | "env" | "file" | null
}

type Env = Record<string, string | undefined>

/** `$XDG_CONFIG_HOME/asynchrone/config.json`, else `~/.config/…`. */
export function configPath(env: Env = process.env, home = homedir()) {
  const base = env.XDG_CONFIG_HOME || path.join(home, ".config")
  return path.join(base, "asynchrone", "config.json")
}

export async function readConfig(file: string): Promise<StoredConfig> {
  let raw: string
  try {
    raw = await readFile(file, "utf8")
  } catch {
    return {}
  }
  try {
    const parsed = JSON.parse(raw) as StoredConfig
    return typeof parsed === "object" && parsed ? parsed : {}
  } catch {
    throw new CliError(`${file} is not valid JSON.`, EXIT.invalidInput)
  }
}

/** Written with mode 0600 in a 0700 directory: the file holds a secret. */
export async function writeConfig(file: string, config: StoredConfig) {
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 })
  await writeFile(file, `${JSON.stringify(config, null, 2)}\n`, {
    mode: 0o600,
  })
  // `mode` only applies when the file is created; tighten an existing one.
  await chmod(file, 0o600)
}

/** Precedence: `--token` / `--api-url`, then the environment, then the file. */
export function resolveConfig(
  flags: { token?: string; apiUrl?: string },
  env: Env,
  stored: StoredConfig
): ResolvedConfig {
  const [token, tokenSource] = flags.token
    ? [flags.token, "flag" as const]
    : env.ASYNCHRONE_TOKEN
      ? [env.ASYNCHRONE_TOKEN, "env" as const]
      : stored.token
        ? [stored.token, "file" as const]
        : [null, null]
  const apiUrl =
    flags.apiUrl || env.ASYNCHRONE_API_URL || stored.apiUrl || DEFAULT_API_URL
  return { token, tokenSource, apiUrl: apiUrl.replace(/\/+$/, "") }
}
