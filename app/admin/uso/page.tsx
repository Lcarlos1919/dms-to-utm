import { AdminPage, AdminTable } from "@/components/admin/admin-page"
import { Forbidden } from "@/components/admin/forbidden"
import { ADMIN_PERMISSIONS, ForbiddenError, requirePermission } from "@/lib/admin-auth"
import { resolveAdminUserDirectory } from "@/lib/admin-user-directory"
import { formatMonth } from "@/lib/format"
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

  if (error) throw new Error("Falha ao carregar uso.")

  const usageRows = data ?? []
  const users = await resolveAdminUserDirectory(usageRows.map((usage) => usage.user_id))

  return (
    <AdminPage title="Uso" description="Consumo mensal de memoriais por usuário.">
      <AdminTable
        headers={["Usuário", "Mês", "Memoriais usados"]}
        rows={usageRows.map((usage) => {
          const identity = users.get(usage.user_id)
          const name = identity?.fullName ?? "Sem nome"
          const email = identity?.email ? ` · ${identity.email}` : ""
          return [
            `${name}${email}`,
            formatMonth(usage.month),
            String(usage.memorials_used),
          ]
        })}
      />
    </AdminPage>
  )
}
