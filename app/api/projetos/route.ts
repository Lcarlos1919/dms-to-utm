import { createAdminClient } from "@/lib/supabase/server"
import { erroApi, identidadeApi } from "@/lib/api/projetos"
import { getUsageStatus } from "@/lib/usage"
import { z } from "zod"

export const runtime = "nodejs"
const schema = z.object({ nome: z.string().trim().min(1).max(120) })

export async function GET() {
  const userId = await identidadeApi()
  if (!userId) return erroApi(401, "NAO_AUTORIZADO", "Entre na sua conta.")

  const { data, error } = await createAdminClient()
    .from("projects")
    .select("id,name,status,area_m2,created_at,updated_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })

  if (error) return erroApi(500, "ERRO_BANCO", "Não foi possível carregar os projetos.")
  return Response.json(data ?? [])
}

export async function POST(request: Request) {
  const userId = await identidadeApi()
  if (!userId) return erroApi(401, "NAO_AUTORIZADO", "Entre na sua conta.")

  const body = schema.safeParse(await request.json().catch(() => null))
  if (!body.success) return erroApi(400, "ENTRADA_INVALIDA", "Informe um nome válido para o projeto.")

  let usage: Awaited<ReturnType<typeof getUsageStatus>>
  try {
    usage = await getUsageStatus(userId)
  } catch {
    return erroApi(500, "ERRO_PERMISSAO", "Não foi possível verificar as permissões da conta.")
  }

  if (!usage.canCreateMemorials) {
    return erroApi(403, "PERMISSAO_NEGADA", "A criação de memoriais está bloqueada para esta conta.")
  }
  if (!usage.canCreate) {
    return erroApi(403, "COTA_EXCEDIDA", "Você atingiu o limite de memoriais do plano Grátis neste mês.")
  }

  const db = createAdminClient()
  const id = crypto.randomUUID()
  const path = `${userId}/${id}/arquivo.pdf`
  const { data: upload, error: uploadError } = await db.storage.from("memoriais").createSignedUploadUrl(path)
  if (uploadError || !upload) return erroApi(500, "UPLOAD_INDISPONIVEL", "Não foi possível preparar o upload do PDF.")

  const { error } = await db.from("projects").insert({
    id,
    user_id: userId,
    name: body.data.nome,
    status: "draft",
    source_pdf_path: path,
  })
  if (error) return erroApi(500, "ERRO_BANCO", "Não foi possível criar o projeto.")

  return Response.json({ id, upload: { path, token: upload.token } }, { status: 201 })
}
