import "server-only"

import crypto from "node:crypto"
import { createAdminClient } from "@/lib/supabase/server"

/**
 * Assinatura Vertix Pro pela Cakto.
 *
 * Fluxo: /dashboard/assinar cria um token opaco ligado ao usuário (checkout_tokens) e manda a pessoa
 * para o checkout da Cakto com ?callback=<token>. A Cakto devolve o token no webhook (data.callback).
 * O webhook é a única fonte de verdade para liberar ou tirar o plano Pro.
 */

export const PRO_PRICE_CENTS = 6990
const SIGNATURE_TOLERANCE_SECONDS = 5 * 60
const DEFAULT_PERIOD_DAYS = 30
/** Dias extras de acesso depois do fim do período, enquanto a Cakto tenta cobrar de novo. */
export const GRACE_DAYS = 3

export function caktoCheckoutUrl() {
  return process.env.CAKTO_CHECKOUT_URL?.trim() || null
}

function webhookSecret() {
  return process.env.CAKTO_WEBHOOK_SECRET?.trim() || null
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && crypto.timingSafeEqual(left, right)
}

/** Valida a assinatura X-Cakto-Signature (HMAC-SHA256 de "{timestamp}.{corpo cru}"). */
export function verifyCaktoSignature(rawBody: string, timestamp: string | null, signature: string | null, now = Date.now()) {
  const secret = webhookSecret()
  if (!secret || !timestamp || !signature) return false

  const ts = Number(timestamp)
  if (!Number.isFinite(ts) || Math.abs(now / 1000 - ts) > SIGNATURE_TOLERANCE_SECONDS) return false

  const expected = `v1=${crypto.createHmac("sha256", secret).update(`${timestamp}.`).update(rawBody).digest("hex")}`
  return signature
    .split(",")
    .map((part) => part.trim())
    .some((candidate) => safeEqual(candidate, expected))
}

/** Alternativa da Cakto: o mesmo secret também vem no corpo. Usado só quando os headers não chegam. */
export function verifyCaktoBodySecret(received: unknown) {
  const secret = webhookSecret()
  return Boolean(secret && typeof received === "string" && safeEqual(received, secret))
}

export async function createCheckoutToken(userId: string) {
  const token = crypto.randomBytes(18).toString("base64url")
  const { error } = await createAdminClient().from("checkout_tokens").insert({ token, user_id: userId })
  if (error) throw new Error("Não foi possível iniciar o checkout.")
  return token
}

export function buildCheckoutUrl(baseUrl: string, token: string) {
  const url = new URL(baseUrl)
  url.searchParams.set("callback", token)
  return url.toString()
}

// ---------------------------------------------------------------------------------------------
// Webhook
// ---------------------------------------------------------------------------------------------

type Json = Record<string, unknown>

const ACTIVATE_EVENTS = new Set([
  "purchase_approved",
  "subscription_created",
  "subscription_renewed",
  "subscription_late_recovered",
  "subscription_resumed",
])
const PAST_DUE_EVENTS = new Set(["subscription_late", "subscription_renewal_refused"])
const REVOKE_EVENTS = new Set(["refund", "chargeback"])

export type SubscriptionAction =
  | { kind: "activate" }
  | { kind: "past_due" }
  | { kind: "canceled" }
  | { kind: "paused" }
  | { kind: "revoke"; status: "refunded" | "chargeback" }
  | { kind: "ignore" }

export function actionForEvent(event: string, orderStatus: string | null): SubscriptionAction {
  if (ACTIVATE_EVENTS.has(event)) {
    if (orderStatus && ["refused", "waiting_payment", "canceled", "refunded", "chargedback"].includes(orderStatus)) {
      return { kind: "ignore" }
    }
    return { kind: "activate" }
  }
  if (PAST_DUE_EVENTS.has(event)) return { kind: "past_due" }
  if (event === "subscription_canceled") return { kind: "canceled" }
  if (event === "subscription_paused") return { kind: "paused" }
  if (REVOKE_EVENTS.has(event)) return { kind: "revoke", status: event === "refund" ? "refunded" : "chargeback" }
  return { kind: "ignore" }
}

