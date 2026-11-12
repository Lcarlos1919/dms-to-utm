import "server-only"

import { createAdminClient } from "@/lib/supabase/server"
import { parseFeatureAccess, type FeatureAccess, type FeatureKey } from "@/lib/feature-access"

export type { FeatureKey } from "@/lib/feature-access"

/** Lê a linha `feature_access` de app_settings (SQL 006). Sem linha ou com erro, valem os padrões. */
export async function readFeatureAccess(): Promise<FeatureAccess> {
  try {
    const { data } = await createAdminClient().from("app_settings").select("value").eq("key", "feature_access").maybeSingle()
    return parseFeatureAccess(data?.value)
  } catch {
    return parseFeatureAccess(null)
  }
}

/** O usuário pode usar a ferramenta no plano dele? (Pro usa a coluna "pro"; qualquer outro, "free".) */
export async function canUseFeature(userId: string, featureKey: FeatureKey): Promise<boolean> {
  try {
    const supabase = createAdminClient()
    const [{ data: profile }, access] = await Promise.all([
      supabase.from("profiles").select("plan").eq("user_id", userId).maybeSingle(),
      readFeatureAccess(),
    ])
    return access[featureKey][profile?.plan === "pro" ? "pro" : "free"]
  } catch {
    return parseFeatureAccess(null)[featureKey].free
  }
}
