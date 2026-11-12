import { z } from "zod"
import { revalidatePath } from "next/cache"
import { erroApi } from "@/lib/api/projetos"
import { carregarProjetoAzimute } from "@/lib/azimute/contexto"
import { azimuteDadosSchema, type AzimuteDados } from "@/lib/azimute/tipos"
import { createAdminClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

const corpoSchema = z.object({ indice: z.number().int().min(0).max(4) })

async function gravar(ctx: { id: string; userId: string }, dados: AzimuteDados) {
  const { error } = await createAdminClient().from("projects").update({ azimute_dados: dados }).eq("id", ctx.id).eq("user_id", ctx.userId)
  if (!error) revalidatePath(`/dashboard/projeto/${ctx.id}`)
  return !error
}

/** O usuário confirma qual candidata é a posição certa. Só o índice vem do navegador; os vértices são os já salvos. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await carregarProjetoAzimute(params)
  if (!ctx.ok) return ctx.response
  if (ctx.project.azimute_status !== "revisado") return erroApi(409, "TABELA_NAO_CONFIRMADA", "Confirme a tabela de segmentos antes.")

  const corpo = corpoSchema.safeParse(await request.json().catch(() => null))
  if (!corpo.success) return erroApi(400, "ENTRADA_INVALIDA", "Escolha uma das posições da lista.")
  const atual = azimuteDadosSchema.safeParse(ctx.project.azimute_dados)
  const loc = atual.success ? atual.data.localizacao : undefined
  if (!atual.success || !loc || loc.estado !== "encontrado") return erroApi(409, "SEM_LOCALIZACAO", "Localize o lote antes de confirmar a posição.")
  if (corpo.data.indice >= loc.candidatas.length) return erroApi(400, "ENTRADA_INVALIDA", "Essa posição não existe na lista.")

  const novo: AzimuteDados = { ...atual.data, localizacao: { ...loc, confirmada: { indice: corpo.data.indice, confirmadoEm: new Date().toISOString() } } }
  if (!(await gravar(ctx, novo))) return erroApi(500, "ERRO_BANCO", "Não foi possível salvar a posição.")
  return Response.json({ ok: true, localizacao: novo.localizacao }, { headers: { "Cache-Control": "no-store" } })
}

/** Desfaz a confirmação (para escolher outra posição). */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await carregarProjetoAzimute(params)
  if (!ctx.ok) return ctx.response
  const atual = azimuteDadosSchema.safeParse(ctx.project.azimute_dados)
  const loc = atual.success ? atual.data.localizacao : undefined
  if (!atual.success || !loc) return erroApi(409, "SEM_LOCALIZACAO", "Não há posição para desfazer.")

  const novo: AzimuteDados = { ...atual.data, localizacao: { ...loc, confirmada: null } }
  if (!(await gravar(ctx, novo))) return erroApi(500, "ERRO_BANCO", "Não foi possível desfazer a confirmação.")
  return Response.json({ ok: true, localizacao: novo.localizacao }, { headers: { "Cache-Control": "no-store" } })
}
