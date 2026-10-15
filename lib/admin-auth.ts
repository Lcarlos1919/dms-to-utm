import "server-only"

import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"

export const ADMIN_PERMISSIONS = {
  usersRead: "org:users:read",
  usersManage: "org:users:manage",
  plansManage: "org:plans:manage",
  staffManage: "org:staff:manage",
  billingRead: "org:billing:read",
} as const

export type StaffContext = {
  userId: string
  orgId: string
  orgRole: string
  permissions: string[]
}

export class ForbiddenError extends Error {
  status = 403 as const
  constructor() {
    super("Forbidden")
    this.name = "ForbiddenError"
  }
}

export async function requireStaff(): Promise<StaffContext> {
  const { userId, orgId, orgRole, has } = await auth()
  if (!userId) redirect("/admin/login")
  if (!orgId || orgId !== process.env.CLERK_STAFF_ORG_ID) redirect("/dashboard")

  const permissions = Object.values(ADMIN_PERMISSIONS).filter((permission) => has({ permission }))
  return { userId, orgId, orgRole: orgRole ?? "org:member", permissions }
}

export async function requirePermission(permission: string): Promise<StaffContext> {
  const context = await requireStaff()
  if (context.orgRole !== "org:admin" && !context.permissions.includes(permission)) {
    throw new ForbiddenError()
  }
  return context
}

export async function getStaffContext(): Promise<StaffContext | null> {
  const { userId, orgId, orgRole, has } = await auth()
  if (!userId || !orgId || orgId !== process.env.CLERK_STAFF_ORG_ID) return null
  const permissions = Object.values(ADMIN_PERMISSIONS).filter((permission) => has({ permission }))
  return { userId, orgId, orgRole: orgRole ?? "org:member", permissions }
}

export function isStaffAdmin(context: StaffContext) {
  return context.orgRole === "org:admin"
}
