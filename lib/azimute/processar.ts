import "server-only"

import { revalidatePath } from "next/cache"
import { createAdminClient } from "@/lib/supabase/server"
import { registrarUso, verificarCota } from "@/lib/plano"
import { verticeParaLinha } from "@/lib/topocad-db/mapeamento"
import { lonLatParaUtm } from "@/lib/vertix-core/utm"
import { conferirIdentificacao, relatorioPoligonal, validarSegmentos } from "@/lib/vertix-core/revisao"
import { ErroLeitura, lerDocumentosDoProjeto } from "@/lib/azimute/ler-documentos"
import { localizarNaBase } from "@/lib/azimute/base"
import { montarVerticesDoProjeto } from "@/lib/azimute/vertices"
import { azimuteDadosSchema, type AzimuteDados, type FonteAncora } from "@/lib/azimute/tipos"

export type EtapaAzimute = "pronto" | "revisao" | "ancora"
export type ResultadoAzimute =
  | { ok: true; etapa: EtapaAzimute; mensagem: string }
  | { ok: false; codigo: string; mensagem: string; status: number }

export interface AncoraEscolhida {
  fonte: FonteAncora
  vertice: string
  este: number
  norte: number
  fuso: number
  hemisferio: "S" | "N"
  automatica: boolean
  detalhe?: string
}

const SELECT = "id,status,memorial_type,source_pdf_path,planta_path,azimute_dados,azimute_status"
type Projeto = {
  id: string
  status: string
  memorial_type: string | null
  source_pdf_path: string | null
  planta_path: string | null
  azimute_dados: unknown
  azimute_status: string | null
}

const falha = (codigo: string, mensagem: string, status = 422): ResultadoAzimute => ({ ok: false, codigo, mensagem, status })
const epsgDe = (fuso: number, hem: "S" | "N") => (hem === "S" ? 31960 + fuso : 31954 + fuso)

export async function carregarProjetoAzimute(projectId: string, userId: string): Promise<Projeto | null> {
  const { data, error } = await createAdminClient().from("projects").select(SELECT).eq("id", projectId).eq("user_id", userId).maybeSingle()
  if (error) throw new Error("ERRO_BANCO")
  return (data as Projeto | null) ?? null
}

async function salvarDados(projectId: string, userId: string, dados: AzimuteDados, azimuteStatus: string, extra: Record<string, unknown> = {}) {
  const { error } = await createAdminClient()
    .from("projects")
    .update({
      azimute_dados: dados,
      azimute_status: azimuteStatus,
      utm_zone: `${dados.fuso}${dados.hemisferio}`,
      utm_hemisphere: dados.hemisferio,
      datum: "SIRGAS 2000",
      ...extra,
    })
    .eq("id", projectId)
    .eq("user_id", userId)
  if (error) throw new Error("ERRO_BANCO")
}

/**
 * Pipeline completo do memorial por azimute: lê os PDFs (D1), valida a tabela,
 * tenta posicionar sozinho (D2: coordenada do memorial ou base fundiária) e,
 * se conseguir, grava o projeto PRONTO (D4/D5). Se não conseguir, deixa o projeto
 * aguardando a escolha do ponto de partida (D3) ou a revisão da tabela.
 */
