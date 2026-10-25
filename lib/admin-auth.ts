import "server-only"

import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"

export const ADMIN_PERMISSIONS = {
  usersRead: "org:users:read",
  usersManage: "org:users:manage",
  projectsRead: "org:projects:read",
  projectsManage: "org:projects:manage",
  auditRead: "org:audit:read",
  plansManage: "org:plans:manage",
  staffManage: "org:staff:manage",
  billingRead: "org:billing:read",
  usageRead: "org:usage:read",
} as const

export const STAFF_ROLES = ["org:admin", "org:support", "org:finance", "org:viewer"] as const
export type StaffRole = (typeof STAFF_ROLES)[number]

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
    ADMIN_PERMISSIONS.auditRead,
  ],
  "org:finance": [
    ADMIN_PERMISSIONS.usersRead,
    ADMIN_PERMISSIONS.plansManage,
    ADMIN_PERMISSIONS.billingRead,
    ADMIN_PERMISSIONS.usageRead,
  ],
  "org:viewer": [ADMIN_PERMISSIONS.usersRead, ADMIN_PERMISSIONS.projectsRead],
}

function isStaffRole(role: string | null | undefined): role is StaffRole {
  return role !== null && role !== undefined && STAFF_ROLES.includes(role as StaffRole)
}

function toStaffContext(userId: string, orgId: string | null | undefined, orgRole: string | null | undefined): StaffContext | null {
  const configuredOrgId = process.env.CLERK_STAFF_ORG_ID
  if (!configuredOrgId || !orgId || orgId !== configuredOrgId || !isStaffRole(orgRole)) return null
  return { userId, orgId, orgRole, permissions: [...ROLE_PERMISSIONS[orgRole]] }
}

export async function getStaffContext(): Promise<StaffContext | null> {
  const { userId, orgId, orgRole } = await auth()
  if (!userId) return null
  return toStaffContext(userId, orgId, orgRole)
}

export async function requireStaff(): Promise<StaffContext> {
  const { userId, orgId, orgRole } = await auth()
  if (!userId) redirect("/sign-in")
  const context = toStaffContext(userId, orgId, orgRole)
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

export async function requirePermission(permission: string): Promise<StaffContext> {
  const context = await requireStaff()
  if (!isStaffAdmin(context) && !context.permissions.includes(permission)) throw new ForbiddenError()
  return context
}
