import { AdminPage, AdminTable } from "@/components/admin/admin-page"
import { Forbidden } from "@/components/admin/forbidden"
import { ADMIN_PERMISSIONS, ForbiddenError, requirePermission } from "@/lib/admin-auth"
import { createAdminClient } from "@/lib/supabase/server"

export default async function AdminSubscriptionsPage() {
  try {
    await requirePermission(ADMIN_PERMISSIONS.billingRead)
  } catch (error) {
    if (error instanceof ForbiddenError) return <Forbidden />
    throw error
  }

  const { data, error } = await createAdminClient()
    .from("subscriptions")
    .select("provider,status,amount_cents,plan,current_period_end")
    .order("created_at", { ascending: false })
    .limit(100)

  if (error) throw new Error("Falha ao carregar assinaturas")

  return (
    <AdminPage title="Assinaturas" description="Status de planos pagos e períodos ativos.">
      <AdminTable
        headers={["Provedor", "Status", "Plano", "Valor", "Período"]}
        rows={(data ?? []).map((subscription) => [
          subscription.provider,
          subscription.status,
          subscription.plan.toLowerCase() === "pro" || subscription.plan.toLowerCase() === "premium"
            ? "Pro"
            : subscription.plan.toLowerCase() === "free"
              ? "Grátis"
              : subscription.plan,
          subscription.amount_cents == null ? "—" : `R$ ${(subscription.amount_cents / 100).toFixed(2)}`,
          subscription.current_period_end ? new Date(subscription.current_period_end).toLocaleDateString("pt-BR") : "—",
        ])}
      />
    </AdminPage>
  )
}
