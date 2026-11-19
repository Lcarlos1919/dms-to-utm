import { auth } from "@clerk/nextjs/server"
import { NextRequest, NextResponse } from "next/server"
import { buildCheckoutUrl, caktoCheckoutUrl, createCheckoutToken } from "@/lib/billing/cakto"
import { ensureProfile } from "@/lib/profiles"
import { createAdminClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

/** Leva o usuário logado ao checkout da Cakto, com um token que liga o pagamento à conta. */
export async function GET(request: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.redirect(new URL("/sign-in", request.url))

  const checkoutUrl = caktoCheckoutUrl()
  if (!checkoutUrl) return NextResponse.redirect(new URL("/dashboard/planos?checkout=indisponivel", request.url))

  await ensureProfile(userId)
  const { data: profile } = await createAdminClient().from("profiles").select("plan").eq("user_id", userId).maybeSingle()
  if (profile?.plan === "pro") return NextResponse.redirect(new URL("/dashboard/planos", request.url))

  const token = await createCheckoutToken(userId)
  return NextResponse.redirect(buildCheckoutUrl(checkoutUrl, token))
}
