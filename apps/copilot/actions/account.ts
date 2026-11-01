"use server"

import { headers } from "next/headers"

import { deleteAccount } from "@/lib/account/deletion-service"
import { auth } from "@/lib/auth"
import { withAction } from "@workspace/core/action"
import {
  ForbiddenError,
  UnauthorizedError,
  ValidationError,
} from "@workspace/core/errors"
import { prisma } from "@/lib/prisma"

export const deleteAccountAction = withAction(
  async (input: { email: string; password?: string }) => {
    const requestHeaders = await headers()
    const session = await auth.api.getSession({ headers: requestHeaders })
    if (!session) throw new UnauthorizedError()
    // An operator acting as the customer must never erase their account.
    if (session.session.impersonatedBy) {
      throw new ForbiddenError("Not available while impersonating.", {
        code: "account_impersonated",
      })
    }

    const hasPassword = await prisma.account.count({
      where: { userId: session.user.id, providerId: "credential" },
    })
    if (hasPassword) {
      const valid = await auth.api
        .verifyPassword({
          body: { password: input.password ?? "" },
          headers: requestHeaders,
        })
        .then(() => true)
        .catch(() => false)
      if (!valid) {
        throw new ValidationError("The password is incorrect.", undefined, {
          code: "account_password_invalid",
        })
      }
    }

    await deleteAccount(session.user.id, input.email)
  }
)
