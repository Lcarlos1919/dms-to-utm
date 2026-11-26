// Regras do plano (puras, sem banco). O servidor carrega o perfil e o uso; aqui fica a decisão.
// Grátis: 3 memoriais no total; no máximo 1 por azimute, 2 digitalizados (OCR), 3 comuns.
// Pro: 30 dias a partir da confirmação do pagamento; ilimitado enquanto estiver válido.
export const DIAS_PRO = 30
export const TOTAL_GRATIS = 3
export const LIMITE_GRATIS_POR_CATEGORIA = { azimute: 1, ocr: 2, comum: 3 } as const

export type CategoriaMemorial = keyof typeof LIMITE_GRATIS_POR_CATEGORIA
export const CATEGORIAS: CategoriaMemorial[] = ["azimute", "ocr", "comum"]
export const ROTULO_CATEGORIA: Record<CategoriaMemorial, string> = {
  azimute: "Por azimute",
  ocr: "Digitalizado (OCR)",
  comum: "Comum",
}

export interface PerfilPlano {
  plan?: string | null
  plan_expires_at?: string | null
  bonus_credits?: number | null
}

export interface SituacaoPlano {
  plano: "pro" | "gratis"
  proAte: string | null
  diasRestantes: number | null
  totalUsado: number
  /** Grátis: total de memoriais (3 + bônus). Pro: null (ilimitado). */
  totalLimite: number | null
  /** Grátis: uso e limite por categoria. Pro: limite null (ilimitado). */
  porCategoria: Record<CategoriaMemorial, { usado: number; limite: number | null }>
  /** Pode começar um memorial novo (ainda há cota, ou Pro ativo). */
  podeCriar: boolean
}

const MS_DIA = 24 * 60 * 60 * 1000

export function proAtivo(perfil: PerfilPlano, agora: Date): boolean {
  if (perfil.plan !== "pro" || !perfil.plan_expires_at) return false
  const expira = Date.parse(perfil.plan_expires_at)
  return Number.isFinite(expira) && expira > agora.getTime()
}

/** Situação da conta a partir do perfil e das categorias dos memoriais já contados (uma entrada por memorial). */
export function calcularSituacao(perfil: PerfilPlano, usos: CategoriaMemorial[], agora: Date): SituacaoPlano {
  const pro = proAtivo(perfil, agora)
  const porCategoria = {} as SituacaoPlano["porCategoria"]
  for (const categoria of CATEGORIAS) {
    const usado = usos.filter((u) => u === categoria).length
    porCategoria[categoria] = { usado, limite: pro ? null : LIMITE_GRATIS_POR_CATEGORIA[categoria] }
  }
  const totalUsado = usos.length
  const totalLimite = pro ? null : TOTAL_GRATIS + Math.max(0, Math.floor(Number(perfil.bonus_credits ?? 0)))
  const diasRestantes = pro ? Math.max(0, Math.ceil((Date.parse(perfil.plan_expires_at as string) - agora.getTime()) / MS_DIA)) : null
  return {
    plano: pro ? "pro" : "gratis",
    proAte: pro ? (perfil.plan_expires_at ?? null) : null,
    diasRestantes,
    totalUsado,
    totalLimite,
    porCategoria,
    podeCriar: pro || totalUsado < (totalLimite ?? 0),
  }
}

/**
 * Motivo do bloqueio de um memorial desta categoria, ou null se ele pode ser processado.
 * `jaContado`: o projeto já consumiu cota (reprocessar não cobra de novo).
 */
export function motivoBloqueio(situacao: SituacaoPlano, categoria: CategoriaMemorial, jaContado: boolean): string | null {
  if (situacao.plano === "pro" || jaContado) return null
  if (situacao.totalLimite !== null && situacao.totalUsado >= situacao.totalLimite) {
    return "Você já usou os memoriais do plano Grátis. Assine o Pro para continuar."
  }
  const cat = situacao.porCategoria[categoria]
  if (cat.limite !== null && cat.usado >= cat.limite) {
    if (categoria === "azimute") return "O plano Grátis inclui 1 memorial por azimute, e ele já foi usado. Assine o Pro para continuar."
    if (categoria === "ocr") return "O plano Grátis inclui 2 memoriais digitalizados (OCR), e eles já foram usados. Assine o Pro para continuar."
    return "O plano Grátis inclui 3 memoriais comuns, e eles já foram usados. Assine o Pro para continuar."
  }
  return null
}

/** Nova data de fim do Pro: 30 dias a partir de agora, ou a partir do fim atual se ainda estiver válido (renovação soma). */
export function fimDoProApos(expiraAtual: string | null | undefined, agora: Date): Date {
  const atual = expiraAtual ? Date.parse(expiraAtual) : NaN
  const base = Number.isFinite(atual) && atual > agora.getTime() ? atual : agora.getTime()
  return new Date(base + DIAS_PRO * MS_DIA)
}
