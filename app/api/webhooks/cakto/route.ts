import { createAdminClient } from "@/lib/supabase/server"
import { ativarPro, encerrarPro } from "@/lib/plano"
import {
  EVENTOS_QUE_LIBERAM,
  EVENTOS_QUE_REVOGAM,
  verificarAssinaturaCakto,
} from "@/lib/vertix-core/cakto"

export const runtime = "nodejs"

type Dados = Record<string, unknown> & { id?: unknown; status?: unknown; callback?: unknown; customer?: { email?: unknown } }

/** Acha a conta do pedido: pelo token do checkout, pelo pedido já registrado ou pelo e-mail do comprador. */
async function descobrirUsuario(dados: Dados, pedidoId: string): Promise<string | null> {
  const db = createAdminClient()
  if (typeof dados.callback === "string" && dados.callback) {
    const { data } = await db.from("checkout_tokens").select("user_id").eq("token", dados.callback).maybeSingle()
    if (data?.user_id) return data.user_id
  }
  const { data: anterior } = await db.from("billing_events").select("user_id").eq("provider", "cakto").eq("order_id", pedidoId).not("user_id", "is", null).limit(1).maybeSingle()
  if (anterior?.user_id) return anterior.user_id
  const email = typeof dados.customer?.email === "string" ? dados.customer.email.trim().toLowerCase() : ""
  if (email) {
    const { data } = await db.from("profiles").select("user_id").ilike("email", email).limit(1).maybeSingle()
    if (data?.user_id) return data.user_id
  }
  return null
}

export async function POST(request: Request) {
  const corpo = await request.text()
  const segredo = process.env.CAKTO_WEBHOOK_SECRET?.trim() ?? ""
  if (!segredo) return new Response("Webhook não configurado", { status: 503 })

  const valida = verificarAssinaturaCakto({
    corpo,
    timestamp: request.headers.get("x-cakto-timestamp"),
    assinatura: request.headers.get("x-cakto-signature"),
    segredo,
  })
  if (!valida) return new Response("Assinatura inválida", { status: 401 })

  let payload: { event?: unknown; data?: unknown }
  try {
    payload = JSON.parse(corpo)
  } catch {
    return new Response("Corpo inválido", { status: 400 })
  }

  const evento = typeof payload.event === "string" ? payload.event : ""
  const libera = (EVENTOS_QUE_LIBERAM as readonly string[]).includes(evento)
  const revoga = (EVENTOS_QUE_REVOGAM as readonly string[]).includes(evento)
  if (!libera && !revoga) return Response.json({ ok: true, ignorado: true })

  // Webhook V1 manda um objeto; V2 manda uma lista. Trata os dois.
  const itens = (Array.isArray(payload.data) ? payload.data : [payload.data]) as Dados[]
  const db = createAdminClient()

  for (const dados of itens) {
    if (!dados || typeof dados !== "object") continue
    const pedidoId = String(dados.id ?? "")
    if (!pedidoId) continue
    const userId = await descobrirUsuario(dados, pedidoId)
    const status = String(dados.status ?? "")

    // Só o necessário fica guardado (sem dados pessoais do comprador).
    const { error } = await db.from("billing_events").insert({
      provider: "cakto",
      event: evento,
      order_id: pedidoId,
      user_id: userId,
      status: userId ? status : "sem_vinculo",
      payload: { id: pedidoId, refId: dados.refId ?? null, status, amount: dados.amount ?? null, paymentMethod: dados.paymentMethod ?? null },
    })
    // Mesmo evento e mesmo pedido já processados: a Cakto reenviou. Não aplica de novo.
    if (error?.code === "23505") continue
    if (error) return new Response("Não foi possível registrar o evento", { status: 500 })
    if (!userId) continue

    if (libera && status === "paid") await ativarPro(userId)
    if (revoga) await encerrarPro(userId)
  }

  return Response.json({ ok: true })
}
