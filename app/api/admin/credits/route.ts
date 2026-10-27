import { z } from "zod"
import { ADMIN_PERMISSIONS, requireStaffApiPermission } from "@/lib/admin-auth"
import { jsonError } from "@/lib/admin"
import { writeAdminAuditLog } from "@/lib/audit"
import { ensureProfile } from "@/lib/profiles"
import { createAdminClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"

const schema = z.object({ userId: z.string().min(1), amount: z.number().int().positive().max(1000) })

export async function POST(request: Request) {
  const authorization = await requireStaffApiPermission(ADMIN_PERMISSIONS.usersManage)
  if (!authorization.ok) return authorization.response
  const access = authorization.context

  const parsed = schema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return jsonError("Informe uma quantidade de créditos entre 1 e 1.000.")

  try {
    await ensureProfile(parsed.data.userId)
  } catch {
    return jsonError("Não foi possível localizar o usuário no Clerk", 404)
  }

  const supabase = createAdminClient()
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("user_id,bonus_credits")
    .eq("user_id", parsed.data.userId)
    .maybeSingle()

  if (profileError) return jsonError("Não foi possível carregar usuário", 500)
  if (!profile) return jsonError("Não foi possível criar o perfil do usuário", 500)

  const total = Number(profile.bonus_credits ?? 0) + parsed.data.amount
  const { data: updated, error } = await supabase
    .from("profiles")
    .update({ bonus_credits: total })
    .eq("user_id", parsed.data.userId)
    .eq("bonus_credits", profile.bonus_credits)
    .select("bonus_credits")
    .maybeSingle()

  if (error) return jsonError("Não foi possível adicionar créditos", 500)
  if (!updated) return jsonError("O saldo mudou durante a operação. Atualize a página e tente novamente.", 409)

  await writeAdminAuditLog({
    actorId: access.userId,
    targetUserId: parsed.data.userId,
    action: "credits.bonus_added",
    metadata: { amount: parsed.data.amount, total },
  })
  revalidatePath("/admin/usuarios")
  revalidatePath(`/admin/usuarios/${parsed.data.userId}`)

  return Response.json({ ok: true, bonusCredits: total })
}
