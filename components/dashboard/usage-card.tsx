import Link from "next/link"
import { Progress } from "@/components/ui/progress"
import { DashboardCard } from "@/components/dashboard/dashboard-card"
import type { UsageStatus } from "@/lib/usage"

export function UsageCard({ usage }: { usage: UsageStatus }) {
  const isPro = usage.plan === "pro"
  const percent = usage.limit ? Math.min(100, (usage.used / usage.limit) * 100) : 0

  return (
    <DashboardCard className="w-full max-w-sm" borderRadius={16} glowIntensity={1.2}>
      <section aria-labelledby="usage-title" className="w-full p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="usage-title" className="text-sm font-medium text-zinc-400">Uso do mês</h2>
          <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-xs text-zinc-300">
            {isPro ? "Pro" : "Grátis"}
          </span>
        </div>
        {!usage.canCreateMemorials ? (
          <p role="status" className="text-sm text-zinc-400">
            A criação de memoriais está bloqueada para esta conta. Contate o suporte para solicitar a liberação.
          </p>
        ) : isPro ? (
          <p className="text-zinc-100">
            <span className="font-display text-2xl font-semibold">{usage.used}</span> memoriais processados · ilimitado
          </p>
        ) : (
          <>
            <p className="mb-3 text-zinc-100">
              <span className="font-display text-2xl font-semibold">{usage.used}</span> de {usage.limit} memoriais usados
            </p>
            <Progress value={percent} aria-label="Memoriais usados" className="bg-zinc-800" />
            {!usage.canCreate && (
              <p className="mt-3 text-sm text-zinc-400">
                Limite atingido. {" "}
                <Link href="/dashboard/planos" className="text-zinc-100 underline underline-offset-4">Assine o Pro</Link>
              </p>
            )}
          </>
        )}
      </section>
    </DashboardCard>
  )
}
