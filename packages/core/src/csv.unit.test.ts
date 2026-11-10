import { describe, expect, it } from "vitest"

import { parseCsv, toCsv } from "./csv"

describe("parseCsv", () => {
  it.each([
    ["comma", "a,b\n1,2"],
    ["semicolon", "a;b\n1;2"],
    ["tab", "a\tb\n1\t2"],
    ["CRLF", "a,b\r\n1,2\r\n"],
    ["BOM", "﻿a,b\n1,2"],
  ])("reads %s input", (_name, raw) => {
    expect(parseCsv(raw)).toEqual([
      ["a", "b"],
      ["1", "2"],
    ])
  })

  it("keeps quotes, separators and line breaks inside quoted cells", () => {
    expect(parseCsv('a,b\n"x, ""y""","line 1\nline 2"\n')).toEqual([
      ["a", "b"],
      ['x, "y"', "line 1\nline 2"],
    ])
  })

  it("ignores separators inside a quoted header when detecting", () => {
    expect(parseCsv('"a;b;c",d\n1,2')).toEqual([
      ["a;b;c", "d"],
      ["1", "2"],
    ])
  })

  it("keeps empty cells and drops empty rows", () => {
    expect(parseCsv("a,b\n,2\n,\n\n")).toEqual([
      ["a", "b"],
      ["", "2"],
    ])
  })

  it("is empty for blank input", () => {
    expect(parseCsv("")).toEqual([])
    expect(parseCsv("\n\n")).toEqual([])
  })

  it("reads back what toCsv writes", () => {
    const rows = [
      ["Title", "Notes"],
      ['Say "hi"', "a;b\nc"],
    ]
    expect(parseCsv(toCsv(rows))).toEqual(rows)
  })
})
