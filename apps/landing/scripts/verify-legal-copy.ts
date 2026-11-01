/**
 * Guards the legal pack against translation drift.
 *
 * `fr` is not covered by the `Messages` type — only `en` is — so a missing or
 * malformed French string would only surface at render time. This check walks
 * the structure in `lib/landing/legal.ts` and asserts that every message key
 * exists, has the right shape, and is present in both locales.
 *
 * Run with `npm run verify:legal-copy --workspace=landing`.
 */
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import {
  legalSlugs,
  legalStructure,
  type LegalSlug,
} from "../lib/landing/legal"

type Messages = Record<string, unknown>

const locales = ["en", "fr"] as const
const problems: string[] = []

function load(locale: string): Messages {
  const path = fileURLToPath(
    new URL(
      `../../../packages/i18n/messages/${locale}/legal.json`,
      import.meta.url
    )
  )
  return JSON.parse(readFileSync(path, "utf8")) as Messages
}

function doc(messages: Messages, slug: LegalSlug): Messages {
  const value = messages[slug]
  if (!value || typeof value !== "object") {
    problems.push(`${slug}: document missing`)
    return {}
  }
  return value as Messages
}

function expectString(source: string, messages: Messages, key: string) {
  const value = messages[key]
  if (typeof value !== "string" || value.trim() === "") {
    problems.push(`${source}: "${key}" is not a non-empty string`)
  }
}

function expectArray(source: string, messages: Messages, key: string) {
  const value = messages[key]
  if (!Array.isArray(value) || value.length === 0) {
    problems.push(`${source}: "${key}" is not a non-empty array`)
    return
  }
  value.forEach((item, index) => {
    if (typeof item !== "string" || item.trim() === "") {
      problems.push(`${source}: "${key}[${index}]" is not a non-empty string`)
    }
  })
}

function expectTable(source: string, messages: Messages, key: string) {
  const value = messages[key]
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    problems.push(`${source}: "${key}" is not a table`)
    return
  }
  const { columns, rows } = value as {
    columns?: unknown
    rows?: unknown
  }
  if (!Array.isArray(columns) || columns.length < 2) {
    problems.push(`${source}: "${key}.columns" needs at least two columns`)
    return
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    problems.push(`${source}: "${key}.rows" is empty`)
    return
  }
  rows.forEach((row, rowIndex) => {
    if (!Array.isArray(row) || row.length !== columns.length) {
      problems.push(
        `${source}: "${key}.rows[${rowIndex}]" has ${
          Array.isArray(row) ? row.length : "no"
        } cells, expected ${columns.length}`
      )
      return
    }
    row.forEach((cell: unknown, cellIndex: number) => {
      if (typeof cell !== "string" || cell.trim() === "") {
        problems.push(
          `${source}: "${key}.rows[${rowIndex}][${cellIndex}]" is empty`
        )
      }
    })
  })
}

const expectedKeys = new Map<LegalSlug, Set<string>>()

for (const slug of legalSlugs) {
  const keys = new Set<string>(["title", "description", "updated"])
  for (const section of legalStructure[slug]) {
    keys.add(`${section.key}h`)
    for (const block of section.blocks) keys.add(block.key)
  }
  expectedKeys.set(slug, keys)
}

for (const locale of locales) {
  const messages = load(locale)

  for (const slug of legalSlugs) {
    const source = `${locale}.${slug}`
    const copy = doc(messages, slug)
    const expected = expectedKeys.get(slug)

    for (const key of ["title", "description", "updated"]) {
      expectString(source, copy, key)
    }

    for (const section of legalStructure[slug]) {
      expectString(source, copy, `${section.key}h`)
      for (const block of section.blocks) {
        if (block.kind === "p" || block.kind === "pre") {
          expectString(source, copy, block.key)
        } else if (block.kind === "list") {
          expectArray(source, copy, block.key)
        } else {
          expectTable(source, copy, block.key)
        }
      }
    }

    for (const key of Object.keys(copy)) {
      if (!expected?.has(key)) {
        problems.push(`${source}: unexpected key "${key}"`)
      }
    }
  }

  for (const key of Object.keys(messages)) {
    if (!(legalSlugs as readonly string[]).includes(key)) {
      problems.push(`${locale}: unexpected document "${key}"`)
    }
  }
}

const en = load("en")
const fr = load("fr")
for (const slug of legalSlugs) {
  const enKeys = Object.keys(doc(en, slug)).sort()
  const frKeys = Object.keys(doc(fr, slug)).sort()
  const missingInFr = enKeys.filter((key) => !frKeys.includes(key))
  const missingInEn = frKeys.filter((key) => !enKeys.includes(key))
  for (const key of missingInFr) problems.push(`fr.${slug}: missing "${key}"`)
  for (const key of missingInEn) problems.push(`en.${slug}: missing "${key}"`)
}

if (problems.length > 0) {
  console.error(`Legal copy check failed (${problems.length}):`)
  for (const problem of problems) console.error(`  - ${problem}`)
  process.exit(1)
}

console.log(
  `Legal copy check passed: ${legalSlugs.length} documents in ${locales.length} locales.`
)
