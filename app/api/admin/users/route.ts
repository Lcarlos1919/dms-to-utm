import { z } from "zod"
import { ADMIN_PERMISSIONS, ForbiddenError, requirePermission } from "@/lib/admin-auth"
import { jsonError } from "@/lib/admin"
import { writeAdminAuditLog } from "@/lib/audit"
import { createAdminClient } from "@/lib/supabase/server"

export async function GET() {
  let access
  try {
    access = await requirePermission(ADMIN_PERMISSIONS.usersRead)
  } catch (error) {
    if (error instanceof ForbiddenError) return jsonError("Permissão insuficiente", 403)
    throw error
  }

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
  let access
  try {
    access = await requirePermission(ADMIN_PERMISSIONS.usersManage)
  } catch (error) {
    if (error instanceof ForbiddenError) return jsonError("Permissão insuficiente", 403)
    throw error
  }

  const parsed = patchSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return jsonError("Dados inválidos")
  if (parsed.data.userId === access.userId && parsed.data.role === "user") {
    return jsonError("Você não pode alterar seu próprio perfil para usuário", 403)
  }

  const { userId, canCreateMemorials, canDeleteMemorials, ...changes } = parsed.data
  const profileChanges = {
    ...changes,
    ...(canCreateMemorials === undefined ? {} : { can_create_memorials: canCreateMemorials }),
    ...(canDeleteMemorials === undefined ? {} : { can_delete_memorials: canDeleteMemorials }),
  }
  const { data, error } = await createAdminClient()
    .from("profiles")
    .update(profileChanges)
    .eq("user_id", userId)
    .select("user_id,email,plan,role,bonus_credits")
    .maybeSingle()

  if (error) return jsonError("Não foi possível atualizar usuário", 500)
  if (!data) return jsonError("Usuário não encontrado", 404)

  await writeAdminAuditLog({
    actorId: access.userId,
    targetUserId: userId,
    action: "user.updated",
    metadata: profileChanges,
  })

  return Response.json({ ok: true, data })
}
