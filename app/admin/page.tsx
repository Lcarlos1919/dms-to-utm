import { clerkClient } from "@clerk/nextjs/server"
import { AdminPage, AdminStatGrid } from "@/components/admin/admin-page"
import { ADMIN_PERMISSIONS, requireStaff } from "@/lib/admin-auth"
import { getMonthlyUsageTotal } from "@/lib/usage"
import { createAdminClient } from "@/lib/supabase/server"

export default async function AdminPageRoute() {
  const access = await requireStaff()
  const supabase = createAdminClient()
  const stats: { label: string; value: string }[] = []

  if (access.permissions.includes(ADMIN_PERMISSIONS.usersRead)) {
    const clerk = await clerkClient()
    const [usersResult, projectsResult] = await Promise.all([
      clerk.users.getUserList({ limit: 1, offset: 0 }),
      supabase.from("projects").select("id", { count: "exact", head: true }),
    ])

    stats.push(
      { label: "Usuários", value: String(usersResult.totalCount ?? 0) },
      { label: "Projetos", value: String(projectsResult.count ?? 0) },
    )
  }

  if (access.permissions.includes(ADMIN_PERMISSIONS.billingRead)) {
    const [memorials, subscriptionsResult] = await Promise.all([
      getMonthlyUsageTotal(),
      supabase.from("subscriptions").select("id", { count: "exact", head: true }).eq("status", "active"),
    ])

    if (subscriptionsResult.error) throw new Error("Falha ao carregar as métricas administrativas.")

    stats.push(
      { label: "Memoriais no mês", value: String(memorials) },
      { label: "Assinaturas Pro", value: String(subscriptionsResult.count ?? 0) },
    )
  }

  return (
    <AdminPage title="Visão geral" description="Acompanhe a operação do TopoCAD.">
      <AdminStatGrid stats={stats} />
    </AdminPage>
  )
}
