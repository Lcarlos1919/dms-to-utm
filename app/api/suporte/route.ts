import { z } from "zod"
import { createAdminClient } from "@/lib/supabase/server"
import { erroApi, identidadeApi } from "@/lib/api/projetos"

export const runtime = "nodejs"

const mensagemSchema = z.object({ mensagem: z.string().trim().min(1, "Escreva uma mensagem.").max(2000, "A mensagem pode ter até 2000 caracteres.") })

export async function GET() {
  const userId = await identidadeApi()
  if (!userId) return erroApi(401, "NAO_AUTORIZADO", "Entre na sua conta.")
  const { data, error } = await createAdminClient()
    .from("suporte_mensagens")
    .select("id,autor,mensagem,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true })
    .limit(200)
  if (error) return erroApi(500, "ERRO_BANCO", "Não foi possível carregar as mensagens.")
  return Response.json({ mensagens: data ?? [] }, { headers: { "Cache-Control": "no-store" } })
}

export async function POST(request: Request) {
  const userId = await identidadeApi()
  if (!userId) return erroApi(401, "NAO_AUTORIZADO", "Entre na sua conta.")
  const body = mensagemSchema.safeParse(await request.json().catch(() => null))
  if (!body.success) return erroApi(400, "ENTRADA_INVALIDA", body.error.issues[0]?.message ?? "Mensagem inválida.")
  const { data, error } = await createAdminClient()
    .from("suporte_mensagens")
    .insert({ user_id: userId, autor: "usuario", mensagem: body.data.mensagem })
    .select("id,autor,mensagem,created_at")
    .single()
  if (error) return erroApi(500, "ERRO_BANCO", "Não foi possível enviar a mensagem. Tente novamente.")
  return Response.json({ mensagem: data }, { status: 201 })
}
