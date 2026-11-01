import { NotificationService } from "@workspace/notifications"
import { prisma } from "@/lib/prisma"

import { NotificationRepository } from "./repository"

export const notificationRepository = new NotificationRepository(prisma)
export const notificationService = new NotificationService(
  notificationRepository
)

export { NotificationRepository, NotificationService }
export * from "@workspace/notifications"
