import { AdminPage, AdminTable } from "@/components/admin/admin-page"
import { Forbidden } from "@/components/admin/forbidden"
import { ADMIN_PERMISSIONS, ForbiddenError, requirePermission } from "@/lib/admin-auth"
import { createAdminClient } from "@/lib/supabase/server"

export default async function AdminUsagePage() {
  try {
    await requirePermission(ADMIN_PERMISSIONS.usageRead)
  } catch (error) {
    if (error instanceof ForbiddenError) return <Forbidden />
    throw error
  }

  const { data, error } = await createAdminClient()
    .from("usage")
    .select("user_id,month,memorials_used")
    .order("month", { ascending: false })
    .limit(100)

  if (error) throw new Error("Falha ao carregar uso")

  return (
    <AdminPage title="Uso" description="Consumo mensal de memoriais por usuário.">
      <AdminTable
        headers={["Usuário", "Mês", "Memoriais usados"]}
        rows={(data ?? []).map((usage) => [
          usage.user_id,
          new Date(usage.month).toLocaleDateString("pt-BR", { month: "long", year: "numeric" }),
          String(usage.memorials_used),
        ])}
      />
    </AdminPage>
  )
}
