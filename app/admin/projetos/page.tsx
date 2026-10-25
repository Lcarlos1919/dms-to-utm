import { AdminPage, AdminTable } from "@/components/admin/admin-page"
import { Forbidden } from "@/components/admin/forbidden"
import { ADMIN_PERMISSIONS, ForbiddenError, requirePermission } from "@/lib/admin-auth"
import { createAdminClient } from "@/lib/supabase/server"

export default async function AdminProjectsPage() {
  try {
    await requirePermission(ADMIN_PERMISSIONS.projectsRead)
  } catch (error) {
    if (error instanceof ForbiddenError) return <Forbidden />
    throw error
  }

  const { data, error } = await createAdminClient()
    .from("projects")
    .select("id,user_id,name,status,area_m2,created_at")
    .order("created_at", { ascending: false })
    .limit(100)

  if (error) throw new Error("Falha ao carregar projetos")

  return (
    <AdminPage title="Projetos" description="Todos os memoriais enviados à plataforma.">
      <AdminTable
        headers={["Nome", "Usuário", "Status", "Área", "Criado em"]}
        rows={(data ?? []).map((project) => [
          project.name,
          project.user_id,
          project.status,
          project.area_m2 ? `${Number(project.area_m2).toLocaleString("pt-BR")} m²` : "—",
          new Date(project.created_at).toLocaleDateString("pt-BR"),
        ])}
      />
    </AdminPage>
  )
}
