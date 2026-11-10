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

export default async function DashboardPlanosPage() {
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
      <UsageCard usage={usage} />
      <PricingSection compact currentPlan={usage.plan} />
    </div>
  )
}
