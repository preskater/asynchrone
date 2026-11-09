import { prisma } from "@workspace/db-projects"

import {
  CLIENT_ACME,
  CLIENT_GLOBEX,
  ORG_ID,
  PROJECT_INTERNAL,
  PROJECT_MOBILE,
  PROJECT_WEBSITE,
  TEAM,
  admin,
  client,
  day,
  designer,
  member,
  owner,
} from "./demo"

const LABEL_BUG = "demo_label_bug"
const LABEL_DESIGN = "demo_label_design"
const LABEL_CONTENT = "demo_label_content"

const projects = [
  {
    id: PROJECT_WEBSITE,
    name: "Website Redesign",
    description: "New marketing site for Acme.",
    clientId: CLIENT_ACME,
    plannedHours: 160,
    prefix: "WR",
  },
  {
    id: PROJECT_MOBILE,
    name: "Mobile App",
    description: "Field-service companion app for Globex.",
    clientId: CLIENT_GLOBEX,
    plannedHours: 320,
    prefix: "MA",
  },
  {
    id: PROJECT_INTERNAL,
    name: "Internal Tools",
    description: "Tooling and process improvements.",
    clientId: null,
    plannedHours: null,
    prefix: "IT",
  },
]

type Row = [
  project: string,
  title: string,
  status: string,
  priority: string,
  assignee: string,
  dueIn: number,
]

const tasks: Row[] = [
  [PROJECT_WEBSITE, "Audit the current site", "done", "medium", admin.id, -14],
  [PROJECT_WEBSITE, "Design the homepage", "review", "high", designer.id, 2],
  [
    PROJECT_WEBSITE,
    "Write the homepage copy",
    "in_progress",
    "high",
    member.id,
    4,
  ],
  [PROJECT_WEBSITE, "Build the contact form", "todo", "medium", member.id, 9],
  [
    PROJECT_WEBSITE,
    "Fix the mobile navigation",
    "backlog",
    "urgent",
    designer.id,
    12,
  ],
  [
    PROJECT_MOBILE,
    "Define the offline sync model",
    "in_progress",
    "urgent",
    admin.id,
    3,
  ],
  [
    PROJECT_MOBILE,
    "Prototype the job list",
    "review",
    "medium",
    designer.id,
    5,
  ],
  [PROJECT_MOBILE, "Set up push notifications", "todo", "low", member.id, 15],
  [
    PROJECT_INTERNAL,
    "Automate the invoice export",
    "todo",
    "medium",
    owner.id,
    7,
  ],
  [PROJECT_INTERNAL, "Document the onboarding", "done", "low", admin.id, -3],
]

function taskRows() {
  const counters = new Map<string, number>()
  return tasks.map(
    ([projectId, title, status, priority, assigneeId, dueIn], order) => {
      const { prefix } = projects.find((project) => project.id === projectId)!
      const number = (counters.get(prefix) ?? 0) + 1
      counters.set(prefix, number)
      return {
        id: `demo_task_${prefix.toLowerCase()}_${number}`,
        organizationId: ORG_ID,
        projectId,
        identifier: `${prefix}-${number}`,
        title,
        status,
        priority,
        assigneeId,
        dueDate: day(dueIn),
        order,
        createIssue: false,
      }
    }
  )
}

export async function seedProjects(): Promise<void> {
  await prisma.project.createMany({
    data: projects.map(({ prefix: _prefix, ...project }) => ({
      ...project,
      organizationId: ORG_ID,
      startDate: day(-30),
    })),
    skipDuplicates: true,
  })
  await prisma.projectMember.createMany({
    data: projects.flatMap(({ id: projectId }) =>
      TEAM.map(({ id: userId }) => ({
        id: `${projectId}_${userId}`,
        projectId,
        userId,
      }))
    ),
    skipDuplicates: true,
  })
  await prisma.label.createMany({
    data: [
      { id: LABEL_BUG, organizationId: ORG_ID, name: "Bug", color: "#ef4444" },
      {
        id: LABEL_DESIGN,
        organizationId: ORG_ID,
        name: "Design",
        color: "#8b5cf6",
      },
      {
        id: LABEL_CONTENT,
        organizationId: ORG_ID,
        name: "Content",
        color: "#3b82f6",
      },
    ],
    skipDuplicates: true,
  })
  await prisma.projectLabel.createMany({
    data: [LABEL_BUG, LABEL_DESIGN, LABEL_CONTENT].map((labelId) => ({
      projectId: PROJECT_WEBSITE,
      labelId,
    })),
    skipDuplicates: true,
  })

  const rows = taskRows()
  // Upsert, not skip: re-running keeps due dates near today.
  for (const row of rows) {
    await prisma.task.upsert({
      where: { id: row.id },
      create: row,
      update: row,
    })
  }
  for (const { prefix } of projects) {
    const value = rows.filter((row) =>
      row.identifier.startsWith(`${prefix}-`)
    ).length
    await prisma.taskIdentifierCounter.upsert({
      where: { organizationId_prefix: { organizationId: ORG_ID, prefix } },
      create: { organizationId: ORG_ID, prefix, value },
      update: {},
    })
  }

  await prisma.taskLabel.createMany({
    data: [
      { taskId: "demo_task_wr_2", labelId: LABEL_DESIGN },
      { taskId: "demo_task_wr_3", labelId: LABEL_CONTENT },
      { taskId: "demo_task_wr_5", labelId: LABEL_BUG },
    ],
    skipDuplicates: true,
  })
  await prisma.taskTemplate.createMany({
    data: [
      {
        id: "demo_template_bug",
        organizationId: ORG_ID,
        projectId: PROJECT_WEBSITE,
        name: "Bug report",
        description: "Steps to reproduce, expected result, actual result.",
        priority: "high",
        labelIds: [LABEL_BUG],
      },
    ],
    skipDuplicates: true,
  })
  await prisma.subtask.createMany({
    data: [
      {
        id: "demo_subtask_1",
        taskId: "demo_task_wr_2",
        title: "Hero section",
        done: true,
        order: 0,
      },
      {
        id: "demo_subtask_2",
        taskId: "demo_task_wr_2",
        title: "Testimonials",
        done: true,
        order: 1,
      },
      {
        id: "demo_subtask_3",
        taskId: "demo_task_wr_2",
        title: "Responsive pass",
        order: 2,
      },
    ],
    skipDuplicates: true,
  })
  await prisma.taskComment.createMany({
    data: [
      {
        id: "demo_comment_1",
        taskId: "demo_task_wr_2",
        authorId: owner.id,
        body: "Looks great, can we try a warmer hero image?",
      },
      {
        id: "demo_comment_2",
        taskId: "demo_task_wr_2",
        authorId: client.id,
        authorKind: "client",
        authorName: client.name,
        body: "We prefer the second version.",
      },
    ],
    skipDuplicates: true,
  })
  await prisma.projectActivity.createMany({
    data: [
      {
        id: "demo_activity_1",
        projectId: PROJECT_WEBSITE,
        actorId: owner.id,
        action: "created",
        target: "Website Redesign",
      },
      {
        id: "demo_activity_2",
        projectId: PROJECT_WEBSITE,
        actorId: designer.id,
        action: "moved to review",
        target: "WR-2",
      },
    ],
    skipDuplicates: true,
  })
}