function asObject(value: unknown): Json | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : null
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function asDate(value: unknown) {
  const text = asString(value)
  if (!text) return null
  const date = new Date(text)
  return Number.isNaN(date.getTime()) ? null : date
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 86_400_000)
}

export type ParsedOrder = {
  orderId: string | null
  status: string | null
  productId: string | null
  callback: string | null
  email: string | null
  customerId: string | null
  subscriptionId: string | null
  amountCents: number | null
  periodEnd: Date | null
  canceledAt: Date | null
}

export function parseOrder(data: Json, now = new Date()): ParsedOrder {
  const product = asObject(data.product)
  const customer = asObject(data.customer)
  const subscription = asObject(data.subscription)
  const amount = typeof data.amount === "number" ? data.amount : typeof data.baseAmount === "number" ? data.baseAmount : null

  const recurrenceDays = typeof subscription?.recurrence_period === "number" && subscription.recurrence_period > 0
    ? subscription.recurrence_period
    : DEFAULT_PERIOD_DAYS
  const paidAt = asDate(data.paidAt) ?? asDate(data.createdAt)
  const periodEnd = asDate(subscription?.next_payment_date) ?? (paidAt ? addDays(paidAt, recurrenceDays) : addDays(now, recurrenceDays))

  return {
    orderId: asString(data.id),
    status: asString(data.status),
    productId: asString(product?.id),
    callback: asString(data.callback),
    email: asString(customer?.email)?.toLowerCase() ?? null,
    customerId: customer?.id == null ? null : String(customer.id),
    subscriptionId: asString(subscription?.id),
    amountCents: amount == null ? null : Math.round(amount * 100),
    periodEnd,
    canceledAt: asDate(subscription?.canceledAt) ?? asDate(data.canceledAt),
  }
}

async function resolveUserId(order: ParsedOrder) {
  const supabase = createAdminClient()

  if (order.subscriptionId) {
    const { data } = await supabase
      .from("subscriptions")
      .select("user_id")
      .eq("provider", "cakto")
      .eq("provider_subscription_id", order.subscriptionId)
      .maybeSingle()
    if (data?.user_id) return data.user_id as string
  }

  if (order.callback) {
    const { data } = await supabase.from("checkout_tokens").select("user_id").eq("token", order.callback).maybeSingle()
    if (data?.user_id) {
      await supabase.from("checkout_tokens").update({ used_at: new Date().toISOString() }).eq("token", order.callback).is("used_at", null)
      return data.user_id as string
    }
  }

  if (order.email) {
    const { data } = await supabase.from("profiles").select("user_id").ilike("email", order.email).limit(2)
    if (data?.length === 1) return data[0].user_id as string
  }

  return null
}

export type WebhookResult = { status: "processed" | "duplicate" | "ignored" | "unmatched"; userId?: string }

export async function handleCaktoEvent(event: string, rawData: unknown): Promise<WebhookResult> {
  // Webhook V2 entrega data como lista (todos os pedidos da cobrança). Só o principal importa aqui.
  const items = Array.isArray(rawData) ? rawData.map(asObject).filter((item): item is Json => item !== null) : [asObject(rawData)].filter((item): item is Json => item !== null)
  const data = items.find((item) => item.offer_type === "main") ?? items[0]
  if (!data || event === "checkout_abandonment") return { status: "ignored" }

  const order = parseOrder(data)
  const expectedProduct = process.env.CAKTO_PRODUCT_ID?.trim()
  if (expectedProduct && order.productId && order.productId !== expectedProduct) return { status: "ignored" }

  const action = actionForEvent(event, order.status)
  const supabase = createAdminClient()

  // Idempotência: a mesma entrega (evento + pedido) só é processada uma vez.
  const { error: logError } = await supabase.from("billing_events").insert({
    provider: "cakto",
    event,
    order_id: order.orderId,
    subscription_id: order.subscriptionId,
    status: action.kind === "ignore" ? "ignored" : "received",
    payload: { status: order.status, product: order.productId, subscription: order.subscriptionId },
  })
  if (logError?.code === "23505") return { status: "duplicate" }
  if (logError) throw new Error("Não foi possível registrar o evento da Cakto.")

  if (action.kind === "ignore") return { status: "ignored" }

  try {
    return await applyAction(event, order, action)
  } catch (error) {
    // Libera a entrega para ser reenviada (Reenviar Evento na Cakto) depois de corrigir a falha.
    if (order.orderId) {
      await supabase.from("billing_events").delete().eq("provider", "cakto").eq("event", event).eq("order_id", order.orderId)
    }
    throw error
  }
}

