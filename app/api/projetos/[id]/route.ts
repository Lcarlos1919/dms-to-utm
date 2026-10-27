import { createAdminClient } from "@/lib/supabase/server"
import { erroApi, identidadeApi } from "@/lib/api/projetos"
import { excluirProjetoCompleto } from "@/lib/projects/delete-project"
import { linhaParaVertice } from "@/lib/topocad-db/mapeamento"

export const runtime = "nodejs"

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await identidadeApi()
  if (!userId) return erroApi(401, "NAO_AUTORIZADO", "Entre na sua conta.")

  const { id } = await params
  const db = createAdminClient()
  const { data: projeto } = await db
    .from("projects")
    .select("id,user_id,name,status,original_filename,source_pdf_path,datum,epsg,utm_zone,utm_hemisphere,area_m2,perimeter_m,closure_error_m,is_closed,error_code,error_message,created_at,updated_at")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle()

  if (!projeto) return erroApi(404, "NAO_ENCONTRADO", "Projeto não encontrado.")

  const { data: rows, error } = await db
    .from("project_vertices")
    .select("project_id,seq,code,lon_dms,lat_dms,lon_dec,lat_dec,altitude_m,vante_code,azimuth_dms,distance_m,confrontacao,easting,northing,edited")
    .eq("project_id", id)
    .order("seq")

  if (error) return erroApi(500, "ERRO_BANCO", "Não foi possível carregar os vértices.")
  return Response.json({ projeto, vertices: (rows ?? []).map(linhaParaVertice) })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await identidadeApi()
  if (!userId) return erroApi(401, "NAO_AUTORIZADO", "Entre na sua conta.")

  const { id } = await params
  const db = createAdminClient()
  const { data: profile, error: profileError } = await db
    .from("profiles")
    .select("can_delete_memorials")
    .eq("user_id", userId)
    .maybeSingle()

  if (profileError) return erroApi(500, "ERRO_BANCO", "Não foi possível verificar as permissões da conta.")
  if (profile && profile.can_delete_memorials === false) {
    return erroApi(403, "PERMISSAO_NEGADA", "A exclusão de memoriais está bloqueada para esta conta.")
  }

  try {
    const result = await excluirProjetoCompleto(id, userId)
    if (!result.ok) return erroApi(404, "NAO_ENCONTRADO", "Projeto não encontrado.")
  } catch {
    return erroApi(500, "ERRO_EXCLUSAO", "Não foi possível excluir o projeto e seus arquivos.")
  }

  return new Response(null, { status: 204 })
}
