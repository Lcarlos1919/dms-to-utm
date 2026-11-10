import type { ResultadoMotor, Vertice } from "@/lib/topocad"

export interface LinhaVertice {
  project_id: string
  seq: number
  code: string
  lon_dms: string
  lat_dms: string
  lon_dec: number
  lat_dec: number
  altitude_m: number | null
  vante_code: string
  azimuth_dms: string
  distance_m: number
  confrontacao: string
  easting: number
  northing: number
  edited: boolean
}

export function verticeParaLinha(projectId: string, vertex: Vertice): LinhaVertice {
  return {
    project_id: projectId,
    seq: vertex.seq,
    code: vertex.codigo,
    lon_dms: vertex.lonDms,
    lat_dms: vertex.latDms,
    lon_dec: vertex.lon,
    lat_dec: vertex.lat,
    altitude_m: vertex.altitude,
    vante_code: vertex.vante,
    azimuth_dms: vertex.azimuteDms,
    distance_m: vertex.distancia,
    confrontacao: vertex.confrontacao,
    easting: vertex.este,
    northing: vertex.norte,
    edited: vertex.editado,
  }
}

export function linhaParaVertice(row: LinhaVertice): Vertice {
  return {
    seq: row.seq,
    codigo: row.code,
    lonDms: row.lon_dms,
    latDms: row.lat_dms,
    lon: Number(row.lon_dec),
    lat: Number(row.lat_dec),
    altitude: row.altitude_m === null ? null : Number(row.altitude_m),
    vante: row.vante_code,
    azimuteDms: row.azimuth_dms,
    distancia: Number(row.distance_m),
    confrontacao: row.confrontacao,
    este: Number(row.easting),
    norte: Number(row.northing),
    editado: row.edited,
  }
}

export function crsDoProjeto(project: {
  datum: string
  utm_zone: string | number
  utm_hemisphere: "S" | "N"
  epsg: number
}) {
  const zoneMatch = String(project.utm_zone).match(/^(\d{1,2})\s*[NS]?$/i)
  const zone = zoneMatch ? Number(zoneMatch[1]) : Number.NaN

  if (!Number.isInteger(zone) || zone < 1 || zone > 60) {
    throw new Error("O fuso UTM do projeto não é válido.")
  }

  return {
    datum: "SIRGAS 2000" as const,
    fuso: zone,
    hemisferio: project.utm_hemisphere,
    epsg: project.epsg,
    nome: `SIRGAS 2000 / UTM zone ${zone}${project.utm_hemisphere}`,
  }
}

export function projetoDoResultado(result: Extract<ResultadoMotor, { ok: true }>) {
  return {
    status: "ready",
    datum: result.crs.datum,
    epsg: result.crs.epsg,
    utm_zone: `${result.crs.fuso}${result.crs.hemisferio}`,
    utm_hemisphere: result.crs.hemisferio,
    area_m2: result.geometria.areaM2,
    perimeter_m: result.geometria.perimetroGradeM,
    closure_error_m: result.geometria.divergenciaMaxDistanciaM,
    is_closed: result.geometria.poligonoFechado,
    error_code: null,
    error_message: null,
  }
}
