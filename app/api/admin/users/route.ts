import { clerkClient } from "@clerk/nextjs/server"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { ADMIN_PERMISSIONS, requireStaffApiPermissions, requireStaffApiPermission } from "@/lib/admin-auth"
import { jsonError } from "@/lib/admin"
import { writeAdminAuditLog } from "@/lib/audit"
import { ensureProfile } from "@/lib/profiles"
import { currentMonth } from "@/lib/usage"
import { createAdminClient } from "@/lib/supabase/server"

export async function GET() {
  const authorization = await requireStaffApiPermission(ADMIN_PERMISSIONS.usersRead)
  if (!authorization.ok) return authorization.response

  const { data, error } = await createAdminClient()
    .from("profiles")
    .select("user_id,email,full_name,plan,role,bonus_credits,can_create_memorials,can_delete_memorials,created_at")
    .order("created_at", { ascending: false })

  if (error) return jsonError("Não foi possível carregar usuários", 500)
  return Response.json({ ok: true, data })
}

const patchSchema = z.object({
  userId: z.string().min(1),
  plan: z.enum(["free", "pro"]).optional(),
  role: z.enum(["user", "admin"]).optional(),
  canCreateMemorials: z.boolean().optional(),
  canDeleteMemorials: z.boolean().optional(),
}).refine(
  (value) => value.plan !== undefined || value.role !== undefined || value.canCreateMemorials !== undefined || value.canDeleteMemorials !== undefined,
  "Informe ao menos uma alteração",
)

export async function PATCH(request: Request) {
  const parsed = patchSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return jsonError("Dados inválidos")

  const requiredPermissions = [
    ...(parsed.data.plan === undefined ? [] : [ADMIN_PERMISSIONS.plansManage]),
    ...(parsed.data.role === undefined && parsed.data.canCreateMemorials === undefined && parsed.data.canDeleteMemorials === undefined
      ? []
      : [ADMIN_PERMISSIONS.usersManage]),
  ]
  const authorization = await requireStaffApiPermissions(requiredPermissions)
  if (!authorization.ok) return authorization.response
  const access = authorization.context

  if (parsed.data.role !== undefined && access.orgRole !== "org:admin") {
    return jsonError("Somente administradores podem alterar o perfil global", 403)
  }
  if (parsed.data.userId === access.userId && parsed.data.role === "user") {
    return jsonError("Você não pode alterar seu próprio perfil para usuário", 403)
  }

  const { userId, canCreateMemorials, canDeleteMemorials, ...changes } = parsed.data
  const profileChanges = {
    ...changes,
    ...(canCreateMemorials === undefined ? {} : { can_create_memorials: canCreateMemorials }),
    ...(canDeleteMemorials === undefined ? {} : { can_delete_memorials: canDeleteMemorials }),
  }

  try {
    await ensureProfile(userId)
  } catch {
    return jsonError("Não foi possível localizar o usuário no Clerk", 404)
  }

  const { data, error } = await createAdminClient()
    .from("profiles")
    .upsert({ user_id: userId, ...profileChanges }, { onConflict: "user_id" })
    .select("user_id,email,plan,role,bonus_credits,can_create_memorials,can_delete_memorials")
    .maybeSingle()

  if (error) return jsonError("Não foi possível atualizar usuário", 500)
  if (!data) return jsonError("Não foi possível salvar o perfil do usuário", 500)

  await writeAdminAuditLog({
    actorId: access.userId,
    targetUserId: userId,
    action: "user.profile_updated",
    metadata: { fields: Object.keys(profileChanges), changes: profileChanges },
  })
  revalidatePath("/admin/usuarios")
  revalidatePath(`/admin/usuarios/${userId}`)

  return Response.json({ ok: true, data })
}

const userActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("reset_usage"), userId: z.string().min(1) }),
  z.object({ action: z.literal("suspend"), userId: z.string().min(1) }),
  z.object({ action: z.literal("reactivate"), userId: z.string().min(1) }),
])

export async function POST(request: Request) {
  const parsed = userActionSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return jsonError("Ação administrativa inválida")

  const permission = parsed.data.action === "reset_usage"
    ? ADMIN_PERMISSIONS.usageManage
    : ADMIN_PERMISSIONS.usersManage
  const authorization = await requireStaffApiPermission(permission)
  if (!authorization.ok) return authorization.response
  const access = authorization.context
  const { userId, action } = parsed.data

  if (action === "suspend" || action === "reactivate") {
    if (action === "suspend" && userId === access.userId) {
      return jsonError("Você não pode suspender a própria conta", 403)
    }

    try {
      const clerk = await clerkClient()
      const user = await clerk.users.getUser(userId)
      const shouldBeBanned = action === "suspend"
      if (user.banned !== shouldBeBanned) {
        if (shouldBeBanned) await clerk.users.banUser(userId)
        else await clerk.users.unbanUser(userId)

        await writeAdminAuditLog({
          actorId: access.userId,
          targetUserId: userId,
          action: shouldBeBanned ? "user.suspended" : "user.reactivated",
        })
      }

      revalidatePath("/admin/usuarios")
      revalidatePath(`/admin/usuarios/${userId}`)
      return Response.json({ ok: true, suspended: shouldBeBanned, unchanged: user.banned === shouldBeBanned })
    } catch {
      return jsonError("Não foi possível alterar o status da conta", 500)
    }
  }

  try {
    await ensureProfile(userId)
  } catch {
    return jsonError("Não foi possível localizar o usuário no Clerk", 404)
  }

  const month = currentMonth()
  const { error } = await createAdminClient()
    .from("usage")
    .upsert({ user_id: userId, month, memorials_used: 0 }, { onConflict: "user_id,month" })

  if (error) return jsonError("Não foi possível zerar o uso mensal", 500)

  await writeAdminAuditLog({
    actorId: access.userId,
    targetUserId: userId,
    action: "usage.month_reset",
    metadata: { month },
  })
  revalidatePath("/admin/usuarios")
  revalidatePath(`/admin/usuarios/${userId}`)
  revalidatePath("/admin/uso")

  return Response.json({ ok: true, month })
}
