import "server-only"

import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import { getStaffAccess, isStaffRole } from "@/lib/staff"
import type { StaffRole } from "@/lib/staff"

export { STAFF_ROLES } from "@/lib/staff"
export type { StaffRole } from "@/lib/staff"

export const ADMIN_PERMISSIONS = {
  usersRead: "org:users:read",
  usersManage: "org:users:manage",
  projectsRead: "org:projects:read",
  projectsManage: "org:projects:manage",
  auditRead: "org:audit:read",
  plansRead: "org:plans:read",
  plansManage: "org:plans:manage",
  staffManage: "org:staff:manage",
  billingRead: "org:billing:read",
  usageRead: "org:usage:read",
} as const

export type StaffContext = {
  userId: string
  orgId: string
  orgRole: StaffRole
  permissions: string[]
}

const ROLE_PERMISSIONS: Record<StaffRole, readonly string[]> = {
  "org:admin": Object.values(ADMIN_PERMISSIONS),
  "org:support": [
    ADMIN_PERMISSIONS.usersRead,
    ADMIN_PERMISSIONS.usersManage,
    ADMIN_PERMISSIONS.projectsRead,
    ADMIN_PERMISSIONS.projectsManage,
  ],
  "org:finance": [ADMIN_PERMISSIONS.billingRead, ADMIN_PERMISSIONS.usageRead],
  "org:viewer": [
    ADMIN_PERMISSIONS.usersRead,
    ADMIN_PERMISSIONS.projectsRead,
    ADMIN_PERMISSIONS.auditRead,
    ADMIN_PERMISSIONS.plansRead,
    ADMIN_PERMISSIONS.billingRead,
    ADMIN_PERMISSIONS.usageRead,
  ],
}

export function getStaffPermissions(role: StaffRole): string[] {
  return [...ROLE_PERMISSIONS[role]]
}

async function getStaffContextForUser(userId: string): Promise<StaffContext | null> {
  const access = await getStaffAccess()
  const orgId = process.env.CLERK_STAFF_ORG_ID

  if (!access.isStaff || !isStaffRole(access.role) || !orgId) return null

  return {
    userId,
    orgId,
    orgRole: access.role,
    permissions: getStaffPermissions(access.role),
  }
}

export async function getStaffContext(): Promise<StaffContext | null> {
  const { userId } = await auth()
  if (!userId) return null
  return getStaffContextForUser(userId)
}

export async function requireStaff(): Promise<StaffContext> {
  const { userId } = await auth()
  if (!userId) redirect("/sign-in")

  const context = await getStaffContextForUser(userId)
  if (!context) redirect("/dashboard")
  return context
}

export function isStaffAdmin(context: StaffContext) {
  return context.orgRole === "org:admin"
}

export class ForbiddenError extends Error {
  constructor() {
    super("Permissão insuficiente")
    this.name = "ForbiddenError"
  }
}

export type StaffApiAuthorization =
  | { ok: true; context: StaffContext }
  | { ok: false; response: Response }

export async function requireStaffApiPermission(permission: string): Promise<StaffApiAuthorization> {
  const { userId } = await auth()
  if (!userId) {
    return { ok: false, response: Response.json({ error: "Não autenticado" }, { status: 401 }) }
  }

  const context = await getStaffContextForUser(userId)
  if (!context || !context.permissions.includes(permission)) {
    return { ok: false, response: Response.json({ error: "Permissão insuficiente" }, { status: 403 }) }
  }

  return { ok: true, context }
}

export async function requirePermission(permission: string): Promise<StaffContext> {
  const context = await requireStaff()
  if (!context.permissions.includes(permission)) throw new ForbiddenError()
  return context
}
