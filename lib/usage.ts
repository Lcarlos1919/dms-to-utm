import "server-only"

import { createAdminClient } from "@/lib/supabase/server"
import { getMemorialPermissions } from "@/lib/profiles"
import { situacaoDoPlano, type SituacaoPlano } from "@/lib/plano"
import { TOTAL_GRATIS } from "@/lib/vertix-core/plano"

/** Total de memoriais do plano Grátis (sem bônus). */
export const DEFAULT_FREE_LIMIT = TOTAL_GRATIS

const USAGE_UPDATE_ATTEMPTS = 8

export function currentMonth(date = new Date()) {
  const month = String(date.getUTCMonth() + 1).padStart(2, "0")
  return `${date.getUTCFullYear()}-${month}-01`
}

/** Situação do plano + se a conta pode criar memoriais (permissão do admin). */
export type UsageStatus = SituacaoPlano & {
  plan: "free" | "pro"
  canCreate: boolean
  canCreateMemorials: boolean
}

export async function getUsageStatus(userId: string): Promise<UsageStatus> {
  const [situacao, permissions] = await Promise.all([situacaoDoPlano(userId), getMemorialPermissions(userId)])
  return {
    ...situacao,
    plan: situacao.plano === "pro" ? "pro" : "free",
    canCreateMemorials: permissions.canCreateMemorials,
    canCreate: permissions.canCreateMemorials && situacao.podeCriar,
  }
}

export async function getFreeMonthlyLimit() {
  const supabase = createAdminClient()
  const { data } = await supabase.from("app_settings").select("value").eq("key", "free_monthly_limit").maybeSingle()
  const parsed = Number(data?.value)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : DEFAULT_FREE_LIMIT
}

export async function getMonthlyUsageTotal(month = currentMonth()) {
  const supabase = createAdminClient()
  const pageSize = 500
  let offset = 0
  let total = 0

  while (true) {
    const { data, error } = await supabase
      .from("usage")
      .select("memorials_used")
      .eq("month", month)
      .order("user_id", { ascending: true })
      .range(offset, offset + pageSize - 1)

    if (error) throw new Error("Não foi possível consultar o uso mensal.")

    const rows = data ?? []
    total += rows.reduce((sum, row) => sum + Number(row.memorials_used ?? 0), 0)
    if (rows.length < pageSize) return total
    offset += pageSize
  }
}

/** Contagem mensal (tabela usage), usada pela área admin. */
export async function incrementUsage(userId: string) {
  const supabase = createAdminClient()
  const month = currentMonth()

  for (let attempt = 0; attempt < USAGE_UPDATE_ATTEMPTS; attempt += 1) {
    const { data, error: selectError } = await supabase
      .from("usage")
      .select("memorials_used")
      .eq("user_id", userId)
      .eq("month", month)
      .maybeSingle()

    if (selectError) throw new Error("Não foi possível consultar o uso do plano.")

    if (data) {
      const current = Number(data.memorials_used ?? 0)
      const { data: updated, error: updateError } = await supabase
        .from("usage")
        .update({ memorials_used: current + 1 })
        .eq("user_id", userId)
        .eq("month", month)
        .eq("memorials_used", current)
        .select("memorials_used")
        .maybeSingle()

      if (updateError) throw new Error("Não foi possível atualizar o uso do plano.")
      if (updated) return
      continue
    }

    const { error: insertError } = await supabase.from("usage").insert({ user_id: userId, month, memorials_used: 1 })
    if (!insertError) return
    if (insertError.code !== "23505") throw new Error("Não foi possível atualizar o uso do plano.")
  }

  throw new Error("Não foi possível atualizar o uso do plano.")
}
