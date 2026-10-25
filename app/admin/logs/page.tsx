import { AdminPage, AdminTable } from "@/components/admin/admin-page"
import { Forbidden } from "@/components/admin/forbidden"
import { ADMIN_PERMISSIONS, ForbiddenError, requirePermission } from "@/lib/admin-auth"
import { createAdminClient } from "@/lib/supabase/server"

export default async function AdminLogsPage() {
  try {
    await requirePermission(ADMIN_PERMISSIONS.auditRead)
  } catch (error) {
    if (error instanceof ForbiddenError) return <Forbidden />
    throw error
  }

  const { data, error } = await createAdminClient()
    .from("admin_audit_log")
    .select("actor_id,target_user_id,action,created_at")
    .order("created_at", { ascending: false })
    .limit(100)

  if (error) throw new Error("Falha ao carregar auditoria administrativa")

  return (
    <AdminPage title="Logs de auditoria" description="Ações do painel administrativo registradas no sistema.">
      <AdminTable
        headers={["Ator", "Alvo", "Ação", "Data"]}
        rows={(data ?? []).map((log) => [
          log.actor_id,
          log.target_user_id ?? "—",
          log.action,
          new Date(log.created_at).toLocaleString("pt-BR"),
        ])}
      />
    </AdminPage>
  )
}
