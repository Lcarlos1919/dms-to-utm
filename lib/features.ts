import "server-only"

import { createAdminClient } from "@/lib/supabase/server"

export type FeatureKey = "memorial_azimute" | "export_kml"

export async function canUseFeature(userId: string, featureKey: FeatureKey) {
  try {
    const supabase = createAdminClient()
    const [{ data: profile, error: profileError }, { data: feature, error: featureError }] = await Promise.all([
      supabase.from("profiles").select("plan").eq("user_id", userId).maybeSingle(),
      supabase.from("feature_access").select("free_enabled,pro_enabled").eq("feature_key", featureKey).maybeSingle(),
    ])

    if (profileError || featureError || !feature) return false

    return profile?.plan === "pro" ? feature.pro_enabled === true : feature.free_enabled === true
  } catch {
    return false
  }
}