async function applyAction(
  event: string,
  order: ParsedOrder,
  action: Exclude<SubscriptionAction, { kind: "ignore" }>,
): Promise<WebhookResult> {
  const supabase = createAdminClient()
  const userId = await resolveUserId(order)
  const markEvent = (status: string, user: string | null) => {
    if (!order.orderId) return Promise.resolve()
    return supabase
      .from("billing_events")
      .update({ status, user_id: user })
      .eq("provider", "cakto")
      .eq("event", event)
      .eq("order_id", order.orderId)
      .then(() => undefined)
  }

  if (!userId) {
    await markEvent("unmatched", null)
    return { status: "unmatched" }
  }

  const nowIso = new Date().toISOString()
  const subscriptionStatus =
    action.kind === "activate" ? "active"
      : action.kind === "past_due" ? "past_due"
        : action.kind === "canceled" ? "canceled"
          : action.kind === "paused" ? "paused"
            : action.status

  const row: Json = {
    user_id: userId,
    provider: "cakto",
    provider_customer_id: order.customerId,
    provider_subscription_id: order.subscriptionId ?? `order:${order.orderId}`,
    status: subscriptionStatus,
    plan: "pro",
    currency: "BRL",
    customer_email: order.email,
    last_event: event,
    updated_at: nowIso,
  }
  if (order.amountCents != null && action.kind === "activate") row.amount_cents = order.amountCents
  if (action.kind === "activate") row.current_period_end = order.periodEnd?.toISOString() ?? null
  if (action.kind === "canceled") row.canceled_at = (order.canceledAt ?? new Date()).toISOString()

  const { error: upsertError } = await supabase
    .from("subscriptions")
    .upsert(row, { onConflict: "provider,provider_subscription_id" })
  if (upsertError) throw new Error("Não foi possível salvar a assinatura.")

  // Plano do perfil: ativa na hora; pausa, reembolso e chargeback tiram na hora.
  // Atraso e cancelamento mantêm o Pro até o fim do período pago (ver reconcileExpiredPlan).
  if (action.kind === "activate" || action.kind === "paused" || action.kind === "revoke") {
    const plan = action.kind === "activate" ? "pro" : "free"
    const { error } = await supabase.from("profiles").update({ plan, updated_at: nowIso }).eq("user_id", userId)
    if (error) throw new Error("Não foi possível atualizar o plano.")
  }

  await supabase.from("audit_logs").insert({
    actor_id: null,
    target_user_id: userId,
    action: `billing.cakto.${event}`,
    metadata: { order: order.orderId, subscription: order.subscriptionId, status: subscriptionStatus },
  })

  await markEvent("processed", userId)
  return { status: "processed", userId }
}

/**
 * Tira o Pro de quem cancelou ou atrasou e já passou do período pago (+ carência).
 * Só mexe em contas cuja assinatura mais recente é da Cakto; Pro dado à mão pelo admin fica intacto.
 */
export async function reconcileExpiredPlan(userId: string, now = new Date()) {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from("subscriptions")
    .select("provider,status,current_period_end")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!data || data.provider !== "cakto") return false
  if (data.status === "active") return false

  const end = data.current_period_end ? new Date(data.current_period_end) : null
  const expired = !end || addDays(end, GRACE_DAYS) < now
  if (!expired) return false

  await supabase.from("profiles").update({ plan: "free", updated_at: now.toISOString() }).eq("user_id", userId).eq("plan", "pro")
  return true
}
