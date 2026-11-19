import type { Metadata } from "next"
import { PricingSection } from "@/components/sections/pricing-section"
import { SetupNotice } from "@/components/setup-notice"
import { UsageCard } from "@/components/dashboard/usage-card"
import { requireUser } from "@/lib/auth"
import { isSupabaseConfigured } from "@/lib/supabase/config"
import { getUsageStatus } from "@/lib/usage"

export const metadata: Metadata = {
  title: "Planos — Vertix",
  description: "Compare os planos Grátis e Pro do Vertix.",
}

export default async function DashboardPlanosPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>
}) {
  const { checkout } = await searchParams
  const userId = await requireUser()

  if (!isSupabaseConfigured()) {
    return <SetupNotice variables={["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]} />
  }

  const usage = await getUsageStatus(userId)

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm font-medium text-zinc-500">Conta</p>
        <h1 className="mt-1 font-display text-2xl font-semibold text-zinc-100">Planos</h1>
        <p className="mt-2 text-sm text-zinc-500">Confira seu uso e os recursos disponíveis em cada plano.</p>
      </div>
      {checkout === "indisponivel" && (
        <p role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          O checkout do Pro ainda não está disponível. Tente novamente em instantes ou fale com o suporte.
        </p>
      )}
      <UsageCard usage={usage} />
      <PricingSection compact currentPlan={usage.plan} />
      {usage.plan === "free" && (
        <p className="text-sm text-zinc-500">
          O pagamento é feito pela Cakto (cartão, Pix ou boleto). O Pro é liberado automaticamente assim que o pagamento
          for aprovado. Se não liberar em alguns minutos, confira se usou o mesmo e-mail da sua conta Vertix.
        </p>
      )}
    </div>
  )
}
