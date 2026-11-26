import "server-only"

import { createAdminClient } from "@/lib/supabase/server"
import {
  calcularSituacao,
  fimDoProApos,
  motivoBloqueio,
  proAtivo,
  type CategoriaMemorial,
  type PerfilPlano,
  type SituacaoPlano,
} from "@/lib/vertix-core/plano"
import { incrementUsage } from "@/lib/usage"

export type { CategoriaMemorial, SituacaoPlano } from "@/lib/vertix-core/plano"

async function lerPerfil(userId: string): Promise<PerfilPlano> {
  const { data, error } = await createAdminClient()
    .from("profiles")
    .select("plan,plan_expires_at,bonus_credits")
    .eq("user_id", userId)
    .maybeSingle()
  if (error) throw new Error("Não foi possível consultar o plano da conta.")
  return data ?? {}
}

/** Situação do plano: Pro ativo ou cota do Grátis (memoriais já contados por categoria). */
export async function situacaoDoPlano(userId: string, agora = new Date()): Promise<SituacaoPlano> {
  const db = createAdminClient()
  const [perfil, { data: usos, error }] = await Promise.all([
    lerPerfil(userId),
    db.from("memorial_uso").select("categoria").eq("user_id", userId),
  ])
  if (error) throw new Error("Não foi possível consultar os memoriais usados.")
  return calcularSituacao(perfil, (usos ?? []).map((u) => u.categoria as CategoriaMemorial), agora)
}

/**
 * Pode processar este memorial agora? `projectId` evita cobrar de novo um projeto já contado.
 * Devolve a mensagem para o usuário quando não pode (sem detalhes técnicos).
 */
export async function verificarCota(userId: string, categoria: CategoriaMemorial, projectId?: string): Promise<{ ok: true } | { ok: false; mensagem: string }> {
  const db = createAdminClient()
  let jaContado = false
  if (projectId) {
    const { data, error } = await db.from("memorial_uso").select("project_id").eq("project_id", projectId).maybeSingle()
    if (error) throw new Error("Não foi possível consultar a cota.")
    jaContado = Boolean(data)
  }
  const situacao = await situacaoDoPlano(userId)
  const mensagem = motivoBloqueio(situacao, categoria, jaContado)
  return mensagem ? { ok: false, mensagem } : { ok: true }
}

/**
 * Registra que o memorial foi processado com sucesso. No Grátis, cada projeto consome cota uma única vez;
 * no Pro, não consome cota (só entra na contagem mensal do admin).
 */
export async function registrarUso(projectId: string, userId: string, categoria: CategoriaMemorial): Promise<void> {
  const db = createAdminClient()
  const perfil = await lerPerfil(userId)
  if (proAtivo(perfil, new Date())) {
    await incrementUsage(userId)
    return
  }
  const { data, error } = await db
    .from("memorial_uso")
    .upsert({ project_id: projectId, user_id: userId, categoria }, { onConflict: "project_id", ignoreDuplicates: true })
    .select("project_id")
  if (error) throw new Error("Não foi possível registrar o uso do plano.")
  // Projeto já contado (reprocessado): não soma de novo na contagem mensal.
  if (data && data.length > 0) await incrementUsage(userId)
}

/** Confirmado o pagamento: Pro por 30 dias a partir de agora (ou soma ao período que ainda falta). */
export async function ativarPro(userId: string, agora = new Date()): Promise<string> {
  const db = createAdminClient()
  const perfil = await lerPerfil(userId)
  const fim = fimDoProApos(perfil.plan_expires_at, agora).toISOString()
  const { error } = await db
    .from("profiles")
    .update({ plan: "pro", plan_expires_at: fim, plan_started_at: perfil.plan === "pro" ? undefined : agora.toISOString(), updated_at: agora.toISOString() })
    .eq("user_id", userId)
  if (error) throw new Error("Não foi possível ativar o Pro.")
  return fim
}

/** Estorno ou chargeback: o Pro termina agora. */
export async function encerrarPro(userId: string, agora = new Date()): Promise<void> {
  const { error } = await createAdminClient()
    .from("profiles")
    .update({ plan: "free", plan_expires_at: agora.toISOString(), updated_at: agora.toISOString() })
    .eq("user_id", userId)
  if (error) throw new Error("Não foi possível encerrar o Pro.")
}
