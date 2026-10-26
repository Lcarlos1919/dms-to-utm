import { AdminPage, AdminStatGrid } from "@/components/admin/admin-page"
import { ADMIN_PERMISSIONS, requireStaff } from "@/lib/admin-auth"
import { createAdminClient } from "@/lib/supabase/server"

export default async function AdminPageRoute() {
  const access = await requireStaff()
  const supabase = createAdminClient()
  const stats: { label: string; value: string }[] = []

  if (access.permissions.includes(ADMIN_PERMISSIONS.usersRead)) {
    const [{ count: users }, { count: projects }] = await Promise.all([
      supabase.from("profiles").select("user_id", { count: "exact", head: true }),
      supabase.from("projects").select("id", { count: "exact", head: true }),
    ])
    stats.push(
      { label: "Usuários", value: String(users ?? 0) },
      { label: "Projetos", value: String(projects ?? 0) },
    )
  }

  if (access.permissions.includes(ADMIN_PERMISSIONS.billingRead)) {
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()
    const [{ count: memorials }, { count: subscriptions }] = await Promise.all([
      supabase.from("usage").select("user_id", { count: "exact", head: true }).gte("month", monthStart),
      supabase.from("subscriptions").select("id", { count: "exact", head: true }).eq("status", "active"),
    ])
    stats.push(
      { label: "Memoriais no mês", value: String(memorials ?? 0) },
      { label: "Assinaturas Pro", value: String(subscriptions ?? 0) },
    )
  }

  return (
    <AdminPage title="Visão geral" description="Acompanhe a operação do TopoCAD.">
      <AdminStatGrid stats={stats} />
    </AdminPage>
  )
}