export async function processarAzimute(projectId: string, userId: string, opcoes: { reler?: boolean } = {}): Promise<ResultadoAzimute> {
  let projeto: Projeto | null
  try {
    projeto = await carregarProjetoAzimute(projectId, userId)
  } catch {
    return falha("ERRO_BANCO", "Não foi possível carregar o projeto.", 500)
  }
  if (!projeto) return falha("NAO_ENCONTRADO", "Projeto não encontrado.", 404)
  if (projeto.memorial_type !== "azimute") return falha("TIPO_INCOMPATIVEL", "Este projeto não é do tipo azimute.", 400)
  if (!projeto.source_pdf_path) return falha("ARQUIVOS_AUSENTES", "O memorial deste projeto não foi encontrado.", 400)

  const atual = azimuteDadosSchema.safeParse(projeto.azimute_dados)
  let dados: AzimuteDados
  if (opcoes.reler !== false || !atual.success) {
    try {
      dados = (await lerDocumentosDoProjeto(projeto.source_pdf_path, projeto.planta_path)).dados
    } catch (e) {
      if (e instanceof ErroLeitura) return falha(e.codigo, e.message, e.status)
      return falha("ERRO_LEITURA", "Não foi possível ler os documentos. Tente novamente.", 500)
    }
    // Ler de novo descarta o resultado anterior (vértices e âncora) e mantém o registro de uso.
    if (atual.success && atual.data.usoRegistrado) dados.usoRegistrado = true
    try {
      await createAdminClient().from("project_vertices").delete().eq("project_id", projectId)
      await salvarDados(projectId, userId, dados, dados.segmentos.length ? "lido" : "erro_leitura", {
        status: "draft",
        error_code: null,
        error_message: null,
      })
    } catch {
      return falha("ERRO_BANCO", "Os documentos foram lidos, mas não foi possível salvar o resultado.", 500)
    }
    projeto.status = "draft"
  } else {
    dados = atual.data
  }
  return continuarAzimute(projectId, userId, dados, projeto.status, { confirmadoPeloUsuario: false })
}

