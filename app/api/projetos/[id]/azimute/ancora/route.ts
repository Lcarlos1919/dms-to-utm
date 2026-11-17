import { z } from "zod"
import { revalidatePath } from "next/cache"
import { erroApi, identidadeApi } from "@/lib/api/projetos"
import { canUseFeature } from "@/lib/features"
import { createAdminClient } from "@/lib/supabase/server"
import { localizarNaBase } from "@/lib/azimute/base"
import { carregarProjetoAzimute, finalizarAzimute } from "@/lib/azimute/processar"
import { azimuteDadosSchema, definirAncoraSchema, type AzimuteDados } from "@/lib/azimute/tipos"
import { validarSegmentos } from "@/lib/vertix-core/revisao"

export const runtime = "nodejs"
export const maxDuration = 60

const idSchema = z.string().uuid()
const buscarSchema = z.object({
  lote: z.string().trim().min(1).max(40),
  gleba: z.string().trim().max(40).optional(),
  nomeGleba: z.string().trim().max(120).optional(),
})

type Ctx =
  | { ok: true; userId: string; id: string; status: string; dados: AzimuteDados }
  | { ok: false; response: Response }

async function carregar(params: Promise<{ id: string }>): Promise<Ctx> {
  const userId = await identidadeApi()
  if (!userId) return { ok: false, response: erroApi(401, "NAO_AUTORIZADO", "Entre na sua conta.") }
  const id = idSchema.safeParse((await params).id)
  if (!id.success) return { ok: false, response: erroApi(400, "ENTRADA_INVALIDA", "Projeto inválido.") }
  let projeto: Awaited<ReturnType<typeof carregarProjetoAzimute>>
  try {
    projeto = await carregarProjetoAzimute(id.data, userId)
  } catch {
    return { ok: false, response: erroApi(500, "ERRO_BANCO", "Não foi possível carregar o projeto.") }
  }
  if (!projeto) return { ok: false, response: erroApi(404, "NAO_ENCONTRADO", "Projeto não encontrado.") }
  if (projeto.memorial_type !== "azimute") return { ok: false, response: erroApi(400, "TIPO_INCOMPATIVEL", "Este projeto não é do tipo azimute.") }
  if (!(await canUseFeature(userId, "memorial_azimute"))) {
    return { ok: false, response: erroApi(403, "FEATURE_BLOQUEADA", "O memorial por azimute não está habilitado para este plano.") }
  }
  const dados = azimuteDadosSchema.safeParse(projeto.azimute_dados)
  if (!dados.success) return { ok: false, response: erroApi(409, "SEM_TABELA", "Leia os documentos antes de definir o ponto de partida.") }
  if (validarSegmentos(dados.data.segmentos).length) {
    return { ok: false, response: erroApi(409, "TABELA_INVALIDA", "Corrija e confirme a tabela de segmentos antes de definir o ponto de partida.") }
  }
  return { ok: true, userId, id: id.data, status: projeto.status, dados: dados.data }
}

/** D3: o usuário define o ponto de partida (base, coordenada digitada ou clique no mapa). */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await carregar(params)
  if (!ctx.ok) return ctx.response
  const corpo = definirAncoraSchema.safeParse(await request.json().catch(() => null))
  if (!corpo.success) return erroApi(400, "ENTRADA_INVALIDA", "Informe o vértice e uma coordenada UTM válida.")
  const a = corpo.data
  const r = await finalizarAzimute(ctx.id, ctx.userId, ctx.dados, ctx.status, {
    fonte: a.fonte,
    vertice: a.vertice,
    este: a.este,
    norte: a.norte,
    fuso: a.fuso,
    hemisferio: a.hemisferio,
    automatica: false,
    detalhe: a.fonte === "base_fundiaria" ? "Posição escolhida pelo usuário entre as sugeridas pela base fundiária." : undefined,
  })
  if (!r.ok) return erroApi(r.status, r.codigo, r.mensagem)
  return Response.json(r, { headers: { "Cache-Control": "no-store" } })
}

/** D2 sob demanda: busca o lote informado na base fundiária e devolve as posições candidatas. */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await carregar(params)
  if (!ctx.ok) return ctx.response
  const corpo = buscarSchema.safeParse(await request.json().catch(() => null))
  if (!corpo.success) return erroApi(400, "ENTRADA_INVALIDA", "Informe ao menos o número do lote.")

  let r: Awaited<ReturnType<typeof localizarNaBase>>
  try {
    r = await localizarNaBase(
      { lote: corpo.data.lote, gleba: corpo.data.gleba || undefined, nomeGleba: corpo.data.nomeGleba || undefined },
      ctx.dados.segmentos,
    )
  } catch {
    return erroApi(502, "BASE_INDISPONIVEL", "Não foi possível consultar a base fundiária agora.")
  }

  const dados: AzimuteDados = {
    ...ctx.dados,
    base: r.base,
    candidatas: r.candidatas,
    ...(r.base ? { fuso: r.base.fuso, hemisferio: r.base.hemisferio } : {}),
  }
  const { error } = await createAdminClient()
    .from("projects")
    .update({ azimute_dados: dados })
    .eq("id", ctx.id)
    .eq("user_id", ctx.userId)
  if (error) return erroApi(500, "ERRO_BANCO", "Não foi possível salvar o resultado da busca.")

  revalidatePath(`/dashboard/projeto/${ctx.id}`)
  return Response.json(
    { ok: true, encontrado: Boolean(r.base), motivo: r.motivo, avisos: r.avisos, sugestaoSegura: Boolean(r.decisao?.automatica) },
    { headers: { "Cache-Control": "no-store" } },
  )
}
