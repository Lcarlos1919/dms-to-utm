import { revalidatePath } from "next/cache"
import { erroApi } from "@/lib/api/projetos"
import { carregarProjetoAzimute as carregar } from "@/lib/azimute/contexto"
import { createAdminClient } from "@/lib/supabase/server"
import { ErroLeitura, lerDocumentosDoProjeto } from "@/lib/azimute/ler-documentos"
import { azimuteDadosSchema, salvarRevisaoSchema, type AzimuteDados } from "@/lib/azimute/tipos"
import type { Segmento } from "@/lib/vertix-core/memorial"
import { relatorioPoligonal, validarSegmentos } from "@/lib/vertix-core/revisao"

export const runtime = "nodejs"
export const maxDuration = 60

/** Lê os dois PDFs e grava a tabela de segmentos para revisão. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await carregar(params)
  if (!ctx.ok) return ctx.response
  if (!ctx.project.source_pdf_path) return erroApi(400, "ARQUIVOS_AUSENTES", "O memorial deste projeto não foi encontrado.")

  let resultado: Awaited<ReturnType<typeof lerDocumentosDoProjeto>>
  try {
    resultado = await lerDocumentosDoProjeto(ctx.project.source_pdf_path, ctx.project.planta_path)
  } catch (e) {
    if (e instanceof ErroLeitura) return erroApi(e.status, e.codigo, e.message)
    return erroApi(500, "ERRO_LEITURA", "Não foi possível ler os documentos. Tente novamente.")
  }

  const { dados, status } = resultado
  const { error } = await createAdminClient()
    .from("projects")
    .update({
      azimute_dados: dados,
      azimute_status: status,
      utm_zone: `${dados.fuso}${dados.hemisferio}`,
      utm_hemisphere: dados.hemisferio,
      datum: "SIRGAS2000",
    })
    .eq("id", ctx.id)
    .eq("user_id", ctx.userId)
  if (error) return erroApi(500, "ERRO_BANCO", "Os documentos foram lidos, mas não foi possível salvar o resultado.")

  revalidatePath(`/dashboard/projeto/${ctx.id}`)
  return Response.json({ ok: true, status, dados }, { headers: { "Cache-Control": "no-store" } })
}

/** Salva a revisão do usuário (rascunho) ou confirma a tabela. O servidor recalcula e valida tudo. */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await carregar(params)
  if (!ctx.ok) return ctx.response

  const corpo = salvarRevisaoSchema.safeParse(await request.json().catch(() => null))
  if (!corpo.success) return erroApi(400, "ENTRADA_INVALIDA", "Confira os campos da tabela: há valores inválidos.")
  const { cabecalho, fuso, hemisferio, segmentos, confirmar } = corpo.data

  const atual = azimuteDadosSchema.safeParse(ctx.project.azimute_dados)
  const planta = atual.success ? atual.data.planta : {}
  const segs: Segmento[] = segmentos.map((s) => ({ ...s }))

  if (confirmar) {
    const problemas = validarSegmentos(segs)
    if (problemas.length) return erroApi(422, "TABELA_INVALIDA", problemas[0].msg)
    const relatorio = relatorioPoligonal(segs, { areaHa: cabecalho.areaHa, perimetroM: cabecalho.perimetroM }, planta)
    if (!relatorio.calculavel || relatorio.situacao === "erro") {
      return erroApi(422, "RELATORIO_COM_ERRO", "O relatório de validação tem erro. Corrija a tabela antes de confirmar.")
    }
  }

  const agora = new Date().toISOString()
  const novo: AzimuteDados = {
    versao: 1,
    cabecalho,
    planta,
    fuso,
    hemisferio,
    datum: "SIRGAS 2000",
    segmentos,
    avisosLeitura: atual.success ? atual.data.avisosLeitura : [],
    ...(atual.success && atual.data.coordenadas ? { coordenadas: atual.data.coordenadas } : {}),
    lidoEm: atual.success ? atual.data.lidoEm : agora,
    revisadoEm: confirmar ? agora : null,
    // a posição calculada vale para a tabela anterior: ao salvar de novo, é preciso localizar outra vez
    localizacao: undefined,
  }
  const status = confirmar ? "revisado" : "lido"

  const { error } = await createAdminClient()
    .from("projects")
    .update({
      azimute_dados: novo,
      azimute_status: status,
      utm_zone: `${fuso}${hemisferio}`,
      utm_hemisphere: hemisferio,
      datum: "SIRGAS2000",
    })
    .eq("id", ctx.id)
    .eq("user_id", ctx.userId)
  if (error) return erroApi(500, "ERRO_BANCO", "Não foi possível salvar a revisão.")

  revalidatePath(`/dashboard/projeto/${ctx.id}`)
  return Response.json({ ok: true, status, dados: novo }, { headers: { "Cache-Control": "no-store" } })
}
