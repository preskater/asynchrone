/**
 * Builds the printable legal pack that procurement teams ask for.
 *
 * The customer-facing pages render from `lib/landing/legal.ts` and
 * `messages/<locale>/legal.json`; this script prints the same structure to
 * A4 PDFs with headless Chromium (Playwright) and writes them to
 * `public/downloads/legal`, where each legal page links to its own copy.
 *
 * Run with `npm run legal:pdfs --workspace=landing` after changing any legal copy,
 * then commit the regenerated PDFs.
 */
import { mkdir, readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"

import { chromium } from "@playwright/test"

import {
  legalSlugs,
  legalStructure,
  type LegalBlock,
  type LegalSlug,
} from "../lib/landing/legal"

type Copy = Record<string, unknown>

interface LegalTable {
  columns: string[]
  rows: string[][]
}

const locales = ["en", "fr"] as const

const outputDir = fileURLToPath(
  new URL("../public/downloads/legal/", import.meta.url)
)

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

function text(value: unknown): string {
  return typeof value === "string" ? value : ""
}

function renderBlock(block: LegalBlock, copy: Copy): string {
  const value = copy[block.key]

  if (block.kind === "p") {
    return `<p>${escapeHtml(text(value))}</p>`
  }

  if (block.kind === "pre") {
    return `<p class="pre">${escapeHtml(text(value))}</p>`
  }

  if (block.kind === "list") {
    if (!Array.isArray(value)) return ""
    const items = value
      .map((item) => `<li>${escapeHtml(text(item))}</li>`)
      .join("")
    return `<ul>${items}</ul>`
  }

  const table = value as Partial<LegalTable> | undefined
  if (!table?.columns || !table.rows) return ""
  const head = table.columns
    .map((column) => `<th>${escapeHtml(column)}</th>`)
    .join("")
  const body = table.rows
    .map(
      (row) =>
        `<tr>${row
          .map(
            (cell, index) =>
              `<td${index === 0 ? ' class="lead"' : ""}>${escapeHtml(cell)}</td>`
          )
          .join("")}</tr>`
    )
    .join("")
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`
}

function renderDocument(slug: LegalSlug, locale: string, copy: Copy) {
  const title = text(copy.title)
  const description = text(copy.description)
  const updated = text(copy.updated)

  const sections = legalStructure[slug]
    .map((section) => {
      const heading = escapeHtml(text(copy[`${section.key}h`]))
      const blocks = section.blocks
        .map((block) => renderBlock(block, copy))
        .join("\n")
      return `<section><h2>${heading}</h2>\n${blocks}</section>`
    })
    .join("\n")

  return `<!doctype html>
<html lang="${locale}">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)} — Asynchrone Space</title>
<style>
  @page { size: A4; margin: 18mm 16mm 20mm; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif;
    font-size: 10.5pt;
    line-height: 1.55;
    color: #1a1a1a;
    margin: 0;
  }
  header { border-bottom: 1px solid #d4d4d4; padding-bottom: 12px; margin-bottom: 20px; }
  h1 { font-size: 22pt; margin: 0 0 6px; letter-spacing: -0.01em; }
  .description { color: #525252; margin: 0 0 8px; font-size: 11pt; }
  .meta { color: #737373; font-size: 9pt; margin: 0; }
  section { margin-bottom: 18px; page-break-inside: auto; }
  h2 {
    font-size: 12.5pt;
    margin: 0 0 6px;
    padding-top: 4px;
    page-break-after: avoid;
  }
  p { margin: 0 0 8px; color: #262626; text-align: justify; }
  p.pre { white-space: pre-line; line-height: 1.9; font-family: inherit; }
  ul { margin: 0 0 8px; padding-left: 18px; color: #262626; }
  li { margin-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0 10px; font-size: 8.5pt; }
  thead { display: table-header-group; }
  th {
    text-align: left;
    background: #f5f5f5;
    border-bottom: 1px solid #d4d4d4;
    padding: 5px 6px;
    font-weight: 600;
  }
  td { border-bottom: 1px solid #e5e5e5; padding: 5px 6px; vertical-align: top; color: #404040; }
  td.lead { color: #171717; font-weight: 500; }
  tr { page-break-inside: avoid; }
</style>
</head>
<body>
<header>
  <h1>${escapeHtml(title)}</h1>
  <p class="description">${escapeHtml(description)}</p>
  <p class="meta">${escapeHtml(updated)} · Asynchrone Space · asynchrone.space/legal/${slug}</p>
</header>
${sections}
</body>
</html>`
}

async function main() {
  await mkdir(outputDir, { recursive: true })

  const browser = await chromium.launch()
  const page = await browser.newPage()
  const written: string[] = []

  for (const locale of locales) {
    const copy = JSON.parse(
      await readFile(
        fileURLToPath(
          new URL(
            `../../../packages/i18n/messages/${locale}/legal.json`,
            import.meta.url
          )
        ),
        "utf8"
      )
    ) as Record<string, Copy>

    for (const slug of legalSlugs) {
      const document = copy[slug]
      if (!document)
        throw new Error(`${locale}/legal.json is missing "${slug}"`)
      await page.setContent(renderDocument(slug, locale, document), {
        waitUntil: "load",
      })
      const filename = `${slug}-${locale}.pdf`
      await page.pdf({
        path: `${outputDir}${filename}`,
        format: "A4",
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: "<span></span>",
        footerTemplate: `<div style="width:100%;padding:0 16mm;font-family:Helvetica,Arial,sans-serif;font-size:8pt;color:#737373;display:flex;justify-content:space-between;">
          <span>Asynchrone Space</span>
          <span><span class="pageNumber"></span> / <span class="totalPages"></span></span>
        </div>`,
        margin: { top: "18mm", bottom: "20mm", left: "16mm", right: "16mm" },
      })
      written.push(filename)
    }
  }

  await browser.close()

  console.log(
    `Wrote ${written.length} PDFs to public/downloads/legal:\n${written
      .map((name) => `  - ${name}`)
      .join("\n")}`
  )
}

await main()
