export type KmlHemisphere = "S" | "N"

export interface KmlCrs {
  datum: string
  zone: number
  hemisphere: KmlHemisphere
}

export type KmlCrsResolution =
  | { ok: true; crs: KmlCrs }
  | { ok: false; message: string }

export const KML_SAD69_WARNING = "KML indisponível para SAD69 neste momento"

export function resolveKmlCrs(
  datum: string | null | undefined,
  utmZone: string | null | undefined,
  utmHemisphere: string | null | undefined,
): KmlCrsResolution {
  const normalizedDatum = datum?.trim() ?? ""

  if (!normalizedDatum) {
    return { ok: false, message: "KML indisponível: datum do projeto não identificado." }
  }

  if (/SAD\s*69/i.test(normalizedDatum)) {
    return { ok: false, message: KML_SAD69_WARNING }
  }

  if (!/(?:SIRGAS\s*2000|WGS\s*84)/i.test(normalizedDatum)) {
    return { ok: false, message: "KML indisponível: datum não suportado." }
  }

  const zoneMatch = utmZone?.trim().match(/^(\d{1,2})\s*([NS])?$/i)
  const zone = zoneMatch ? Number(zoneMatch[1]) : Number.NaN

  if (!Number.isInteger(zone) || zone < 1 || zone > 60) {
    return { ok: false, message: "KML indisponível: fuso UTM do projeto não identificado." }
  }

  const explicitHemisphere = utmHemisphere?.trim().toUpperCase()
  if (explicitHemisphere && explicitHemisphere !== "S" && explicitHemisphere !== "N") {
    return { ok: false, message: "KML indisponível: hemisfério UTM inválido." }
  }

  const zoneHemisphere = zoneMatch?.[2]?.toUpperCase() as KmlHemisphere | undefined
  if (explicitHemisphere && zoneHemisphere && explicitHemisphere !== zoneHemisphere) {
    return { ok: false, message: "KML indisponível: fuso e hemisfério UTM inconsistentes." }
  }

  const hemisphere = (explicitHemisphere as KmlHemisphere | undefined) ?? zoneHemisphere
  if (!hemisphere) {
    return { ok: false, message: "KML indisponível: hemisfério UTM não identificado." }
  }

  return {
    ok: true,
    crs: { datum: normalizedDatum, zone, hemisphere },
  }
}
