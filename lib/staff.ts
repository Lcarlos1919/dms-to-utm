import "server-only"

import { auth, clerkClient } from "@clerk/nextjs/server"

export const STAFF_ROLES = ["org:admin", "org:support", "org:finance", "org:viewer"] as const

export type StaffRole = (typeof STAFF_ROLES)[number]

export type StaffAccess = {
  isStaff: boolean
  role: string | null
}

export function isStaffRole(role: string | null | undefined): role is StaffRole {
  return role !== null && role !== undefined && STAFF_ROLES.includes(role as StaffRole)
}

export async function getStaffAccess(): Promise<StaffAccess> {
  const { userId } = await auth()
  const staffOrgId = process.env.CLERK_STAFF_ORG_ID

  if (!userId || !staffOrgId) return { isStaff: false, role: null }

  const client = await clerkClient()
  const memberships = await client.users.getOrganizationMembershipList({ userId, limit: 100 })
  const membership = memberships.data.find((item) => item.organization.id === staffOrgId)
  const role = membership?.role ?? null

  return { isStaff: isStaffRole(role), role }
}
