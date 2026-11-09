/**
 * CSV building shared by module exports. The output targets French-locale
 * spreadsheet software: semicolon separator, comma decimal separator and a
 * UTF-8 BOM so Excel picks up the encoding.
 */
const SEPARATOR = ";"

export function formatCsvNumber(value: number): string {
  return String(Math.round(value * 100) / 100).replace(".", ",")
}

function escapeCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ""
  const text =
    typeof value === "number" ? formatCsvNumber(value) : String(value)
  if (/[";\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const body = rows
    .map((row) => row.map((cell) => escapeCell(cell)).join(SEPARATOR))
    .join("\r\n")
  return `\uFEFF${body}\r\n`
}

export interface CsvFile {
  filename: string
  content: string
}

function detectDelimiter(text: string): string {
  const counts: Record<string, number> = { ",": 0, ";": 0, "\t": 0 }
  let quoted = false
  for (const char of text) {
    if (char === '"') quoted = !quoted
    else if (!quoted && (char === "\n" || char === "\r")) break
    else if (!quoted && char in counts) counts[char]! += 1
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]![0]
}

/**
 * Reads the CSV of `toCsv` and of other tools: comma, semicolon or tab
 * separated, with an optional BOM and quoted cells that may span several lines.
 * Rows with only empty cells are dropped.
 */
export function parseCsv(raw: string): string[][] {
  const text = raw.replace(/^﻿/, "")
  const delimiter = detectDelimiter(text)
  const rows: string[][] = []
  let row: string[] = []
  let cell = ""
  let quoted = false

  const endCell = () => {
    row.push(cell.trim())
    cell = ""
  }
  const endRow = () => {
    endCell()
    rows.push(row)
    row = []
  }

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (quoted) {
      if (char !== '"') cell += char
      else if (text[index + 1] === '"') {
        cell += '"'
        index += 1
      } else quoted = false
    } else if (char === '"' && cell === "") {
      quoted = true
    } else if (char === delimiter) {
      endCell()
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index += 1
      endRow()
    } else {
      cell += char
    }
  }
  endRow()

  return rows.filter((cells) => cells.some(Boolean))
}
