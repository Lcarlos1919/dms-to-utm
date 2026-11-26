// Validação e regras dos webhooks da Cakto (puras). Contrato: docs.cakto.com.br/conceitos/webhooks
// Assinatura: header X-Cakto-Signature = "v1=<hmac-sha256 hex>" de "{timestamp}.{corpo cru}", com o secret do webhook.
import { createHmac, timingSafeEqual } from "node:crypto"

export const TOLERANCIA_ASSINATURA_S = 5 * 60

/** Eventos que liberam (ou estendem) o Pro. */
export const EVENTOS_QUE_LIBERAM = ["purchase_approved", "subscription_renewed"] as const
/** Eventos que tiram o Pro (estorno e chargeback). */
export const EVENTOS_QUE_REVOGAM = ["refund", "chargeback"] as const

export function verificarAssinaturaCakto(args: {
  corpo: string
  timestamp: string | null
  assinatura: string | null
  segredo: string
  agora?: number
}): boolean {
  const { corpo, timestamp, assinatura, segredo } = args
  if (!timestamp || !assinatura || !segredo) return false
  const ts = Number(timestamp)
  if (!Number.isFinite(ts)) return false
  const agoraS = Math.floor((args.agora ?? Date.now()) / 1000)
  if (Math.abs(agoraS - ts) > TOLERANCIA_ASSINATURA_S) return false

  const esperado = `v1=${createHmac("sha256", segredo).update(`${timestamp}.`).update(corpo, "utf8").digest("hex")}`
  // Pode vir mais de uma versão separada por vírgula (transição de versão): basta uma bater.
  return assinatura.split(",").map((p) => p.trim()).some((candidata) => {
    const a = Buffer.from(candidata)
    const b = Buffer.from(esperado)
    return a.length === b.length && timingSafeEqual(a, b)
  })
}

/** Lê o valor como número (a Cakto manda dinheiro às vezes como número, às vezes como texto). */
export function valorCakto(v: unknown): number {
  const n = typeof v === "number" ? v : Number(String(v ?? "0").replace(",", "."))
  return Number.isFinite(n) ? n : 0
}
