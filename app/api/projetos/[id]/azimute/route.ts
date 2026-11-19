import { z } from "zod"
import { revalidatePath } from "next/cache"
import { erroApi, identidadeApi } from "@/lib/api/projetos"
import { canUseFeature } from "@/lib/features"
import { createAdminClient } from "@/lib/supabase/server"
import { continuarAzimute, processarAzimute } from "@/lib/azimute/processar"
import { azimuteDadosSchema, salvarRevisaoSchema, type AzimuteDados } from "@/lib/azimute/tipos"
import type { Segmento } from "@/lib/vertix-core/memorial"
import { relatorioPoligonal, validarSegmentos } from "@/lib/vertix-core/revisao"

export const runtime = "nodejs"
export const maxDuration = 300

const idSchema = z.string().uuid()

type Contexto =
  | { ok: true; userId: string; id: string; project: { id: string; status: string; source_pdf_path: string | null; planta_path: string | null; azimute_dados: unknown; azimute_status: string } }
  | { ok: false; response: Response }

async function carregar(params: Promise<{ id: string }>): Promise<Contexto> {
  const userId = await identidadeApi()
  if (!userId) return { ok: false, response: erroApi(401, "NAO_AUTORIZADO", "Entre na sua conta.") }
  const id = idSchema.safeParse((await params).id)
  if (!id.success) return { ok: false, response: erroApi(400, "ENTRADA_INVALIDA", "Projeto inválido.") }

  const { data: project, error } = await createAdminClient()
    .from("projects")
    .select("id,status,memorial_type,source_pdf_path,planta_path,azimute_dados,azimute_status")
    .eq("id", id.data)
    .eq("user_id", userId)
    .maybeSingle()
  if (error) return { ok: false, response: erroApi(500, "ERRO_BANCO", "Não foi possível carregar o projeto.") }
  if (!project) return { ok: false, response: erroApi(404, "NAO_ENCONTRADO", "Projeto não encontrado.") }
  if (project.memorial_type !== "azimute") {
    return { ok: false, response: erroApi(400, "TIPO_INCOMPATIVEL", "Este projeto não é do tipo azimute.") }
  }
  if (!(await canUseFeature(userId, "memorial_azimute"))) {
    return { ok: false, response: erroApi(403, "FEATURE_BLOQUEADA", "O memorial por azimute não está habilitado para este plano.") }
  }
  return { ok: true, userId, id: id.data, project }
}

/** Lê os dois PDFs e tenta deixar o memorial pronto sozinho (leitura → validação → posicionamento). */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await carregar(params)
  if (!ctx.ok) return ctx.response
  const r = await processarAzimute(ctx.id, ctx.userId, { reler: true })
  if (!r.ok) return erroApi(r.status, r.codigo, r.mensagem)
  revalidatePath(`/dashboard/projeto/${ctx.id}`)
  return Response.json(r, { headers: { "Cache-Control": "no-store" } })
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
  const anterior = atual.success ? atual.data : null
  const novo: AzimuteDados = {
    ...(anterior ?? {}),
    versao: 1,
    cabecalho,
    planta,
    fuso,
    hemisferio,
    datum: "SIRGAS 2000",
    segmentos,
    avisosLeitura: anterior?.avisosLeitura ?? [],
    lidoEm: anterior?.lidoEm ?? agora,
    revisadoEm: confirmar ? agora : null,
    // Ao salvar, o fuso passa a ser o confirmado pelo usuário.
    fusoDeclarado: true,
    ancora: null,
  }

  if (confirmar) {
    const r = await continuarAzimute(ctx.id, ctx.userId, novo, ctx.project.status, { confirmadoPeloUsuario: true })
    if (!r.ok) return erroApi(r.status, r.codigo, r.mensagem)
    revalidatePath(`/dashboard/projeto/${ctx.id}`)
    return Response.json(r, { headers: { "Cache-Control": "no-store" } })
  }

  const { error } = await createAdminClient()
    .from("projects")
    .update({
      azimute_dados: novo,
      azimute_status: "lido",
      status: ctx.project.status === "ready" ? "draft" : ctx.project.status,
      utm_zone: `${fuso}${hemisferio}`,
      utm_hemisphere: hemisferio,
      datum: "SIRGAS 2000",
    })
    .eq("id", ctx.id)
    .eq("user_id", ctx.userId)
  if (error) return erroApi(500, "ERRO_BANCO", "Não foi possível salvar a revisão.")

  revalidatePath(`/dashboard/projeto/${ctx.id}`)
  return Response.json({ ok: true, etapa: "revisao", mensagem: "Rascunho salvo." }, { headers: { "Cache-Control": "no-store" } })
}
