"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { ADMIN_PERMISSIONS, requirePermission } from "@/lib/admin-auth"
import { writeAdminAuditLog } from "@/lib/audit"
import { createAdminClient } from "@/lib/supabase/server"

const limitSchema = z.string().trim().regex(/^\d+$/).transform(Number).refine(Number.isSafeInteger)

export async function updateFreeMonthlyLimit(formData: FormData) {
  const access = await requirePermission(ADMIN_PERMISSIONS.settingsManage)
  const parsed = limitSchema.safeParse(formData.get("limit"))

  if (!parsed.success || parsed.data < 0) {
    return { ok: false as const, message: "Informe um número inteiro maior ou igual a zero." }
  }

  const supabase = createAdminClient()
  const { data: current, error: readError } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", "free_monthly_limit")
    .maybeSingle()

  if (readError) return { ok: false as const, message: "Não foi possível carregar a configuração atual." }

  const previous = Number(current?.value)
  const { error: updateError } = await supabase.from("app_settings").upsert(
    { key: "free_monthly_limit", value: parsed.data, updated_at: new Date().toISOString() },
    { onConflict: "key" },
  )

  if (updateError) return { ok: false as const, message: "Não foi possível salvar o limite mensal." }

  revalidatePath("/admin/configuracoes")
  revalidatePath("/admin/planos")
  revalidatePath("/dashboard")
  revalidatePath("/dashboard/novo")
  revalidatePath("/dashboard/planos")

  try {
    await writeAdminAuditLog({
      actorId: access.userId,
      action: "settings.free_monthly_limit.updated",
      metadata: {
        previousValue: Number.isSafeInteger(previous) && previous >= 0 ? previous : null,
        newValue: parsed.data,
      },
    })
  } catch {
    return { ok: false as const, message: "O limite foi salvo, mas não foi possível registrar a auditoria." }
  }

  return { ok: true as const, message: "Limite mensal atualizado." }
}
