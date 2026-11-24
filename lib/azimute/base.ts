import "server-only"

import { createAdminClient } from "@/lib/supabase/server"
import { buscarAncoras } from "@/lib/vertix-core/ancora"
import { aneilParaUtm, localizarLote, type Anel, type Consulta } from "@/lib/vertix-core/fundiario"
import type { Segmento } from "@/lib/vertix-core/memorial"
import { decidirAncora, type DecisaoAncora } from "@/lib/vertix-core/montagem"
import { buscarSigef, ordenarPeloSigef } from "@/lib/vertix-core/sigef"
import { calcularPoligonal } from "@/lib/vertix-core/poligonal"
import type { BaseFundiaria, CandidataSalva } from "@/lib/azimute/tipos"

interface ConfigFundiario {
  preferencia: "auto" | "banco" | "geoportal"
  timeoutMs: number
}

async function lerConfig(): Promise<ConfigFundiario> {
  try {
    const { data } = await createAdminClient().from("app_settings").select("value").eq("key", "fundiario_config").maybeSingle()
    let v: unknown = data?.value
    if (typeof v === "string") v = JSON.parse(v)
    const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>
    const preferencia = o.preferencia === "banco" || o.preferencia === "geoportal" ? o.preferencia : "auto"
    const timeoutMs = typeof o.timeout_ms === "number" && o.timeout_ms >= 1000 && o.timeout_ms <= 30000 ? o.timeout_ms : 8000
    return { preferencia, timeoutMs }
  } catch {
    return { preferencia: "auto", timeoutMs: 8000 }
  }
}

const areaAnel = (r: Anel) => {
  let s = 0
  for (let i = 0; i < r.length; i++) {
    const j = (i + 1) % r.length
    s += r[i][0] * r[j][1] - r[j][0] * r[i][1]
  }
  return Math.abs(s) / 2
}

export interface ResultadoBase {
  base: BaseFundiaria | null
  candidatas: CandidataSalva[]
  decisao: DecisaoAncora | null
  motivo: string
  avisos: string[]
}

/**
 * D2: localiza o lote na base fundiária (Supabase + GeoPortal) e testa onde a poligonal
 * do memorial se encaixa nele. Não grava nada.
 */
export async function localizarNaBase(consulta: Consulta, segmentos: Segmento[]): Promise<ResultadoBase> {
  if (!consulta.lote?.trim()) {
    return { base: null, candidatas: [], decisao: null, motivo: "O memorial não informa o número do lote.", avisos: [] }
  }
  const config = await lerConfig()
  const db = createAdminClient()
  const rpc = (fn: string, args: Record<string, unknown>) => db.rpc(fn, args)
  const { escolha } = await localizarLote(consulta, { rpc, preferencia: config.preferencia, timeoutMs: config.timeoutMs })
  const avisos = [...escolha.avisos]
  let lote = escolha.escolhido
  // Coador SIGEF: entre os candidatos do SIGLO, fica o que não corta parcela certificada.
  if (lote?.aneis.length) {
    const sigef = await buscarSigef(lote.aneis, { timeoutMs: config.timeoutMs })
    if (!sigef.ok) {
      avisos.push(`SIGEF indisponível (${sigef.erro}): o lote não foi conferido pelas parcelas certificadas.`)
    } else {
      const candidatos = [lote, ...escolha.alternativas.filter((a) => a !== lote)]
      const { ordem, avisos: avisosSigef } = ordenarPeloSigef(candidatos, sigef.parcelas)
      avisos.push(...avisosSigef)
      lote = ordem[0]
      const s = lote.sigef
      if (s.situacao === "coincide") avisos.push(`Lote confirmado pelo SIGEF (imóvel ${s.parcela?.codigoImo ?? "certificado"}).`)
      else if (s.situacao === "sem_sobreposicao") avisos.push("Nenhuma parcela certificada no SIGEF cobre este lote.")
    }
  }
  if (!lote || !lote.aneis.length) {
    return { base: null, candidatas: [], decisao: null, motivo: escolha.motivo, avisos }
  }

  const anel = lote.aneis.reduce((a, b) => (areaAnel(b) > areaAnel(a) ? b : a))
  if (lote.aneis.length > 1) avisos.push(`O lote tem ${lote.aneis.length} partes; usada a maior.`)
  const lonMedia = anel.reduce((s, p) => s + p[0], 0) / anel.length
  const latMedia = anel.reduce((s, p) => s + p[1], 0) / anel.length
  const fuso = Math.floor((lonMedia + 180) / 6) + 1
  const hemisferio: "S" | "N" = latMedia < 0 ? "S" : "N"
  const anelUtm = aneilParaUtm(anel, fuso)

  const base: BaseFundiaria = {
    fonte: lote.fonte,
    nomeGleba: lote.nomeGleba.slice(0, 160),
    gleba: lote.gleba.slice(0, 40),
    lote: lote.lote.slice(0, 40),
    ...(lote.areaOficialHa !== undefined && Number.isFinite(lote.areaOficialHa) ? { areaOficialHa: lote.areaOficialHa } : {}),
    fuso,
    hemisferio,
    anel: anelUtm,
    motivo: escolha.motivo.slice(0, 300),
    avisos: avisos.map((a) => a.slice(0, 300)).slice(0, 20),
  }

  if (segmentos.length < 3 || anelUtm.length < 3) {
    return { base, candidatas: [], decisao: null, motivo: "Lote encontrado, mas não há segmentos suficientes para encaixar.", avisos }
  }

  const candidatas = buscarAncoras(calcularPoligonal(segmentos), anelUtm, { max: 20 })
  const decisao = decidirAncora(candidatas)
  const salvas: CandidataSalva[] = decisao.distintas.slice(0, 5).map((c) => ({
    vertice: c.verticeMemorial,
    este: c.ponto[0],
    norte: c.ponto[1],
    pontuacao: c.pontuacao,
    dentro: c.dentro,
    sobreDivisa: c.sobreDivisa,
    total: c.total,
  }))
  return { base, candidatas: salvas, decisao, motivo: decisao.motivo, avisos }
}
