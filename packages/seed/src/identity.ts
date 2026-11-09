import { prisma } from "@workspace/db-identity"
import { hashPassword } from "better-auth/crypto"

import {
  CLIENT_ACME,
  CLIENT_GLOBEX,
  ORG_ID,
  ORG_SLUG,
  USERS,
  client,
  day,
  owner,
} from "./demo"

const users = Object.values(USERS)

/** Organization and accounts; `--empty` stops here. */
export async function seedIdentity(password: string): Promise<void> {
  await prisma.organization.createMany({
    data: [
      {
        id: ORG_ID,
        name: "Demo Studio",
        slug: ORG_SLUG,
        createdAt: day(-90),
        metadata: JSON.stringify({ plan: "enterprise" }),
      },
    ],
    skipDuplicates: true,
  })
  await prisma.user.createMany({
    data: users.map(({ id, name, email }) => ({
      id,
      name,
      email,
      emailVerified: true,
    })),
    skipDuplicates: true,
  })

  const hash = await hashPassword(password)
  for (const user of users) {
    const id = `${user.id}_credential`
    const data = {
      id,
      accountId: user.id,
      providerId: "credential",
      userId: user.id,
      password: hash,
    }
    await prisma.account.upsert({ where: { id }, create: data, update: data })
  }

  await prisma.member.createMany({
    data: users.map((user) => ({
      id: `${user.id}_member`,
      organizationId: ORG_ID,
      userId: user.id,
      role: user.role,
      clientId: user === client ? CLIENT_ACME : null,
      createdAt: day(-90),
    })),
    skipDuplicates: true,
  })
}

export async function seedPortalAndAssistant(): Promise<void> {
  await prisma.portalInvite.createMany({
    data: [
      {
        id: "demo_invite_accepted",
        organizationId: ORG_ID,
        clientId: CLIENT_ACME,
        email: client.email,
        name: client.name,
        invitedById: owner.id,
        acceptedAt: day(-30),
      },
      {
        id: "demo_invite_pending",
        organizationId: ORG_ID,
        clientId: CLIENT_GLOBEX,
        email: "demo.pending@example.com",
        name: "Robin Lambert",
        invitedById: owner.id,
      },
    ],
    skipDuplicates: true,
  })

  const conversations = [
    {
      id: "demo_assistant_status",
      title: "Website redesign status",
      question: "What is blocking the website redesign?",
      answer:
        "Two tasks are in review and the homepage copy is waiting for Acme's approval.",
    },
    {
      id: "demo_assistant_deals",
      title: "Open deals this month",
      question: "Which deals should I follow up on?",
      answer:
        "Globex is in negotiation and its expected close date is next week.",
    },
  ]
  await prisma.assistantConversation.createMany({
    data: conversations.map(({ id, title }) => ({
      id,
      organizationId: ORG_ID,
      userId: owner.id,
      title,
    })),
    skipDuplicates: true,
  })
  await prisma.assistantMessage.createMany({
    data: conversations.flatMap(({ id, question, answer }) => [
      {
        id: `${id}_user`,
        conversationId: id,
        role: "user",
        parts: [{ type: "text", text: question }],
      },
      {
        id: `${id}_assistant`,
        conversationId: id,
        role: "assistant",
        parts: [{ type: "text", text: answer }],
      },
    ]),
    skipDuplicates: true,
  })
}
