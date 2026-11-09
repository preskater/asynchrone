import { prisma } from "@workspace/db-clients"

import {
  CLIENT_ACME,
  CLIENT_GLOBEX,
  CLIENT_INITECH,
  ORG_ID,
  admin,
  day,
  owner,
} from "./demo"

const PIPELINE = "demo_pipeline"
const stage = (name: string) => `demo_stage_${name.toLowerCase()}`

const stages = [
  { name: "Lead", type: "open" },
  { name: "Qualified", type: "open" },
  { name: "Proposal", type: "open" },
  { name: "Negotiation", type: "open" },
  { name: "Won", type: "won" },
  { name: "Lost", type: "lost" },
]

export async function seedClients(): Promise<void> {
  await prisma.client.createMany({
    data: [
      {
        id: CLIENT_ACME,
        name: "Acme Retail",
        status: "active",
        industry: "Retail",
        contactEmail: "hello@acme.example.com",
        website: "https://acme.example.com",
      },
      {
        id: CLIENT_GLOBEX,
        name: "Globex Services",
        status: "active",
        industry: "Field services",
        contactEmail: "contact@globex.example.com",
      },
      {
        id: CLIENT_INITECH,
        name: "Initech",
        status: "prospect",
        industry: "Software",
        contactEmail: "sales@initech.example.com",
      },
    ].map((row) => ({ ...row, organizationId: ORG_ID, ownerId: owner.id })),
    skipDuplicates: true,
  })
  await prisma.contact.createMany({
    data: [
      {
        id: "demo_contact_alex",
        firstName: "Alex",
        lastName: "Fontaine",
        email: "demo.client@example.com",
        jobTitle: "Marketing Director",
      },
      {
        id: "demo_contact_robin",
        firstName: "Robin",
        lastName: "Lambert",
        email: "demo.pending@example.com",
        jobTitle: "Operations Lead",
      },
      {
        id: "demo_contact_maxime",
        firstName: "Maxime",
        lastName: "Girard",
        email: "maxime@initech.example.com",
        jobTitle: "CTO",
      },
    ].map((row) => ({ ...row, organizationId: ORG_ID, ownerId: admin.id })),
    skipDuplicates: true,
  })
  await prisma.contactCompany.createMany({
    data: [
      {
        contactId: "demo_contact_alex",
        clientId: CLIENT_ACME,
        isPrimary: true,
      },
      {
        contactId: "demo_contact_robin",
        clientId: CLIENT_GLOBEX,
        isPrimary: true,
      },
      {
        contactId: "demo_contact_maxime",
        clientId: CLIENT_INITECH,
        isPrimary: true,
      },
    ],
    skipDuplicates: true,
  })

  await prisma.pipeline.createMany({
    data: [
      { id: PIPELINE, organizationId: ORG_ID, name: "Sales", isDefault: true },
    ],
    skipDuplicates: true,
  })
  await prisma.pipelineStage.createMany({
    data: stages.map(({ name, type }, position) => ({
      id: stage(name),
      pipelineId: PIPELINE,
      name,
      type,
      position,
    })),
    skipDuplicates: true,
  })

  const deals = [
    {
      id: "demo_deal_acme",
      name: "Acme website",
      clientId: CLIENT_ACME,
      stageId: stage("Won"),
      amount: 24000,
      probability: 100,
      status: "won",
      actualCloseDate: day(-45),
    },
    {
      id: "demo_deal_globex",
      name: "Globex mobile app",
      clientId: CLIENT_GLOBEX,
      stageId: stage("Negotiation"),
      amount: 58000,
      probability: 70,
      status: "open",
      expectedCloseDate: day(7),
    },
    {
      id: "demo_deal_initech",
      name: "Initech discovery",
      clientId: CLIENT_INITECH,
      stageId: stage("Qualified"),
      amount: 12000,
      probability: 30,
      status: "open",
      expectedCloseDate: day(30),
    },
  ]
  for (const deal of deals) {
    const data = {
      ...deal,
      organizationId: ORG_ID,
      pipelineId: PIPELINE,
      ownerId: owner.id,
    }
    await prisma.deal.upsert({
      where: { id: deal.id },
      create: data,
      update: data,
    })
  }
  await prisma.dealContact.createMany({
    data: [
      {
        dealId: "demo_deal_acme",
        contactId: "demo_contact_alex",
        isPrimary: true,
      },
      {
        dealId: "demo_deal_globex",
        contactId: "demo_contact_robin",
        isPrimary: true,
      },
      {
        dealId: "demo_deal_initech",
        contactId: "demo_contact_maxime",
        isPrimary: true,
      },
    ],
    skipDuplicates: true,
  })
  await prisma.clientActivity.createMany({
    data: [
      {
        id: "demo_client_activity_1",
        organizationId: ORG_ID,
        type: "note",
        subject: "Kickoff",
        body: "Scope and timeline agreed.",
        authorId: owner.id,
        clientId: CLIENT_ACME,
      },
      {
        id: "demo_client_activity_2",
        organizationId: ORG_ID,
        type: "call",
        subject: "Pricing call",
        body: "Globex asked for a phased delivery.",
        authorId: admin.id,
        clientId: CLIENT_GLOBEX,
        dealId: "demo_deal_globex",
      },
    ],
    skipDuplicates: true,
  })
}
