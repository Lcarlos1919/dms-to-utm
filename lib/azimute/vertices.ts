// D4/D5: transforma a tabela de segmentos + âncora nos vértices do projeto
// (mesmo formato do fluxo por coordenadas: mapa, edição e exportação iguais).
import { calcularGeometria, utmParaGeograficas, type Geometria, type Vertice } from "@/lib/topocad"
import { formatDMS } from "@/lib/vertix-core/angulos"
import type { Segmento } from "@/lib/vertix-core/memorial"
import { montarPoligonal, posicionar } from "@/lib/vertix-core/montagem"

/** -62.67 -> -62°40'12,000" (mesmo estilo dos memoriais SIGEF). */
export function grausParaDms(valor: number): string {
  const sinal = valor < 0 ? "-" : ""
  let s = Math.round(Math.abs(valor) * 3600 * 1000) / 1000
  const g = Math.floor(s / 3600)
  s -= g * 3600
  const m = Math.floor(s / 60)
  s -= m * 60
  return `${sinal}${g}°${String(m).padStart(2, "0")}'${s.toFixed(3).padStart(6, "0").replace(".", ",")}"`
}

export interface ResultadoMontagem {
  vertices: Vertice[]
  geometria: Geometria
  fechamentoLinearM: number
  precisao: number
  compensada: boolean
}

export function montarVerticesDoProjeto(
  segmentos: Segmento[],
  ancora: { vertice: string; este: number; norte: number },
  fuso: number,
  hemisferio: "S" | "N",
): ResultadoMontagem {
  const pol = montarPoligonal(segmentos)
  const pts = posicionar(pol, ancora.vertice, ancora.este, ancora.norte)
  const porDe = new Map(segmentos.map((s) => [s.de, s]))
  const vertices: Vertice[] = pts.map((p, i) => {
    const { lon, lat } = utmParaGeograficas(p.x, p.y, fuso, hemisferio)
    const seg = porDe.get(p.nome) ?? segmentos[i]
    const vante = pts[(i + 1) % pts.length].nome
    return {
      seq: i + 1,
      codigo: p.nome,
      lonDms: grausParaDms(lon),
      latDms: grausParaDms(lat),
      lon,
      lat,
      altitude: null,
      vante,
      azimuteDms: seg ? formatDMS(seg.azimute, 2) : "",
      distancia: seg?.distancia ?? 0,
      confrontacao: seg?.confrontante ?? "",
      este: p.x,
      norte: p.y,
      editado: false,
    }
  })
  // Distâncias do memorial são de projeto (planas): não comparamos com a geodésica.
  const { geometria } = calcularGeometria(vertices, 0.1, true)
  return { vertices, geometria, fechamentoLinearM: pol.fechamentoLinearM, precisao: pol.precisao, compensada: pol.compensada }
}
