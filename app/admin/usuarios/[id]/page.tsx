import { notFound } from "next/navigation"
import { AdminPage, AdminTable } from "@/components/admin/admin-page"
import { Forbidden } from "@/components/admin/forbidden"
import { ADMIN_PERMISSIONS, ForbiddenError, requirePermission } from "@/lib/admin-auth"
import { createAdminClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

export default async function AdminUserDetail({ params }: { params: Promise<{ id: string }> }) {
  let access
  try {
    access = await requirePermission(ADMIN_PERMISSIONS.usersRead)
  } catch (error) {
    if (error instanceof ForbiddenError) return <Forbidden />
    throw error
  }

  const { id } = await params
  const supabase = createAdminClient()
  const canReadExtendedData = access.orgRole !== "org:support"
  const [profileResult, usageResult, projectsResult, logsResult] = await Promise.all([
    supabase.from("profiles").select("user_id,email,full_name,plan,role,bonus_credits,created_at").eq("user_id", id).maybeSingle(),
    canReadExtendedData
      ? supabase.from("usage").select("month,memorials_used").eq("user_id", id).order("month", { ascending: false }).limit(12)
      : Promise.resolve({ data: [], error: null }),
    supabase.from("projects").select("id,name,status,area_m2,created_at").eq("user_id", id).order("created_at", { ascending: false }).limit(50),
    canReadExtendedData
      ? supabase.from("admin_audit_log").select("actor_id,action,target_user_id,created_at").eq("target_user_id", id).order("created_at", { ascending: false }).limit(50)
      : Promise.resolve({ data: [], error: null }),
  ])

  if (profileResult.error || usageResult.error || projectsResult.error || logsResult.error) {
    throw new Error("Falha ao carregar os dados do usuário")
  }

  const profile = profileResult.data
  if (!profile) notFound()

  return (
    <AdminPage title={profile.email ?? id} description={`${profile.full_name ?? "Usuário"} · ${profile.role} · plano ${profile.plan}`}>
      <div className="grid gap-4 md:grid-cols-4">
        <div>Função<strong className="block">{profile.role}</strong></div>
        <div>Plano<strong className="block">{profile.plan}</strong></div>
        <div>Créditos bônus<strong className="block">{profile.bonus_credits}</strong></div>
        <div>Criado em<strong className="block">{new Date(profile.created_at).toLocaleDateString("pt-BR")}</strong></div>
      </div>
      {canReadExtendedData && (
        <AdminTable
          headers={["Mês", "Memoriais usados"]}
          rows={(usageResult.data ?? []).map((item) => [
            new Date(item.month).toLocaleDateString("pt-BR", { month: "long", year: "numeric" }),
            String(item.memorials_used),
          ])}
        />
      )}
      <AdminTable
        headers={["Projeto", "Status", "Área", "Criado em"]}
        rows={(projectsResult.data ?? []).map((item) => [
          item.name,
          item.status,
          item.area_m2 ? `${Number(item.area_m2).toLocaleString("pt-BR")} m²` : "—",
          new Date(item.created_at).toLocaleDateString("pt-BR"),
        ])}
      />
      {canReadExtendedData && (
        <AdminTable
          headers={["Ator", "Ação", "Data"]}
          rows={(logsResult.data ?? []).map((item) => [
            item.actor_id,
            item.action,
            new Date(item.created_at).toLocaleString("pt-BR"),
          ])}
        />
      )}
    </AdminPage>
  )
}
