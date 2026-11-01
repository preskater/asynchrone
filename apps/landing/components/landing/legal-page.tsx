import { getLocale, getTranslations } from "next-intl/server"
import { DownloadIcon } from "lucide-react"

import { Container, Section } from "@/components/landing/section"
import { Button } from "@workspace/ui/components/button"
import {
  legalPdfPath,
  legalStructure,
  type LegalBlock,
  type LegalSlug,
} from "@/lib/landing/legal"

interface LegalTable {
  columns: string[]
  rows: string[][]
}

function readTable(value: unknown): LegalTable | null {
  if (!value || typeof value !== "object") return null
  const { columns, rows } = value as Partial<LegalTable>
  if (!Array.isArray(columns) || !Array.isArray(rows)) return null
  if (!columns.every((column) => typeof column === "string")) return null
  if (!rows.every((row) => Array.isArray(row))) return null
  return { columns, rows }
}

function LegalBlockView({
  block,
  translate,
  raw,
}: {
  block: LegalBlock
  translate: (key: string) => string
  raw: (key: string) => unknown
}) {
  if (block.kind === "p") {
    return (
      <p className="mt-3 leading-7 text-muted-foreground">
        {translate(block.key)}
      </p>
    )
  }

  if (block.kind === "list") {
    const items = raw(block.key)
    if (!Array.isArray(items)) return null
    return (
      <ul className="mt-3 list-disc space-y-2 ps-5 leading-7 text-muted-foreground">
        {items.map((item, index) => (
          <li key={index}>{String(item)}</li>
        ))}
      </ul>
    )
  }

  if (block.kind === "pre") {
    return (
      <p className="mt-4 leading-8 whitespace-pre-line text-muted-foreground">
        {translate(block.key)}
      </p>
    )
  }

  const table = readTable(raw(block.key))
  if (!table) return null
  return (
    <div className="mt-4 overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[40rem] border-collapse text-sm">
        <thead>
          <tr className="bg-muted/50">
            {table.columns.map((column, index) => (
              <th
                key={index}
                scope="col"
                className="border-b px-3 py-2 text-start font-semibold"
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="align-top">
              {row.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  className={
                    cellIndex === 0
                      ? "border-b px-3 py-2 font-medium"
                      : "border-b px-3 py-2 text-muted-foreground"
                  }
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export async function LegalPage({ slug }: { slug: LegalSlug }) {
  const locale = await getLocale()
  const t = await getTranslations("Marketing.legal")
  const tDoc = await getTranslations(`Legal.${slug}`)
  const sections = legalStructure[slug]

  return (
    <>
      <section className="border-b bg-muted/30 py-16 sm:py-20">
        <Container>
          <div className="mx-auto max-w-3xl">
            <h1 className="font-heading text-4xl font-semibold tracking-tight text-balance">
              {tDoc("title")}
            </h1>
            <p className="mt-4 text-lg text-muted-foreground">
              {tDoc("description")}
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-4">
              <p className="text-sm text-muted-foreground">
                {t("lastUpdated", { date: tDoc("updated") })}
              </p>
              <Button
                variant="outline"
                size="sm"
                nativeButton={false}
                render={<a href={legalPdfPath(slug, locale)} download />}
              >
                <DownloadIcon />
                {t("downloadPdf")}
              </Button>
            </div>
          </div>
        </Container>
      </section>
      <Section className="py-16">
        <div className="mx-auto max-w-3xl">
          {sections.map((section) => (
            <div
              key={section.key}
              id={section.key}
              className="mb-10 scroll-mt-24"
            >
              <h2 className="font-heading text-xl font-semibold tracking-tight">
                {tDoc(`${section.key}h` as never)}
              </h2>
              {section.blocks.map((block) => (
                <LegalBlockView
                  key={block.key}
                  block={block}
                  translate={(key) => tDoc(key as never)}
                  raw={(key) => tDoc.raw(key as never)}
                />
              ))}
            </div>
          ))}
        </div>
      </Section>
    </>
  )
}
