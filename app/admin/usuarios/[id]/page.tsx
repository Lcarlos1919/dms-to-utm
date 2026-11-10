import { clerkClient } from "@clerk/nextjs/server"
import { notFound } from "next/navigation"
import { AdminPage, AdminTable } from "@/components/admin/admin-page"
import { UserAccountActions } from "@/components/admin/user-account-actions"
import { UserPermissionControls } from "@/components/admin/user-permission-controls"
import { Forbidden } from "@/components/admin/forbidden"
import { Badge } from "@/components/ui/badge"
import { ADMIN_PERMISSIONS, ForbiddenError, requirePermission } from "@/lib/admin-auth"
import { createAdminClient } from "@/lib/supabase/server"
import { statusLabels, type ProjectStatus } from "@/lib/format"

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
  const clerk = await clerkClient()
  const clerkUser = await clerk.users.getUser(id).catch(() => null)
  if (!clerkUser) notFound()

  const supabase = createAdminClient()
  const canReadUsage = access.permissions.includes(ADMIN_PERMISSIONS.usageRead)
  const canReadProjects = access.permissions.includes(ADMIN_PERMISSIONS.projectsRead)
  const canReadAudit = access.permissions.includes(ADMIN_PERMISSIONS.auditRead)
  const [profileResult, usageResult, projectsResult, logsResult] = await Promise.all([
    supabase.from("profiles").select("user_id,email,full_name,plan,role,bonus_credits,can_create_memorials,can_delete_memorials,created_at").eq("user_id", id).maybeSingle(),
    canReadUsage
      ? supabase.from("usage").select("month,memorials_used").eq("user_id", id).order("month", { ascending: false }).limit(12)
      : Promise.resolve({ data: [], error: null }),
    canReadProjects
      ? supabase.from("projects").select("id,name,status,area_m2,created_at").eq("user_id", id).order("created_at", { ascending: false }).limit(50)
      : Promise.resolve({ data: [], error: null }),
    canReadAudit
      ? supabase.from("admin_audit_log").select("actor_id,action,target_user_id,created_at").eq("target_user_id", id).order("created_at", { ascending: false }).limit(50)
      : Promise.resolve({ data: [], error: null }),
  ])

  if (profileResult.error || usageResult.error || projectsResult.error || logsResult.error) {
    throw new Error("Falha ao carregar os dados do usuário")
  }

  const profile = profileResult.data ?? {
    user_id: id,
    email: clerkUser.primaryEmailAddress?.emailAddress ?? clerkUser.emailAddresses[0]?.emailAddress ?? null,
    full_name: clerkUser.fullName || [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") || null,
    plan: "free",
    role: "user",
    bonus_credits: 0,
    can_create_memorials: true,
    can_delete_memorials: true,
    created_at: new Date(clerkUser.createdAt).toISOString(),
  }
  const canManageUsers = access.permissions.includes(ADMIN_PERMISSIONS.usersManage)
  const canManagePlan = access.permissions.includes(ADMIN_PERMISSIONS.plansManage)
  const canManageUsage = access.permissions.includes(ADMIN_PERMISSIONS.usageManage)

  return (
    <AdminPage title={profile.email ?? id} description={`${profile.full_name ?? "Usuário"} · ${profile.role} · plano ${profile.plan === "pro" ? "Pro" : "Grátis"}`}>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Resumo da conta">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 text-sm text-zinc-500">
          Perfil<strong className="mt-1 block text-zinc-100">{profile.role === "admin" ? "Admin" : "Usuário"}</strong>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 text-sm text-zinc-500">
          Plano<strong className="mt-1 block text-zinc-100">{profile.plan === "pro" ? "Pro" : "Grátis"}</strong>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 text-sm text-zinc-500">
          Status<strong className="mt-1 block">{clerkUser.banned ? <Badge variant="destructive">Suspenso</Badge> : <Badge variant="secondary">Ativo</Badge>}</strong>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 text-sm text-zinc-500">
          Cadastro<strong className="mt-1 block text-zinc-100">{new Date(profile.created_at).toLocaleDateString("pt-BR")}</strong>
        </div>
      </section>

      <UserPermissionControls
        user={{
          user_id: profile.user_id,
          email: profile.email,
          plan: profile.plan,
          role: profile.role,
          can_create_memorials: profile.can_create_memorials ?? true,
          can_delete_memorials: profile.can_delete_memorials ?? true,
        }}
        canManageUsers={canManageUsers}
        canManagePlan={canManagePlan}
      />
      <UserAccountActions
        userId={id}
        initialSuspended={clerkUser.banned}
        initialBonusCredits={Number(profile.bonus_credits ?? 0)}
        canManageUsers={canManageUsers}
        canManageUsage={canManageUsage}
      />

      {canReadUsage && (
        <AdminTable
          headers={["Mês", "Memoriais usados"]}
          rows={(usageResult.data ?? []).map((item) => [
            new Date(item.month).toLocaleDateString("pt-BR", { month: "long", year: "numeric" }),
            String(item.memorials_used),
          ])}
        />
      )}
      {canReadProjects && (
        <AdminTable
          headers={["Projeto", "Status", "Área", "Criado em"]}
          rows={(projectsResult.data ?? []).map((item) => [
            item.name,
            statusLabels[item.status as ProjectStatus] ?? "Desconhecido",
            item.area_m2 ? `${Number(item.area_m2).toLocaleString("pt-BR")} m²` : "—",
            new Date(item.created_at).toLocaleDateString("pt-BR"),
          ])}
        />
      )}
      {canReadAudit && (
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
