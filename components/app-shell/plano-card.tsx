import Link from "next/link"
import { AssinarButton } from "@/components/assinatura/assinar-button"
import { CATEGORIAS, ROTULO_CATEGORIA } from "@/lib/vertix-core/plano"
import type { UsageStatus } from "@/lib/usage"

const dataCurta = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" })

/**
 * Cartão do plano na navbar. Mostra só o que importa agora: dias do Pro, ou o que falta no Grátis.
 * Fica acima do cartão de admin.
 */
export function PlanoCard({ usage }: { usage: UsageStatus }) {
  if (usage.plano === "pro") {
    const dias = usage.diasRestantes ?? 0
    const perto = dias <= 5
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-3 text-sm">
        <div className="flex items-center justify-between">
          <span className="font-medium text-zinc-100">Plano Pro</span>
          <span className="rounded-full border border-zinc-700 px-2 py-0.5 text-[10px] uppercase tracking-wider text-zinc-300">Ativo</span>
        </div>
        <p className="mt-1 text-zinc-400">
          {dias === 0 ? "Vence hoje" : `${dias} ${dias === 1 ? "dia restante" : "dias restantes"}`}
          {usage.proAte ? ` · até ${dataCurta(usage.proAte)}` : ""}
        </p>
        <p className="text-xs text-zinc-500">Memoriais ilimitados</p>
        {perto && (
          <p role="status" className="mt-2 text-xs text-amber-300">Seu Pro está perto do fim. Renove para não perder o acesso.</p>
        )}
        {perto && <div className="mt-2"><AssinarButton label="Renovar o Pro" /></div>}
      </div>
    )
  }

  const bloqueado = !usage.podeCriar
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-3 text-sm">
      <div className="flex items-center justify-between">
        <span className="font-medium text-zinc-100">Plano Grátis</span>
        <span className="text-xs text-zinc-400">{usage.totalUsado} de {usage.totalLimite}</span>
      </div>
      <ul className="mt-2 space-y-1 text-xs text-zinc-400">
        {CATEGORIAS.map((categoria) => {
          const item = usage.porCategoria[categoria]
          const esgotado = item.limite !== null && item.usado >= item.limite
          return (
            <li key={categoria} className="flex justify-between">
              <span>{ROTULO_CATEGORIA[categoria]}</span>
              <span className={esgotado ? "text-zinc-500 line-through" : ""}>{item.usado}/{item.limite}</span>
            </li>
          )
        })}
      </ul>
      {bloqueado ? (
        <div className="mt-3 space-y-2">
          <p role="status" className="text-xs text-amber-300">Limite do Grátis atingido.</p>
          <AssinarButton />
        </div>
      ) : (
        <Link href="/dashboard/planos" className="mt-3 inline-block text-xs text-zinc-200 underline underline-offset-4">Ver o plano Pro</Link>
      )}
    </div>
  )
}
