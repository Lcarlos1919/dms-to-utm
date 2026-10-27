import Link from "next/link"
import { clerkClient } from "@clerk/nextjs/server"
import { AdminPage } from "@/components/admin/admin-page"
import { ClerkSyncButton } from "@/components/admin/clerk-sync-button"
import { UserPermissionControls } from "@/components/admin/user-permission-controls"
import { ADMIN_PERMISSIONS, requirePermission } from "@/lib/admin-auth"
import { currentMonth } from "@/lib/usage"
import { formatDate } from "@/lib/format"
import { createAdminClient } from "@/lib/supabase/server"

const PAGE_SIZE = 50

type SearchParams = Promise<{ page?: string | string[] }>

type UserProfile = {
  user_id: string
  email: string | null
  full_name: string | null
  plan: string
  role: string
  bonus_credits: number
  can_create_memorials: boolean
  can_delete_memorials: boolean
}

export const dynamic = "force-dynamic"

export default async function AdminUsersPage({ searchParams }: { searchParams: SearchParams }) {
  const access = await requirePermission(ADMIN_PERMISSIONS.usersRead)
  const params = await searchParams
  const rawPage = Array.isArray(params.page) ? params.page[0] : params.page
  const parsedPage = Number.parseInt(rawPage ?? "1", 10)
  const requestedPage = Number.isSafeInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1
  const clerk = await clerkClient()

  let clerkPage = await clerk.users.getUserList({ limit: PAGE_SIZE, offset: (requestedPage - 1) * PAGE_SIZE })
  const totalCount = clerkPage.totalCount ?? 0
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
  const page = Math.min(requestedPage, totalPages)

  if (page !== requestedPage) {
    clerkPage = await clerk.users.getUserList({ limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE })
  }

  const userIds = clerkPage.data.map((user) => user.id)
  const profiles = new Map<string, UserProfile>()
  const usageByUser = new Map<string, number>()

  if (userIds.length > 0) {
    const supabase = createAdminClient()
    const [profilesResult, usageResult] = await Promise.all([
      supabase
        .from("profiles")
        .select("user_id,email,full_name,plan,role,bonus_credits,can_create_memorials,can_delete_memorials")
        .in("user_id", userIds),
      supabase
        .from("usage")
        .select("user_id,memorials_used")
        .eq("month", currentMonth())
        .in("user_id", userIds),
    ])

    if (profilesResult.error || usageResult.error) throw new Error("Falha ao carregar os dados dos usuários.")

    for (const profile of profilesResult.data ?? []) profiles.set(profile.user_id, profile as UserProfile)
    for (const usage of usageResult.data ?? []) usageByUser.set(usage.user_id, Number(usage.memorials_used ?? 0))
  }

  const canManage = access.permissions.includes(ADMIN_PERMISSIONS.usersManage)
  const canSync = access.orgRole === "org:admin"

  return (
    <AdminPage title="Usuários" description="Usuários do Clerk, uso mensal e permissões individuais.">
      {canSync && <ClerkSyncButton />}

      <div className="overflow-x-auto rounded-xl border border-zinc-800">
        <table className="w-full min-w-[900px] text-left text-sm">
          <caption className="sr-only">Usuários do Clerk e seus dados do TopoCAD</caption>
          <thead className="border-b border-zinc-800 text-zinc-500">
            <tr>{["Nome", "E-mail", "Plano", "Perfil", "Uso no mês", "Permissões", "Cadastro"].map((header) => <th key={header} className="px-4 py-3 font-medium">{header}</th>)}</tr>
          </thead>
          <tbody>
            {clerkPage.data.map((user) => {
              const profile = profiles.get(user.id)
              const email = profile?.email ?? user.primaryEmailAddress?.emailAddress ?? user.emailAddresses[0]?.emailAddress ?? null
              const fullName = profile?.full_name || user.fullName || [user.firstName, user.lastName].filter(Boolean).join(" ")

              return (
                <tr key={user.id} className="border-b border-zinc-800/70 last:border-0">
                  <td className="px-4 py-4 text-zinc-200">{fullName || "Sem nome"}</td>
                  <td className="px-4 py-4 text-zinc-400">{email ?? "—"}</td>
                  <td className="px-4 py-4 text-zinc-400">{profile?.plan === "pro" ? "Pro" : "Grátis"}</td>
                  <td className="px-4 py-4 text-zinc-400">{profile?.role === "admin" ? "Admin" : "Usuário"}</td>
                  <td className="px-4 py-4 text-zinc-400">{usageByUser.get(user.id) ?? 0}</td>
                  <td className="px-4 py-4">
                    {profile ? (
                      <UserPermissionControls
                        user={{
                          user_id: profile.user_id,
                          email: profile.email,
                          plan: profile.plan,
                          role: profile.role,
                          can_create_memorials: profile.can_create_memorials,
                          can_delete_memorials: profile.can_delete_memorials,
                        }}
                        canManage={canManage}
                      />
                    ) : (
                      <span className="text-xs text-zinc-500">Perfil ainda não sincronizado</span>
                    )}
                  </td>
                  <td className="px-4 py-4 text-zinc-500">{formatDate(new Date(user.createdAt).toISOString())}</td>
                </tr>
              )
            })}
            {clerkPage.data.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-zinc-500">Nenhum usuário encontrado no Clerk.</td></tr>}
          </tbody>
        </table>
      </div>

      <nav aria-label="Paginação de usuários" className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <p className="text-zinc-500">Página {page} de {totalPages} · {totalCount} usuário(s)</p>
        <div className="flex items-center gap-2">
          {page > 1 ? (
            <Link href={`/admin/usuarios?page=${page - 1}`} className="rounded-lg border border-zinc-800 px-3 py-2 text-zinc-300 hover:bg-zinc-900">Anterior</Link>
          ) : (
            <span aria-disabled="true" className="rounded-lg border border-zinc-900 px-3 py-2 text-zinc-600">Anterior</span>
          )}
          {page < totalPages ? (
            <Link href={`/admin/usuarios?page=${page + 1}`} className="rounded-lg border border-zinc-800 px-3 py-2 text-zinc-300 hover:bg-zinc-900">Próxima</Link>
          ) : (
            <span aria-disabled="true" className="rounded-lg border border-zinc-900 px-3 py-2 text-zinc-600">Próxima</span>
          )}
        </div>
      </nav>
    </AdminPage>
  )
}
