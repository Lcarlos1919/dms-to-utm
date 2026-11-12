import { revalidatePath } from "next/cache"
import { erroApi } from "@/lib/api/projetos"
import { carregarProjetoAzimute } from "@/lib/azimute/contexto"
import { localizarNaBase } from "@/lib/azimute/localizar"
import { azimuteDadosSchema, type AzimuteDados } from "@/lib/azimute/tipos"
import { createAdminClient } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const maxDuration = 60

type Preferencia = "auto" | "banco" | "geoportal"

/** Preferência e tempo limite definidos no /admin (app_settings.fundiario_config). Sem linha ou com erro, valem os padrões. */
async function lerConfigFundiario(): Promise<{ preferencia: Preferencia; timeoutMs: number }> {
  const padrao = { preferencia: "auto" as Preferencia, timeoutMs: 8000 }
  try {
    const { data } = await createAdminClient().from("app_settings").select("value").eq("key", "fundiario_config").maybeSingle()
    const v = (data?.value ?? {}) as { preferencia?: unknown; timeout_ms?: unknown }
    const preferencia = v.preferencia === "banco" || v.preferencia === "geoportal" || v.preferencia === "auto" ? v.preferencia : padrao.preferencia
    const t = Number(v.timeout_ms)
    const timeoutMs = Number.isFinite(t) && t >= 1000 && t <= 20000 ? t : padrao.timeoutMs
    return { preferencia, timeoutMs }
  } catch {
    return padrao
  }
}

/** Procura o lote na base fundiária (SIGLO: banco + GeoPortal), refina com o SIGEF e grava as posições candidatas. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await carregarProjetoAzimute(params)
  if (!ctx.ok) return ctx.response
  if (ctx.project.azimute_status !== "revisado") {
    return erroApi(409, "TABELA_NAO_CONFIRMADA", "Confirme a tabela de segmentos antes de localizar o lote.")
  }
  const atual = azimuteDadosSchema.safeParse(ctx.project.azimute_dados)
  if (!atual.success) return erroApi(422, "DADOS_INVALIDOS", "Os dados do memorial estão inválidos. Leia os documentos de novo.")

  const admin = createAdminClient()
  const config = await lerConfigFundiario()

  let localizacao: Awaited<ReturnType<typeof localizarNaBase>>
  try {
    localizacao = await localizarNaBase(atual.data, {
      preferencia: config.preferencia,
      timeoutMs: config.timeoutMs,
      rpc: async (fn, args) => {
        const r = await admin.rpc(fn, args)
        return { data: r.data, error: r.error ? { message: r.error.message } : null }
      },
    })
  } catch {
    return erroApi(500, "ERRO_LOCALIZACAO", "Não foi possível localizar o lote agora. Tente novamente em instantes.")
  }

  const novo: AzimuteDados = { ...atual.data, localizacao }
  const { error } = await admin.from("projects").update({ azimute_dados: novo }).eq("id", ctx.id).eq("user_id", ctx.userId)
  if (error) return erroApi(500, "ERRO_BANCO", "O lote foi localizado, mas não foi possível salvar o resultado.")

  revalidatePath(`/dashboard/projeto/${ctx.id}`)
  return Response.json({ ok: true, localizacao }, { headers: { "Cache-Control": "no-store" } })
}
