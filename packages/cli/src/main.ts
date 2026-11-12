import { readFile } from "node:fs/promises"

import { ApiClient } from "./client.js"
import { run, USAGE, type Io } from "./commands.js"
import { configPath, readConfig, resolveConfig } from "./config.js"
import { CliError, EXIT } from "./errors.js"

const VALUE_FLAGS = new Set(["--token", "--api-url"])

/** Pulls the global options out of argv, wherever they appear. */
export function splitGlobals(argv: string[]) {
  const globals: {
    token?: string
    apiUrl?: string
    json: boolean
    help: boolean
  } = {
    json: false,
    help: false,
  }
  const rest: string[] = []
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]!
    const [name, inline] = arg.startsWith("--") ? arg.split(/=(.*)/s, 2) : [arg]
    if (name && VALUE_FLAGS.has(name)) {
      const value = inline ?? argv[++index]
      if (!value)
        throw new CliError(`${name} needs a value.`, EXIT.invalidInput)
      if (name === "--token") globals.token = value
      else globals.apiUrl = value
    } else if (arg === "--json") globals.json = true
    else if (arg === "--help" || arg === "-h") globals.help = true
    else rest.push(arg)
  }
  return { globals, rest }
}

async function readStdin() {
  const chunks: Buffer[] = []
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks).toString("utf8")
}

export async function main(
  argv: string[],
  env = process.env,
  io?: Partial<Io>
) {
  const out = io?.out ?? ((line: string) => process.stdout.write(`${line}\n`))
  try {
    const { globals, rest } = splitGlobals(argv)
    if (globals.help || rest.length === 0) {
      out(USAGE)
      return EXIT.ok
    }
    const config = resolveConfig(
      { token: globals.token, apiUrl: globals.apiUrl },
      env,
      await readConfig(configPath(env))
    )
    await run(
      rest.slice(0, 2),
      rest.slice(2),
      {
        client: new ApiClient({ apiUrl: config.apiUrl, token: config.token }),
        json: globals.json,
        env,
        tokenSource: config.tokenSource,
        io: {
          out,
          readStdin: io?.readStdin ?? readStdin,
          readFile: io?.readFile ?? ((file) => readFile(file, "utf8")),
        },
      },
      { token: globals.token, "api-url": globals.apiUrl }
    )
    return EXIT.ok
  } catch (error) {
    // parseArgs throws TypeErrors with a code for unknown or malformed options.
    const usage = (error as { code?: string }).code?.startsWith(
      "ERR_PARSE_ARGS"
    )
    const cli =
      error instanceof CliError
        ? error
        : new CliError(
            error instanceof Error ? error.message : String(error),
            usage ? EXIT.invalidInput : EXIT.failure
          )
    process.stderr.write(`asynchrone: ${cli.message}\n`)
    return cli.exitCode
  }
}
