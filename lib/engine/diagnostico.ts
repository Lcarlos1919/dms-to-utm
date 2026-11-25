import "server-only"

import { createAdminClient } from "@/lib/supabase/server"

// Diagnóstico técnico do processamento de um memorial: cada etapa vira um evento.
// É gravado em projects.diagnostico (jsonb) e mostrado no admin. Não guarda o texto do PDF
// nem chaves de API: só contagens, códigos, avisos e a pilha resumida do erro.

export type NivelEvento = "info" | "aviso" | "erro"

export interface EventoDiagnostico {
  hora: string
  etapa: string
  nivel: NivelEvento
  mensagem: string
  dados?: Record<string, unknown>
}

export interface Diagnostico {
  versao: 1
  projectId: string
  geradoEm: string
  eventos: EventoDiagnostico[]
}

const MAX_EVENTOS = 200

export function criarDiagnostico(projectId: string): Diagnostico {
  return { versao: 1, projectId, geradoEm: new Date().toISOString(), eventos: [] }
}

export function registrar(
  diagnostico: Diagnostico,
  etapa: string,
  nivel: NivelEvento,
  mensagem: string,
  dados?: Record<string, unknown>,
) {
  if (diagnostico.eventos.length >= MAX_EVENTOS) return
  diagnostico.eventos.push({ hora: new Date().toISOString(), etapa, nivel, mensagem, ...(dados ? { dados } : {}) })
}

/** Conta palavras-chave do texto lido: ajuda a ver por que a tabela de vértices não foi achada. */
export function contarPistas(texto: string): Record<string, number> {
  const contar = (re: RegExp) => (texto.match(re) ?? []).length
  return {
    caracteres: texto.length,
    azimute: contar(/azimute/gi),
    rumo: contar(/rumo/gi),
    distancia: contar(/dist[âa]ncia/gi),
    vertice: contar(/v[ée]rtice/gi),
    ponto: contar(/\bponto\b/gi),
    coordenadas: contar(/coordenad/gi),
    latitude: contar(/lat(itude)?\b/gi),
    grau: contar(/[°º˚]/g),
    metros: contar(/\bm\b|metros/gi),
  }
}

/** Resume a pilha do erro em poucas linhas (o suficiente para achar o ponto do código). */
export function resumirPilha(erro: unknown): string[] {
  if (!(erro instanceof Error) || !erro.stack) return []
  return erro.stack.split("\n").slice(0, 8).map((linha) => linha.trim())
}

/**
 * Grava o diagnóstico sem nunca derrubar o processamento: se a coluna ainda não existir
 * (migração 009 não rodada) ou o banco falhar, só registra no log do servidor.
 */
export async function gravarDiagnostico(projectId: string, userId: string, diagnostico: Diagnostico) {
  try {
    const { error } = await createAdminClient()
      .from("projects")
      .update({ diagnostico })
      .eq("id", projectId)
      .eq("user_id", userId)
    if (error) console.error("[diagnostico] falha ao gravar", JSON.stringify({ projectId, erro: error.message }))
  } catch (erro) {
    console.error("[diagnostico] exceção ao gravar", JSON.stringify({ projectId, erro: String(erro) }))
  }
}
