import { pool, prisma } from "@workspace/db-files"

import { storeText } from "./bytes"
import { ORG_ID, admin, day, member, owner } from "./demo"

const FOLDER_CLIENTS = "demo_folder_clients"
const FOLDER_BRAND = "demo_folder_brand"
const FILE_BRIEF = "demo_file_brief"

const files = [
  {
    id: FILE_BRIEF,
    name: "Acme brief.txt",
    parentId: FOLDER_CLIENTS,
    text: "Acme website brief\n\nGoals, audience and timeline.\n",
    starred: true,
    shared: true,
  },
  {
    id: "demo_file_notes",
    name: "Kickoff notes.txt",
    parentId: FOLDER_CLIENTS,
    text: "Kickoff notes\n\nScope agreed, next review in two weeks.\n",
  },
  {
    id: "demo_file_brand",
    name: "Brand guidelines.txt",
    parentId: FOLDER_BRAND,
    text: "Brand guidelines\n\nTone of voice, colours and typography.\n",
  },
]

export async function seedFiles(): Promise<void> {
  await prisma.fileNode.createMany({
    data: [
      { id: FOLDER_CLIENTS, name: "Clients", kind: "folder" },
      { id: FOLDER_BRAND, name: "Brand", kind: "folder" },
    ].map((row) => ({ ...row, organizationId: ORG_ID, ownerId: owner.id })),
    skipDuplicates: true,
  })

  for (const { text, ...file } of files) {
    // An existing row already owns its large object: writing again would leak one.
    if (
      await prisma.fileNode.findUnique({
        where: { id: file.id },
        select: { id: true },
      })
    )
      continue
    const bytes = await storeText(pool, text)
    const stored = { ...bytes, mimeType: "text/plain" }
    await prisma.fileNode.create({
      data: {
        ...file,
        ...stored,
        kind: "document",
        organizationId: ORG_ID,
        ownerId: owner.id,
      },
    })
    await prisma.fileVersion.create({
      data: {
        id: `${file.id}_v1`,
        fileId: file.id,
        userId: owner.id,
        at: day(-10),
        note: "First version",
        ...(await storeText(pool, text)),
        mimeType: "text/plain",
      },
    })
  }

  await prisma.fileShare.createMany({
    data: [
      {
        id: "demo_share_1",
        fileId: FILE_BRIEF,
        userId: member.id,
        permission: "edit",
      },
      { id: "demo_share_2", fileId: FILE_BRIEF, userId: admin.id },
    ],
    skipDuplicates: true,
  })
  await prisma.fileActivity.createMany({
    data: [
      {
        id: "demo_file_activity_1",
        fileId: FILE_BRIEF,
        userId: owner.id,
        action: "uploaded",
      },
      {
        id: "demo_file_activity_2",
        fileId: FILE_BRIEF,
        userId: member.id,
        action: "edited",
      },
    ],
    skipDuplicates: true,
  })
}