/** Depois da leitura (ou da revisão do usuário): valida e tenta posicionar sem ajuda. */
export async function continuarAzimute(
  projectId: string,
  userId: string,
  entrada: AzimuteDados,
  statusAtual: string,
  opcoes: { confirmadoPeloUsuario: boolean },
): Promise<ResultadoAzimute> {
  const dados: AzimuteDados = { ...entrada }
  const segs = dados.segmentos
  const problemas = validarSegmentos(segs)
  const relatorio = relatorioPoligonal(segs, { areaHa: dados.cabecalho.areaHa, perimetroM: dados.cabecalho.perimetroM }, dados.planta)
  const identificacao = conferirIdentificacao(dados.cabecalho, dados.planta)

  let motivoRevisao: string | null = null
  if (!segs.length) motivoRevisao = "Não foi possível ler a tabela de azimutes e distâncias. Preencha-a manualmente."
  else if (problemas.length) motivoRevisao = `A tabela lida tem problemas: ${problemas[0].msg}`
  else if (!relatorio.calculavel || relatorio.situacao === "erro") {
    const c = relatorio.checks.find((x) => x.status === "erro")
    motivoRevisao = `A conferência automática encontrou um erro${c ? ` (${c.rotulo}: ${c.detalhe})` : ""}. Revise a tabela.`
  } else if (!opcoes.confirmadoPeloUsuario && identificacao.some((c) => c.status === "erro")) {
    motivoRevisao = "Lote ou gleba do memorial não conferem com a planta. Revise a identificação."
  }

  if (motivoRevisao) {
    dados.pendencia = motivoRevisao.slice(0, 400)
    try {
      await salvarDados(projectId, userId, dados, segs.length ? "lido" : "erro_leitura", { status: statusAtual === "ready" ? "draft" : statusAtual })
    } catch {
      return falha("ERRO_BANCO", "Não foi possível salvar o resultado da leitura.", 500)
    }
    return { ok: true, etapa: "revisao", mensagem: motivoRevisao }
  }

  dados.revisadoEm = dados.revisadoEm ?? new Date().toISOString()
  const pendencias: string[] = []
  let ancora: AncoraEscolhida | null = null

  // 1) Coordenada de partida escrita no próprio memorial.
  const coord = dados.coordenadaMemorial
  const nomes = new Set(segs.map((s) => s.de))
  const datumRuim = coord?.datum === "SAD69" || coord?.datum === "Córrego Alegre"
  const verticeCoord = coord?.vertice && nomes.has(coord.vertice) ? coord.vertice : coord ? segs[0].de : undefined
  let dicaUtmSemFuso: { este: number; norte: number } | null = null
  if (coord && verticeCoord) {
    if (datumRuim) {
      pendencias.push(`O memorial traz coordenadas em ${coord.datum}, que o Vertix ainda não converte.`)
    } else if (coord.lon !== undefined && coord.lat !== undefined) {
      const fuso = Math.floor((coord.lon + 180) / 6) + 1
      const u = lonLatParaUtm(coord.lon, coord.lat, fuso)
      if (fuso >= 18 && fuso <= 25) {
        ancora = { fonte: "memorial", vertice: verticeCoord, este: u.E, norte: u.N, fuso, hemisferio: coord.lat < 0 ? "S" : "N", automatica: true, detalhe: "Coordenada geográfica do vértice inicial informada no memorial." }
      }
    } else if (coord.este !== undefined && coord.norte !== undefined) {
      if (dados.fusoDeclarado) {
        ancora = { fonte: "memorial", vertice: verticeCoord, este: coord.este, norte: coord.norte, fuso: dados.fuso, hemisferio: dados.hemisferio, automatica: true, detalhe: "Coordenada UTM do vértice inicial informada no memorial." }
      } else {
        dicaUtmSemFuso = { este: coord.este, norte: coord.norte }
      }
    }
  }

  // 2) Base fundiária (Supabase + GeoPortal).
  if (!ancora) {
    if (dados.cabecalho.lote) {
      try {
        const r = await localizarNaBase(
          { lote: dados.cabecalho.lote, gleba: dados.cabecalho.gleba, nomeGleba: dados.cabecalho.nomeGleba },
          segs,
        )
        dados.base = r.base
        dados.candidatas = r.candidatas
        if (r.base) {
          dados.fuso = r.base.fuso
          dados.hemisferio = r.base.hemisferio
          const perto = dicaUtmSemFuso && r.base.anel.some(([e, n]) => Math.hypot(e - dicaUtmSemFuso!.este, n - dicaUtmSemFuso!.norte) <= 5000)
          if (perto && dicaUtmSemFuso && verticeCoord) {
            ancora = { fonte: "memorial", vertice: verticeCoord, este: dicaUtmSemFuso.este, norte: dicaUtmSemFuso.norte, fuso: r.base.fuso, hemisferio: r.base.hemisferio, automatica: true, detalhe: "Coordenada UTM do memorial; fuso confirmado pela base fundiária." }
          } else if (r.decisao?.automatica && r.decisao.escolhida) {
            const c = r.decisao.escolhida
            ancora = { fonte: "base_fundiaria", vertice: c.verticeMemorial, este: c.ponto[0], norte: c.ponto[1], fuso: r.base.fuso, hemisferio: r.base.hemisferio, automatica: true, detalhe: `${r.base.fonte === "banco" ? "Base no Supabase" : "GeoPortal SEDAM"}: ${r.motivo}` }
          } else {
            pendencias.push(`Lote encontrado na base, mas o encaixe automático não é seguro. ${r.motivo}`)
          }
        } else {
          pendencias.push(r.motivo)
        }
      } catch {
        pendencias.push("Não foi possível consultar a base fundiária agora.")
      }
    } else {
      pendencias.push("O memorial não informa o lote, então não dá para buscá-lo na base fundiária.")
    }
  }

  if (dicaUtmSemFuso && !ancora) pendencias.push("O memorial traz a coordenada do vértice inicial, mas não informa o fuso UTM: confirme o fuso e a coordenada.")

  if (!ancora) {
    dados.pendencia = `Defina o ponto de partida. ${pendencias.join(" ")}`.slice(0, 400)
    try {
      await salvarDados(projectId, userId, dados, "revisado", { status: statusAtual === "ready" ? "draft" : statusAtual })
    } catch {
      return falha("ERRO_BANCO", "Não foi possível salvar o andamento do projeto.", 500)
    }
    return { ok: true, etapa: "ancora", mensagem: dados.pendencia }
  }

  return finalizarAzimute(projectId, userId, dados, statusAtual, ancora)
}

