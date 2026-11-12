// D2: acha o lote na base fundiária (SIGLO: banco + GeoPortal), gera as posições candidatas da
// poligonal do memorial e refina com o SIGEF. Não decide nada: o usuário confirma no mapa (D3).
// Sem imports de servidor: roda em qualquer lugar (a rota injeta o acesso ao banco).
import type { AzimuteDados, Localizacao } from "./tipos"
import { buscarAncoras } from "@/lib/vertix-core/ancora"
import { aneilParaUtm, localizarLote, type Anel, type LoteBase, type Rpc } from "@/lib/vertix-core/fundiario"
import { posicionarPorCoordenadas } from "@/lib/vertix-core/coordenadas"
import { calcularPoligonal } from "@/lib/vertix-core/poligonal"
import { bboxDoLote, buscarParcelasSigef, posicaoFinal, refinarCandidatas } from "@/lib/vertix-core/sigef"
import { utmParaLonLat } from "@/lib/vertix-core/utm"

export interface OpcoesLocalizacao {
  rpc: Rpc
  preferencia?: "auto" | "banco" | "geoportal"
  timeoutMs?: number
  fetchImpl?: typeof fetch
  agora?: () => Date
}

const arredonda = (n: number, casas: number) => Math.round(n * 10 ** casas) / 10 ** casas
const areaGraus = (r: Anel) => {
  let s = 0
  for (let i = 0; i < r.length; i++) {
    const j = (i + 1) % r.length
    s += r[i][0] * r[j][1] - r[j][0] * r[i][1]
  }
  return Math.abs(s) / 2
}

/** Se o lote tem várias partes, usa a maior (e avisa). */
function anelPrincipal(l: LoteBase): { anel: Anel; partes: number } | null {
  const aneis = l.aneis.filter((a) => Array.isArray(a) && a.length >= 4)
  if (!aneis.length) return null
  return { anel: aneis.reduce((a, b) => (areaGraus(b) > areaGraus(a) ? b : a)), partes: aneis.length }
}

