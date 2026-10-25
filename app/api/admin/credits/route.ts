import { z } from "zod"
import { ADMIN_PERMISSIONS, ForbiddenError, requirePermission } from "@/lib/admin-auth"
import { jsonError } from "@/lib/admin"
import { writeAdminAuditLog } from "@/lib/audit"
import { createAdminClient } from "@/lib/supabase/server"

const schema = z.object({ userId: z.string().min(1), amount: z.number().int().positive().max(1000) })

export async function POST(request: Request) {
  let access
  try {
    access = await requirePermission(ADMIN_PERMISSIONS.usersManage)
  } catch (error) {
    if (error instanceof ForbiddenError) return jsonError("Permissão insuficiente", 403)
    throw error
  }

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return jsonError("Dados inválidos")

  const supabase = createAdminClient()
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("user_id,bonus_credits")
    .eq("user_id", parsed.data.userId)
    .maybeSingle()

  if (profileError) return jsonError("Não foi possível carregar usuário", 500)
  if (!profile) return jsonError("Usuário não encontrado", 404)

  const total = profile.bonus_credits + parsed.data.amount
  const { error } = await supabase
    .from("profiles")
    .update({ bonus_credits: total })
    .eq("user_id", parsed.data.userId)

  if (error) return jsonError("Não foi possível adicionar créditos", 500)

  await writeAdminAuditLog({
    actorId: access.userId,
    targetUserId: parsed.data.userId,
    action: "credits.bonus_added",
    metadata: { amount: parsed.data.amount, total },
  })

  return Response.json({ ok: true, bonusCredits: total })
}
