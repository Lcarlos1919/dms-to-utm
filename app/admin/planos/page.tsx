import { AdminPage } from "@/components/admin/admin-page"
import { Forbidden } from "@/components/admin/forbidden"
import { ADMIN_PERMISSIONS, ForbiddenError, requirePermission } from "@/lib/admin-auth"
import { DEFAULT_FREE_LIMIT } from "@/lib/usage"
import { formatCurrency } from "@/lib/format"
import { createAdminClient } from "@/lib/supabase/server"

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) return Number(value)
  return null
}

export default async function PlansPage() {
  try {
    await requirePermission(ADMIN_PERMISSIONS.plansRead)
  } catch (error) {
    if (error instanceof ForbiddenError) return <Forbidden />
    throw error
  }

  const { data, error } = await createAdminClient()
    .from("app_settings")
    .select("key,value")
    .in("key", ["plans", "free_monthly_limit"])

  if (error) throw new Error("Falha ao carregar os planos.")

  const planSettings = data?.find((setting) => setting.key === "plans")?.value
  const settingsValue = data?.find((setting) => setting.key === "free_monthly_limit")?.value
  const configuredFreeLimit = asNumber(settingsValue)
  const freeLimit = configuredFreeLimit !== null && Number.isSafeInteger(configuredFreeLimit) && configuredFreeLimit >= 0
    ? configuredFreeLimit
    : DEFAULT_FREE_LIMIT
  const planEntries = Object.entries(asRecord(planSettings) ?? {})

  return (
    <AdminPage title="Planos" description="Planos e limites carregados de app_settings.">
      {planEntries.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {planEntries.map(([key, value]) => {
            const plan = asRecord(value) ?? {}
            const name = typeof plan.name === "string" ? plan.name : key
            const priceCents = asNumber(plan.price_cents)
            const price = asNumber(plan.price)
            const rawLimit = plan.monthly_limit ?? plan.free_monthly_limit ?? plan.limit ?? (key === "free" ? freeLimit : key === "pro" ? null : undefined)
            const monthlyLimit = asNumber(rawLimit)
            const limitLabel = rawLimit === null
              ? "Ilimitado"
              : monthlyLimit !== null && Number.isSafeInteger(monthlyLimit) && monthlyLimit >= 0
                ? `${monthlyLimit} memoriais/mês`
                : "Não definido"
            const priceLabel = priceCents !== null
              ? key === "free" && priceCents === 0 ? "Grátis" : `${formatCurrency(priceCents)}/mês`
              : price !== null
                ? key === "free" && price === 0 ? "Grátis" : `${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(price)}/mês`
                : "Preço não definido"

            return (
              <article key={key} className="flex flex-col gap-5 rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">{key}</p>
                  <h2 className="mt-1 font-display text-xl font-semibold text-zinc-100">{name}</h2>
                </div>
                <dl className="grid gap-4 border-t border-zinc-800 pt-4 sm:grid-cols-2">
                  <div>
                    <dt className="text-sm text-zinc-500">Preço</dt>
                    <dd className="mt-1 font-medium text-zinc-100">{priceLabel}</dd>
                  </div>
                  <div>
                    <dt className="text-sm text-zinc-500">Limite mensal</dt>
                    <dd className="mt-1 font-medium text-zinc-100">{limitLabel}</dd>
                  </div>
                </dl>
              </article>
            )
          })}
        </div>
      ) : (
        <p className="rounded-xl border border-zinc-800 p-6 text-sm text-zinc-500">Nenhum plano foi configurado em app_settings.</p>
      )}
    </AdminPage>
  )
}
