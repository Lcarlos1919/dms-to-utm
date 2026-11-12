import "server-only"

import { z } from "zod"
import { erroApi, identidadeApi } from "@/lib/api/projetos"
import { canUseFeature } from "@/lib/features"
import { createAdminClient } from "@/lib/supabase/server"

const idSchema = z.string().uuid()

export type Contexto =
  | { ok: true; userId: string; id: string; project: { id: string; source_pdf_path: string | null; planta_path: string | null; azimute_dados: unknown; azimute_status: string } }
  | { ok: false; response: Response }

/** Autentica, valida o id e garante que o projeto é do usuário, é do tipo azimute e o plano permite a ferramenta. */
export async function carregarProjetoAzimute(params: Promise<{ id: string }>): Promise<Contexto> {
  const userId = await identidadeApi()
  if (!userId) return { ok: false, response: erroApi(401, "NAO_AUTORIZADO", "Entre na sua conta.") }
  const id = idSchema.safeParse((await params).id)
  if (!id.success) return { ok: false, response: erroApi(400, "ENTRADA_INVALIDA", "Projeto inválido.") }

  const { data: project, error } = await createAdminClient()
    .from("projects")
    .select("id,memorial_type,source_pdf_path,planta_path,azimute_dados,azimute_status")
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
