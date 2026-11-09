import { describe, expect, it } from "vitest"

import {
  detectMapping,
  parseImportDate,
  parseImportTable,
  resolveImportRow,
  taskFingerprint,
  toImportRows,
} from "./task-import"

const lookups = {
  memberIdByEmail: new Map([["ada@example.com", "user_ada"]]),
  labelIdByName: new Map([
    ["bug", "label_bug"],
    ["ux", "label_ux"],
  ]),
}

describe("parseImportTable", () => {
  it("reads CSV with a multi-line description", () => {
    expect(parseImportTable('Summary,Description\nA,"one\ntwo"\n')).toEqual({
      headers: ["Summary", "Description"],
      rows: [["A", "one\ntwo"]],
    })
  })

  it("reads a JSON array of objects, whatever their keys", () => {
    expect(
      parseImportTable(
        '[{"title":"A","labels":["bug","ux"]},{"title":"B","points":3,"x":null}]'
      )
    ).toEqual({
      headers: ["title", "labels", "points", "x"],
      rows: [
        ["A", "bug, ux", "", ""],
        ["B", "", "3", ""],
      ],
    })
  })

  it.each(["[1, 2]", "[broken", "only,a,header", ""])("refuses %j", (raw) => {
    expect(parseImportTable(raw)).toBeNull()
  })
})

describe("detectMapping", () => {
  it("recognises a Jira export", () => {
    expect(
      detectMapping([
        "Issue key",
        "Summary",
        "Description",
        "Status",
        "Priority",
        "Assignee",
        "Labels",
        "Due date",
      ])
    ).toEqual({
      title: "Summary",
      description: "Description",
      status: "Status",
      priority: "Priority",
      assignee: "Assignee",
      labels: "Labels",
      dueDate: "Due date",
    })
  })

  it("prefers the more precise column and leaves the rest unmapped", () => {
    const mapping = detectMapping(["TITLE", "Assignee", "Assignee Email"])
    expect(mapping.title).toBe("TITLE")
    expect(mapping.assignee).toBe("Assignee Email")
    expect(mapping.status).toBeNull()
  })
})

describe("toImportRows", () => {
  it("merges repeated columns and numbers the rows", () => {
    const table = {
      headers: ["Summary", "Labels", "Labels"],
      rows: [
        ["A", "bug", "ux"],
        ["", "", ""],
      ],
    }
    expect(toImportRows(table, detectMapping(table.headers))).toEqual([
      { row: 1, title: "A", labels: "bug, ux" },
      { row: 2, title: "" },
    ])
  })
})

describe("parseImportDate", () => {
  it.each([
    ["2026-03-04", "2026-03-04"],
    ["2026-03-04T10:00:00Z", "2026-03-04"],
    ["4 Mar 2026 12:00 UTC", "2026-03-04"],
  ])("reads %s", (value, expected) => {
    expect(parseImportDate(value)?.toISOString().slice(0, 10)).toBe(expected)
  })

  it.each(["01/02/2026", "1.2.26", "01-02-2026", "soon"])(
    "refuses the ambiguous or invalid %s",
    (value) => {
      expect(parseImportDate(value)).toBeNull()
    }
  )
})

describe("resolveImportRow", () => {
  it("resolves every value, ignoring case", () => {
    expect(
      resolveImportRow(
        {
          row: 1,
          title: " Ship it ",
          status: "In Progress",
          priority: "Highest",
          assignee: "ADA@example.com",
          labels: "Bug; ux, bug",
          dueDate: "2026-03-04",
        },
        lookups
      )
    ).toMatchObject({
      error: null,
      warnings: [],
      task: {
        title: "Ship it",
        status: "in_progress",
        priority: "urgent",
        assigneeId: "user_ada",
        labelIds: ["label_bug", "label_ux"],
      },
    })
  })

  it.each([
    ["  ", "missing_title"],
    ["x".repeat(241), "title_too_long"],
  ])("leaves out a bad title", (title, code) => {
    expect(resolveImportRow({ row: 3, title }, lookups)).toMatchObject({
      task: null,
      error: { row: 3, code },
    })
  })

  it("imports the row and reports every unknown value", () => {
    const { task, warnings } = resolveImportRow(
      {
        row: 2,
        title: "A",
        status: "Blocked",
        priority: "P0",
        assignee: "Grace Hopper",
        labels: "bug, nope",
        dueDate: "01/02/2026",
        description: "x".repeat(5001),
      },
      lookups
    )
    expect(task).toMatchObject({
      status: undefined,
      priority: undefined,
      assigneeId: null,
      labelIds: ["label_bug"],
      dueDate: null,
    })
    expect(task?.description).toHaveLength(5000)
    expect(warnings.map(({ code, value }) => [code, value])).toEqual([
      ["unknown_status", "Blocked"],
      ["unknown_priority", "P0"],
      ["unknown_assignee", "Grace Hopper"],
      ["unknown_label", "nope"],
      ["invalid_date", "01/02/2026"],
      ["description_truncated", undefined],
    ])
  })
})

describe("taskFingerprint", () => {
  it("ignores case, spacing and the time of day", () => {
    expect(taskFingerprint(" Ship IT", new Date("2026-03-04T10:00:00Z"))).toBe(
      taskFingerprint("ship it", new Date("2026-03-04T18:00:00Z"))
    )
    expect(taskFingerprint("a", null)).not.toBe(
      taskFingerprint("a", new Date("2026-03-04"))
    )
  })
})
