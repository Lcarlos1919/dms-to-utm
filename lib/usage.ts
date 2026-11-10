import "server-only"

import { createAdminClient } from "@/lib/supabase/server"
import { getMemorialPermissions } from "@/lib/profiles"

export const DEFAULT_FREE_LIMIT = 3
const USAGE_UPDATE_ATTEMPTS = 8

export function currentMonth(date = new Date()) {
  const month = String(date.getUTCMonth() + 1).padStart(2, "0")
  return `${date.getUTCFullYear()}-${month}-01`
}

export type UsageStatus = {
  plan: "free" | "pro"
  used: number
  limit: number | null
  bonusCredits: number
  canCreate: boolean
  canCreateMemorials: boolean
  canDeleteMemorials: boolean
}

type UsageStatusOptions = {
  excludeProcessingProjectId?: string
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

export async function getUsageStatus(userId: string, options: UsageStatusOptions = {}): Promise<UsageStatus> {
  const supabase = createAdminClient()
  const monthStart = new Date(`${currentMonth()}T00:00:00.000Z`).toISOString()
  let processingQuery = supabase
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "processing")
    .gte("updated_at", monthStart)

  if (options.excludeProcessingProjectId) {
    processingQuery = processingQuery.neq("id", options.excludeProcessingProjectId)
  }

  const [
    { data: profile, error: profileError },
    { data: usage, error: usageError },
    { count: processingCount, error: processingError },
    freeLimit,
    permissions,
  ] = await Promise.all([
    supabase.from("profiles").select("plan,bonus_credits").eq("user_id", userId).maybeSingle(),
    supabase.from("usage").select("memorials_used").eq("user_id", userId).eq("month", currentMonth()).maybeSingle(),
    processingQuery,
    getFreeMonthlyLimit(),
    getMemorialPermissions(userId),
  ])

  if (profileError || usageError || processingError) throw new Error("Não foi possível consultar o uso do plano.")

  const plan = profile?.plan === "pro" ? "pro" : "free"
  const bonusCredits = Number(profile?.bonus_credits ?? 0)
  const used = Number(usage?.memorials_used ?? 0)
  const reserved = processingCount ?? 0
  const permissionState = {
    canCreateMemorials: permissions.canCreateMemorials,
    canDeleteMemorials: permissions.canDeleteMemorials,
  }

  if (plan === "pro") {
    return { plan, used, limit: null, bonusCredits, canCreate: permissions.canCreateMemorials, ...permissionState }
  }

  const limit = freeLimit + bonusCredits
  return {
    plan,
    used,
    limit,
    bonusCredits,
    canCreate: permissions.canCreateMemorials && used + reserved < limit,
    ...permissionState,
  }
}

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
