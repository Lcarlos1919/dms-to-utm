import "server-only"

import { createAdminClient } from "@/lib/supabase/server"

export const DEFAULT_FREE_LIMIT = 3

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
}

export async function getFreeMonthlyLimit() {
  const supabase = createAdminClient()
  const { data } = await supabase.from("app_settings").select("value").eq("key", "free_monthly_limit").maybeSingle()
  const parsed = Number(data?.value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_FREE_LIMIT
}

export async function getUsageStatus(userId: string): Promise<UsageStatus> {
  const supabase = createAdminClient()

  const monthStart = new Date(`${currentMonth()}T00:00:00.000Z`).toISOString()

  const [{ data: profile }, { count }, freeLimit] = await Promise.all([
    supabase.from("profiles").select("plan, bonus_credits").eq("user_id", userId).maybeSingle(),
    supabase
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", monthStart)
      .in("status", ["processing", "ready"]),
    getFreeMonthlyLimit(),
  ])

  const plan = profile?.plan === "pro" ? "pro" : "free"
  const bonusCredits = profile?.bonus_credits ?? 0
  const used = count ?? 0

  if (plan === "pro") {
    return { plan, used, limit: null, bonusCredits, canCreate: true }
  }

  const limit = freeLimit + bonusCredits
  return { plan, used, limit, bonusCredits, canCreate: used < limit }
}

export async function incrementUsage(userId: string) {
  const supabase = createAdminClient()
  const month = currentMonth()
  const { data } = await supabase
    .from("usage")
    .select("memorials_used")
    .eq("user_id", userId)
    .eq("month", month)
    .maybeSingle()

  const { error } = await supabase
    .from("usage")
    .upsert({ user_id: userId, month, memorials_used: (data?.memorials_used ?? 0) + 1 }, { onConflict: "user_id,month" })
  if (error) throw new Error(error.message)
}
