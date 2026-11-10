"use server"

import { clerkClient } from "@clerk/nextjs/server"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { ADMIN_PERMISSIONS, requirePermission } from "@/lib/admin-auth"
import { writeAdminAuditLog } from "@/lib/audit"

const roleSchema = z.enum(["org:admin", "org:support", "org:finance", "org:viewer"])
const idSchema = z.string().min(1)
const emailSchema = z.string().email()

export async function inviteStaffMember(formData: FormData) {
  const context = await requirePermission(ADMIN_PERMISSIONS.staffManage)
  const parsedEmail = emailSchema.safeParse(formData.get("email"))
  const parsedRole = roleSchema.safeParse(formData.get("role"))
  if (!parsedEmail.success || !parsedRole.success) throw new Error("Dados de convite inválidos.")

  const client = await clerkClient()
  let invitationId: string
  try {
    const invitation = await client.organizations.createOrganizationInvitation({
      organizationId: context.orgId,
      emailAddress: parsedEmail.data,
      role: parsedRole.data,
      inviterUserId: context.userId,
    })
    invitationId = invitation.id
  } catch {
    throw new Error("Não foi possível enviar o convite.")
  }

  await writeAdminAuditLog({
    actorId: context.userId,
    action: "staff.invitation.created",
    metadata: { role: parsedRole.data, invitationId },
  })
  revalidatePath("/admin/staff")
}

export async function changeStaffRole(formData: FormData) {
  const context = await requirePermission(ADMIN_PERMISSIONS.staffManage)
  const userId = idSchema.parse(formData.get("userId"))
  const role = roleSchema.parse(formData.get("role"))
  if (userId === context.userId) throw new Error("Você não pode alterar sua própria função.")
  const client = await clerkClient()
  if (role !== "org:admin") {
    const memberships = await client.organizations.getOrganizationMembershipList({ organizationId: context.orgId })
    const admins = memberships.data.filter((membership) => membership.role === "org:admin")
    const target = memberships.data.find((membership) => membership.publicUserData?.userId === userId)
    if (target?.role === "org:admin" && admins.length <= 1) throw new Error("A organização precisa manter pelo menos um administrador.")
  }
  await client.organizations.updateOrganizationMembership({ organizationId: context.orgId, userId, role })
  await writeAdminAuditLog({ actorId: context.userId, targetUserId: userId, action: "staff.member.role_changed", metadata: { role } })
  revalidatePath("/admin/staff")
}

export async function removeStaffMember(formData: FormData) {
  const context = await requirePermission(ADMIN_PERMISSIONS.staffManage)
  const userId = idSchema.parse(formData.get("userId"))
  if (userId === context.userId) throw new Error("Você não pode remover seu próprio acesso.")
  const client = await clerkClient()
  const memberships = await client.organizations.getOrganizationMembershipList({ organizationId: context.orgId })
  const target = memberships.data.find((membership) => membership.publicUserData?.userId === userId)
  if (target?.role === "org:admin" && memberships.data.filter((membership) => membership.role === "org:admin").length <= 1) throw new Error("A organização precisa manter pelo menos um administrador.")
  await client.organizations.deleteOrganizationMembership({ organizationId: context.orgId, userId })
  await writeAdminAuditLog({ actorId: context.userId, targetUserId: userId, action: "staff.member.removed" })
  revalidatePath("/admin/staff")
}

export async function revokeStaffInvitation(formData: FormData) {
  const context = await requirePermission(ADMIN_PERMISSIONS.staffManage)
  const invitationId = idSchema.parse(formData.get("invitationId"))
  const client = await clerkClient()
  await client.organizations.revokeOrganizationInvitation({ organizationId: context.orgId, invitationId })
  await writeAdminAuditLog({
    actorId: context.userId,
    action: "staff.invitation.revoked",
    metadata: { invitationId },
  })
  revalidatePath("/admin/staff")
}

