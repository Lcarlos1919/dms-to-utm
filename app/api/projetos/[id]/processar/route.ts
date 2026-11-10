import { createAdminClient } from "@/lib/supabase/server"
import { processMemorial } from "@/lib/engine"
import { erroApi, identidadeApi } from "@/lib/api/projetos"

export const runtime = "nodejs"
export const maxDuration = 60

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const userId = await identidadeApi()
  if (!userId) return erroApi(401, "NAO_AUTORIZADO", "Entre na sua conta.")

  const { id } = await params
  const processed = await processMemorial(id, userId)
  if (!processed.ok) return erroApi(processed.status, processed.error, processed.message)

  const { data: project, error } = await createAdminClient()
    .from("projects")
    .select("id,name,status,datum,epsg,utm_zone,utm_hemisphere,area_m2,perimeter_m,is_closed,error_code,error_message")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle()

  if (error || !project) {
    return erroApi(500, "ERRO_BANCO", "O memorial foi processado, mas não foi possível carregar o projeto.")
  }

  return Response.json({
    projeto: project,
    vertices: processed.result.vertices,
    avisos: processed.result.avisos,
  })
}