/** D4/D5: posiciona a poligonal pela âncora, grava os vértices e deixa o projeto pronto. */
export async function finalizarAzimute(
  projectId: string,
  userId: string,
  entrada: AzimuteDados,
  statusAtual: string,
  a: AncoraEscolhida,
): Promise<ResultadoAzimute> {
  const dados: AzimuteDados = { ...entrada, fuso: a.fuso, hemisferio: a.hemisferio }
  if (!dados.segmentos.some((s) => s.de === a.vertice)) return falha("VERTICE_INVALIDO", `O vértice ${a.vertice} não está na tabela.`, 400)

  const contar = !dados.usoRegistrado && statusAtual !== "ready"
  if (contar) {
    try {
      const cota = await verificarCota(userId, "azimute", projectId)
      if (!cota.ok) {
        dados.pendencia = cota.mensagem
        await salvarDados(projectId, userId, dados, "revisado")
        return falha("LIMITE_PLANO", cota.mensagem, 403)
      }
    } catch {
      return falha("ERRO_PERMISSAO", "Não foi possível verificar o limite do plano.", 500)
    }
  }

  let montagem: ReturnType<typeof montarVerticesDoProjeto>
  try {
    montagem = montarVerticesDoProjeto(dados.segmentos, a, a.fuso, a.hemisferio)
  } catch (e) {
    return falha("POSICIONAMENTO_INVALIDO", e instanceof Error ? e.message : "Não foi possível posicionar a poligonal.")
  }
  if (montagem.vertices.some((v) => !Number.isFinite(v.lon) || !Number.isFinite(v.lat) || v.este < 100_000 || v.este > 900_000)) {
    return falha("POSICIONAMENTO_INVALIDO", "A posição escolhida leva a coordenadas fora do fuso UTM. Confira o ponto de partida.")
  }

  const db = createAdminClient()
  const { error: delErro } = await db.from("project_vertices").delete().eq("project_id", projectId)
  if (delErro) return falha("ERRO_BANCO", "Não foi possível salvar os vértices.", 500)
  const { error: insErro } = await db.from("project_vertices").insert(montagem.vertices.map((v) => verticeParaLinha(projectId, v)))
  if (insErro) return falha("ERRO_BANCO", "Não foi possível salvar os vértices.", 500)

  if (contar) {
    try {
      await registrarUso(projectId, userId, "azimute")
    } catch {
      return falha("USAGE_UPDATE_FAILED", "Não foi possível registrar o uso do memorial.", 500)
    }
  }

  dados.ancora = {
    fonte: a.fonte,
    vertice: a.vertice,
    este: a.este,
    norte: a.norte,
    automatica: a.automatica,
    ...(a.detalhe ? { detalhe: a.detalhe.slice(0, 300) } : {}),
    definidaEm: new Date().toISOString(),
  }
  dados.pendencia = null
  dados.usoRegistrado = dados.usoRegistrado || contar
  dados.revisadoEm = dados.revisadoEm ?? new Date().toISOString()

  const g = montagem.geometria
  try {
    await salvarDados(projectId, userId, dados, "revisado", {
      status: "ready",
      epsg: epsgDe(a.fuso, a.hemisferio),
      area_m2: g.areaM2,
      perimeter_m: g.perimetroGradeM,
      closure_error_m: Math.round(montagem.fechamentoLinearM * 1000) / 1000,
      is_closed: g.poligonoFechado,
      error_code: null,
      error_message: null,
      // a coluna aceita base_fundiaria/manual/mapa; "memorial" fica registrado em azimute_dados.ancora
      anchor_source: a.fonte === "memorial" ? null : a.fonte,
      vertices: montagem.vertices.map((v) => ({ id: String(v.seq), code: v.codigo, e: v.este, n: v.norte, azimuth: v.azimuteDms, distance: v.distancia })),
    })
  } catch {
    return falha("ERRO_BANCO", "Os vértices foram salvos, mas não foi possível concluir o projeto.", 500)
  }

  revalidatePath(`/dashboard/projeto/${projectId}`)
  revalidatePath("/dashboard")
  const origem = a.fonte === "memorial" ? "pela coordenada do memorial" : a.fonte === "base_fundiaria" ? "pela base fundiária" : a.fonte === "mapa" ? "pelo ponto marcado no mapa" : "pela coordenada digitada"
  return { ok: true, etapa: "pronto", mensagem: `Memorial pronto. Posicionado ${origem}.` }
}
