// Tipos e regras puras do acesso por ferramenta e plano (sem acesso a banco: pode ser usado no cliente).
export type FeatureKey = "memorial_azimute" | "export_kml"
export type Plan = "free" | "pro"
export type FeatureAccess = Record<FeatureKey, Record<Plan, boolean>>

export const FEATURE_KEYS: FeatureKey[] = ["memorial_azimute", "export_kml"]

export const FEATURE_LABELS: Record<FeatureKey, { label: string; description: string }> = {
  memorial_azimute: {
    label: "Memorial por azimute e distância",
    description: "Tipo de memorial sem coordenadas (memorial + planta).",
  },
  export_kml: { label: "Exportação KML", description: "Download do projeto em KML." },
}

// Padrão quando a linha não existe, o JSON é inválido ou falta uma chave.
export const DEFAULT_FEATURE_ACCESS: FeatureAccess = {
  memorial_azimute: { free: false, pro: false },
  export_kml: { free: true, pro: true },
}

/** Aceita objeto ou texto JSON (o jsonb pode vir de qualquer um dos dois jeitos). */
export function parseFeatureAccess(raw: unknown): FeatureAccess {
  let value = raw
  if (typeof value === "string") {
    try {
      value = JSON.parse(value)
    } catch {
      value = null
    }
  }
  const source = value && typeof value === "object" ? (value as Record<string, unknown>) : {}
  const result = {} as FeatureAccess
  for (const key of FEATURE_KEYS) {
    const entry = source[key]
    const plans = entry && typeof entry === "object" ? (entry as Record<string, unknown>) : {}
    result[key] = {
      free: typeof plans.free === "boolean" ? plans.free : DEFAULT_FEATURE_ACCESS[key].free,
      pro: typeof plans.pro === "boolean" ? plans.pro : DEFAULT_FEATURE_ACCESS[key].pro,
    }
  }
  return result
}
