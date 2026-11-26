import { z } from "zod"
import { createAdminClient } from "@/lib/supabase/server"
import { ADMIN_PERMISSIONS, requireStaffApiPermission } from "@/lib/admin-auth"
import { erroApi } from "@/lib/api/projetos"

export const runtime = "nodejs"

const respostaSchema = z.object({
  userId: z.string().min(1).max(200),
  mensagem: z.string().trim().min(1).max(2000),
})

/** Equipe responde uma conta no chat de suporte. */
export async function POST(request: Request) {
  const auth = await requireStaffApiPermission(ADMIN_PERMISSIONS.usersManage)
  if (!auth.ok) return auth.response
  const body = respostaSchema.safeParse(await request.json().catch(() => null))
  if (!body.success) return erroApi(400, "ENTRADA_INVALIDA", "Mensagem inválida.")
  const { error } = await createAdminClient()
    .from("suporte_mensagens")
    .insert({ user_id: body.data.userId, autor: "suporte", mensagem: body.data.mensagem })
  if (error) return erroApi(500, "ERRO_BANCO", "Não foi possível enviar a resposta.")
  return Response.json({ ok: true }, { status: 201 })
}
