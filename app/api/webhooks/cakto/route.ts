import { NextRequest } from "next/server"
import { handleCaktoEvent, verifyCaktoBodySecret, verifyCaktoSignature } from "@/lib/billing/cakto"

export async function POST(request: NextRequest) {
  // A assinatura é calculada sobre o corpo cru: ler como texto antes de qualquer parse.
  const rawBody = await request.text()

  let payload: { secret?: unknown; event?: unknown; data?: unknown }
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return new Response("Corpo inválido", { status: 400 })
  }

  const timestamp = request.headers.get("x-cakto-timestamp")
  const signature = request.headers.get("x-cakto-signature")
  const authentic = signature
    ? verifyCaktoSignature(rawBody, timestamp, signature)
    : verifyCaktoBodySecret(payload.secret)

  if (!authentic) return new Response("Não autorizado", { status: 401 })
  if (typeof payload.event !== "string") return new Response("Evento ausente", { status: 400 })

  try {
    const result = await handleCaktoEvent(payload.event, payload.data)
    return Response.json({ received: true, ...result, userId: undefined })
  } catch (error) {
    console.error("[cakto-webhook]", payload.event, error instanceof Error ? error.message : error)
    return new Response("Falha ao processar o evento", { status: 500 })
  }
}

export async function GET() {
  return Response.json({ endpoint: "Cakto webhook ativo" })
}
