import { assertSeedAllowed, demoPassword } from "./guard"

// Before any import below: importing a database package opens its pool.
assertSeedAllowed(process.env)
const password = demoPassword(process.env)

const { seedIdentity, seedPortalAndAssistant } = await import("./identity")
await seedIdentity(password)

if (!process.argv.includes("--empty")) {
  const { seedClients } = await import("./clients")
  const { seedProjects } = await import("./projects")
  const { seedCalendars } = await import("./calendars")
  const { seedFiles } = await import("./files")
  const { seedMessages } = await import("./messages")
  const { seedEmployees } = await import("./employees")
  await seedClients()
  await seedProjects()
  await seedCalendars()
  await seedFiles()
  await seedMessages()
  await seedEmployees()
  await seedPortalAndAssistant()
}

console.log(`Seeded. Sign in with demo@example.com (organization: demo).`)
// The database pools would keep the process alive.
process.exit(0)
