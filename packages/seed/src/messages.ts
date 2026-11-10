import { pool, prisma } from "@workspace/db-messages"

import { storeText } from "./bytes"
import { ORG_ID, TEAM, admin, day, designer, member, owner } from "./demo"

const TEAM_ID = "demo_chat_team"
const GENERAL = "demo_channel_general"
const WEBSITE = "demo_channel_website"
const DM = "demo_dm_owner_member"
const ATTACHED = "demo_message_3"

export async function seedMessages(): Promise<void> {
  await prisma.chatTeam.createMany({
    data: [
      {
        id: TEAM_ID,
        organizationId: ORG_ID,
        name: "Studio",
        description: "Everyone at Demo Studio",
      },
    ],
    skipDuplicates: true,
  })
  await prisma.conversation.createMany({
    data: [
      {
        id: GENERAL,
        kind: "channel",
        name: "general",
        teamId: TEAM_ID,
        topic: "Company news",
        lastMessageAt: day(-1, 16),
      },
      {
        id: WEBSITE,
        kind: "channel",
        name: "website-redesign",
        teamId: TEAM_ID,
        topic: "Acme website",
        lastMessageAt: day(0, 8),
      },
      { id: DM, kind: "dm", name: "Lina Petit", lastMessageAt: day(-1, 11) },
    ].map((row) => ({ ...row, organizationId: ORG_ID })),
    skipDuplicates: true,
  })
  await prisma.conversationMember.createMany({
    data: [
      ...[GENERAL, WEBSITE].flatMap((conversationId) =>
        TEAM.map(({ id: userId }) => ({
          id: `${conversationId}_${userId}`,
          conversationId,
          userId,
        }))
      ),
      { id: `${DM}_owner`, conversationId: DM, userId: owner.id },
      { id: `${DM}_member`, conversationId: DM, userId: member.id },
    ],
    skipDuplicates: true,
  })
  await prisma.message.createMany({
    data: [
      {
        id: "demo_message_1",
        conversationId: GENERAL,
        authorId: owner.id,
        body: "Welcome to the new workspace!",
        createdAt: day(-2, 9),
      },
      {
        id: "demo_message_2",
        conversationId: GENERAL,
        authorId: admin.id,
        body: "Timesheets are due on Friday.",
        createdAt: day(-1, 16),
      },
      {
        id: ATTACHED,
        conversationId: WEBSITE,
        authorId: designer.id,
        body: "Homepage notes attached.",
        createdAt: day(-1, 10),
      },
      {
        id: "demo_message_4",
        conversationId: WEBSITE,
        authorId: owner.id,
        body: "Thanks, reviewing today.",
        createdAt: day(-1, 11),
        parentId: ATTACHED,
      },
      {
        id: "demo_message_5",
        conversationId: DM,
        authorId: owner.id,
        body: "Can you take the contact form?",
        createdAt: day(-1, 11),
      },
    ],
    skipDuplicates: true,
  })
  await prisma.messageReaction.createMany({
    data: [
      {
        id: "demo_reaction_1",
        messageId: "demo_message_1",
        emoji: "🎉",
        userId: member.id,
      },
    ],
    skipDuplicates: true,
  })

  const id = "demo_attachment_1"
  // An existing row already owns its large object: writing again would leak one.
  if (
    await prisma.messageAttachment.findUnique({
      where: { id },
      select: { id: true },
    })
  )
    return
  const bytes = await storeText(
    pool,
    "Homepage notes\n\nHero, testimonials, call to action.\n"
  )
  await prisma.messageAttachment.create({
    data: {
      id,
      messageId: ATTACHED,
      name: "homepage-notes.txt",
      mimeType: "text/plain",
      ...bytes,
    },
  })
}