export async function localizarNaBase(dados: AzimuteDados, opt: OpcoesLocalizacao): Promise<Localizacao> {
  const agora = (opt.agora ?? (() => new Date()))().toISOString()
  const vazio = (estado: Localizacao["estado"], motivo: string, avisos: string[], extra: Partial<Localizacao> = {}): Localizacao => ({
    versao: 1, localizadoEm: agora, estado, fonte: null, motivo, avisos, divergenciaM: null, lote: null,
    alternativas: [], sigef: { consultado: false, ok: false, parcelas: 0, falhas: [] }, candidatas: [], ...extra,
  })

  const { cabecalho, fuso, hemisferio, segmentos } = dados
  if (!cabecalho.lote) return vazio("nao_encontrado", "O memorial não informa o número do lote.", ["Preencha o lote na identificação e confirme a tabela de novo."])

  // 1) O memorial já traz coordenadas: a posição vem delas, sem depender da base fundiária.
  const polMemorial = calcularPoligonal(segmentos.map((s) => ({ ...s })))
  const porCoord = posicionarPorCoordenadas(polMemorial, dados.coordenadas, fuso)
  if (porCoord) {
    const fora = porCoord.residuos.filter((r) => r.m !== null && r.m > 0.1)
    const avisosCoord: string[] = []
    if (fora.length) avisosCoord.push(`A coordenada escrita diverge do calculado em ${fora.map((r) => `${r.nome} (${arredonda(r.m as number, 2)} m)`).join(", ")}. Foi usada a posição que concorda com os outros vértices; confira no mapa.`)
    if (porCoord.concordam < 2 && porCoord.comCoordenada > 1) avisosCoord.push("As coordenadas do memorial não concordam entre si com os azimutes. Revise a tabela antes de confiar na posição.")
    if (porCoord.comCoordenada === 1) avisosCoord.push("Só um vértice tem coordenada legível: não foi possível conferir a posição com os outros.")
    return vazio("encontrado", "Posição pelas coordenadas escritas no próprio memorial, conferidas com os azimutes.", avisosCoord, {
      fonte: "memorial",
      candidatas: [{
        verticeMemorial: porCoord.ancora, indiceLote: 0, dentro: 0, sobreDivisa: 0, total: porCoord.vertices.length, azimutesCasados: 0,
        pontuacao: 100, pontuacaoFinal: 100, confianca: "coordenadas",
        sigef: { nivel: "nenhum", verticesCasados: porCoord.concordam, verticesNaDivisa: 0, residuoM: null, codigo: null, deslocamento: null },
        vertices: porCoord.vertices.map((v) => { const g = utmParaLonLat(v.x, v.y, fuso, hemisferio); return { nome: v.nome, lon: arredonda(g.lon, 9), lat: arredonda(g.lat, 9) } }),
      }],
    })
  }

  // 2) Sem coordenadas, o lote precisa ser achado na base; só o número do lote não identifica nada.
  if (!cabecalho.gleba && !cabecalho.nomeGleba) {
    return vazio("nao_encontrado", "O memorial não informa gleba nem coordenadas: não dá para identificar o lote na base com segurança.", ["Preencha a gleba ou o nome da gleba na identificação e confirme a tabela de novo."])
  }

  const { escolha } = await localizarLote(
    { nomeGleba: cabecalho.nomeGleba, gleba: cabecalho.gleba, lote: cabecalho.lote },
    { rpc: opt.rpc, preferencia: opt.preferencia, timeoutMs: opt.timeoutMs, fetchImpl: opt.fetchImpl },
  )
  const avisos = [...escolha.avisos]

  if (!escolha.escolhido) {
    const semFontes = !escolha.fonte && /Nenhuma fonte respondeu/.test(escolha.motivo)
    return vazio(semFontes ? "sem_fontes" : "nao_encontrado", escolha.motivo, avisos)
  }

  const lote = escolha.escolhido
  const principal = anelPrincipal(lote)
  if (!principal) return vazio("nao_encontrado", "O lote da base veio sem geometria utilizável.", avisos)
  if (principal.partes > 1) avisos.push(`O lote tem ${principal.partes} partes na base; usada a maior. Confira no mapa.`)

  // poligonal do memorial (origem arbitrária) e vértices do lote em UTM do fuso do memorial
  const pol = polMemorial
  const lotePts = aneilParaUtm(principal.anel, fuso)
  if (lotePts.length < 3) return vazio("nao_encontrado", "O lote da base tem menos de 3 vértices.", avisos)
  if (lotePts.length <= 4) avisos.push(`A base traz o lote com só ${lotePts.length} vértices (forma simplificada): o encaixe pode variar de 1 a 2 m.`)

  // o memorial costuma ser parte do lote (desmembramento/remanescente): só avisa quando não faz sentido
  if (lote.areaOficialHa && pol.areaHa > 0) {
    const razao = pol.areaHa / lote.areaOficialHa
    if (razao > 1.05) avisos.push(`A área do memorial (${arredonda(pol.areaHa, 2)} ha) é maior que a do lote na base (${arredonda(lote.areaOficialHa, 2)} ha). Confira se é o lote certo.`)
    else if (razao < 0.9) avisos.push(`O memorial cobre ${Math.round(razao * 100)}% do lote da base (${arredonda(lote.areaOficialHa, 2)} ha): provável desmembramento ou remanescente.`)
  }

  const base = buscarAncoras(pol, lotePts, { max: 5 })

  // SIGEF: refinamento opcional; se falhar, segue só com o SIGLO
  const sigef = await buscarParcelasSigef(bboxDoLote([principal.anel]), { timeoutMs: opt.timeoutMs ? opt.timeoutMs + 2000 : undefined, fetchImpl: opt.fetchImpl })
  const falhasSigef = sigef.falhas.map((f) => f.slice(0, 280))
  if (!sigef.ok) avisos.push("SIGEF indisponível agora: a posição usa só a base SIGLO (precisão de 1 a 2 m).")
  else if (!sigef.parcelas.length) avisos.push("Não há parcela certificada no SIGEF perto deste lote: a posição usa só a base SIGLO (precisão de 1 a 2 m).")

  const refinadas = refinarCandidatas(base, sigef.ok ? sigef.parcelas : [], fuso)
  const candidatas = refinadas.map((c) => ({
    verticeMemorial: c.verticeMemorial,
    indiceLote: c.indiceLote,
    dentro: c.dentro,
    sobreDivisa: c.sobreDivisa,
    total: c.total,
    azimutesCasados: c.azimutesCasados,
    pontuacao: c.pontuacao,
    pontuacaoFinal: arredonda(c.pontuacaoFinal, 1),
    confianca: c.confianca,
    sigef: {
      nivel: c.sigef.nivel,
      verticesCasados: c.sigef.verticesCasados,
      verticesNaDivisa: c.sigef.verticesNaDivisa,
      residuoM: Number.isFinite(c.sigef.residuoM) ? arredonda(c.sigef.residuoM, 3) : null,
      codigo: c.sigef.parcela?.codigo ? String(c.sigef.parcela.codigo).slice(0, 60) : null,
      deslocamento: c.sigef.deslocamento ? { dE: arredonda(c.sigef.deslocamento.dE, 3), dN: arredonda(c.sigef.deslocamento.dN, 3) } : null,
    },
    vertices: posicaoFinal(c).map((v) => {
      const g = utmParaLonLat(v.x, v.y, fuso, hemisferio)
      return { nome: v.nome, lon: arredonda(g.lon, 9), lat: arredonda(g.lat, 9) }
    }),
  }))
  if (!candidatas.length) return vazio("nao_encontrado", "Não foi possível posicionar o memorial sobre o lote da base.", avisos)

  // duas candidatas quase empatadas: o usuário precisa olhar com cuidado
  if (candidatas.length > 1 && candidatas[0].pontuacaoFinal - candidatas[1].pontuacaoFinal < 5) {
    avisos.push("Mais de uma posição ficou com pontuação parecida. Compare no mapa antes de confirmar.")
  }

  return {
    versao: 1,
    localizadoEm: agora,
    estado: "encontrado",
    fonte: lote.fonte,
    motivo: escolha.motivo,
    avisos,
    divergenciaM: escolha.divergenciaM ?? null,
    lote: {
      feicaoId: lote.feicaoId ?? null,
      nomeGleba: lote.nomeGleba,
      gleba: lote.gleba,
      lote: lote.lote,
      areaOficialHa: lote.areaOficialHa ?? null,
      baseData: lote.baseData ?? null,
      anel: principal.anel.map(([lon, lat]) => [lon, lat] as [number, number]),
    },
    alternativas: escolha.alternativas.slice(0, 10).map((a) => ({ fonte: a.fonte, feicaoId: a.feicaoId ?? null, nomeGleba: a.nomeGleba, gleba: a.gleba, lote: a.lote })),
    sigef: { consultado: true, ok: sigef.ok, parcelas: sigef.parcelas.length, falhas: falhasSigef },
    candidatas,
  }
}
