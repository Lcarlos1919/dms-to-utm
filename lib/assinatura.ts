import "server-only"

import { randomBytes } from "node:crypto"
import { createAdminClient } from "@/lib/supabase/server"

/** Link do produto na Cakto (CAKTO_CHECKOUT_URL). O token vai em ?callback= e volta no webhook para achar a conta. */
export async function criarLinkCheckout(userId: string): Promise<string | null> {
  const base = process.env.CAKTO_CHECKOUT_URL?.trim()
  if (!base) return null
  const db = createAdminClient()
  for (let tentativa = 0; tentativa < 3; tentativa += 1) {
    const token = randomBytes(8).toString("hex")
    const { error } = await db.from("checkout_tokens").insert({ token, user_id: userId })
    if (!error) {
      const url = new URL(base)
      url.searchParams.set("callback", token)
      return url.toString()
    }
    if (error.code !== "23505") throw new Error("Não foi possível preparar o pagamento.")
  }
  throw new Error("Não foi possível preparar o pagamento.")
}
