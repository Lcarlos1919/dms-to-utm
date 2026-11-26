import { Progress } from "@/components/ui/progress"
import { DashboardCard } from "@/components/dashboard/dashboard-card"
import { AssinarButton } from "@/components/assinatura/assinar-button"
import { CATEGORIAS, ROTULO_CATEGORIA } from "@/lib/vertix-core/plano"
import type { UsageStatus } from "@/lib/usage"

export function UsageCard({ usage }: { usage: UsageStatus }) {
  const isPro = usage.plano === "pro"

  return (
    <DashboardCard className="w-full max-w-xl" borderRadius={16} glowIntensity={1.2}>
      <section aria-labelledby="usage-title" className="w-full space-y-4 p-5">
        <div className="flex items-center justify-between">
          <h2 id="usage-title" className="text-sm font-medium text-zinc-400">{isPro ? "Plano Pro" : "Plano Grátis"}</h2>
          <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-xs text-zinc-300">{isPro ? "Pro" : "Grátis"}</span>
        </div>

        {!usage.canCreateMemorials ? (
          <p role="status" className="text-sm text-zinc-400">
            A criação de memoriais está bloqueada para esta conta. Fale com o suporte para solicitar a liberação.
          </p>
        ) : isPro ? (
          <div className="space-y-2">
            <p className="text-zinc-100">
              <span className="font-display text-2xl font-semibold">{usage.diasRestantes ?? 0}</span> dias restantes · memoriais ilimitados
            </p>
            <Progress value={((usage.diasRestantes ?? 0) / 30) * 100} aria-label="Dias restantes do Pro" className="bg-zinc-800" />
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-zinc-100">
              <span className="font-display text-2xl font-semibold">{usage.totalUsado}</span> de {usage.totalLimite} memoriais usados
            </p>
            <ul className="space-y-2">
              {CATEGORIAS.map((categoria) => {
                const item = usage.porCategoria[categoria]
                const percent = item.limite ? Math.min(100, (item.usado / item.limite) * 100) : 0
                return (
                  <li key={categoria}>
                    <div className="mb-1 flex justify-between text-xs text-zinc-400">
                      <span>{ROTULO_CATEGORIA[categoria]}</span>
                      <span>{item.usado} de {item.limite}</span>
                    </div>
                    <Progress value={percent} aria-label={`${ROTULO_CATEGORIA[categoria]} usados`} className="bg-zinc-800" />
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {!isPro && (
          <div className="flex flex-wrap items-center gap-3 border-t border-zinc-800 pt-4">
            <AssinarButton />
            <p className="text-xs text-zinc-500">Pro: memoriais ilimitados por 30 dias após a confirmação do pagamento.</p>
          </div>
        )}
      </section>
    </DashboardCard>
  )
}
