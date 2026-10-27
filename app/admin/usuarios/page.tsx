import Link from "next/link"
import { clerkClient } from "@clerk/nextjs/server"
import { AdminPage } from "@/components/admin/admin-page"
import { ClerkSyncButton } from "@/components/admin/clerk-sync-button"
import { UserPermissionControls } from "@/components/admin/user-permission-controls"
import { Badge } from "@/components/ui/badge"
import { ADMIN_PERMISSIONS, requirePermission } from "@/lib/admin-auth"
import { currentMonth } from "@/lib/usage"
import { formatDate } from "@/lib/format"
import { createAdminClient } from "@/lib/supabase/server"

const PAGE_SIZE = 50
const CLERK_BATCH_SIZE = 500

type SearchParams = Promise<{ page?: string | string[]; email?: string | string[]; plan?: string | string[] }>
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
  const rawEmail = Array.isArray(params.email) ? params.email[0] : params.email
  const rawPlan = Array.isArray(params.plan) ? params.plan[0] : params.plan
  const parsedPage = Number.parseInt(rawPage ?? "1", 10)
  const requestedPage = Number.isSafeInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1
  const emailSearch = rawEmail?.trim().slice(0, 120) ?? ""
  const selectedPlan = rawPlan === "free" || rawPlan === "pro" ? rawPlan : "all"
  const clerk = await clerkClient()
  const supabase = createAdminClient()
  type ClerkUser = Awaited<ReturnType<typeof clerk.users.getUser>>

  const profiles = new Map<string, UserProfile>()
  async function loadProfiles(userIds: string[]) {
    for (let index = 0; index < userIds.length; index += CLERK_BATCH_SIZE) {
      const batch = userIds.slice(index, index + CLERK_BATCH_SIZE)
      if (batch.length === 0) continue
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id,email,full_name,plan,role,bonus_credits,can_create_memorials,can_delete_memorials")
        .in("user_id", batch)
      if (error) throw new Error("Falha ao carregar os dados dos usuários.")
      for (const profile of data ?? []) profiles.set(profile.user_id, profile as UserProfile)
    }
  }

  let users: ClerkUser[] = []
  let page = requestedPage
  let totalCount = 0
  let totalPages = 1

  if (selectedPlan === "all") {
    let result = await clerk.users.getUserList({
      limit: PAGE_SIZE,
      offset: (requestedPage - 1) * PAGE_SIZE,
      query: emailSearch || undefined,
    })
    totalCount = result.totalCount ?? 0
    totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
    page = Math.min(requestedPage, totalPages)
    if (page !== requestedPage) {
      result = await clerk.users.getUserList({
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
        query: emailSearch || undefined,
      })
    }
    users = result.data
  } else {
    const matchingUsers: ClerkUser[] = []
    let offset = 0
    let clerkTotal = 0
    while (true) {
      const result = await clerk.users.getUserList({
        limit: CLERK_BATCH_SIZE,
        offset,
        query: emailSearch || undefined,
      })
      matchingUsers.push(...result.data)
      clerkTotal = result.totalCount ?? matchingUsers.length
      offset += result.data.length
      if (result.data.length === 0 || offset >= clerkTotal) break
    }

    await loadProfiles(matchingUsers.map((user) => user.id))
    const filteredUsers = matchingUsers.filter((user) => {
      const profile = profiles.get(user.id)
      return (profile?.plan === "pro" ? "pro" : "free") === selectedPlan
    })
    totalCount = filteredUsers.length
    totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE))
    page = Math.min(requestedPage, totalPages)
    users = filteredUsers.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
  }

  const userIds = users.map((user) => user.id)
  await loadProfiles(userIds.filter((userId) => !profiles.has(userId)))

  const usageByUser = new Map<string, number>()
  if (userIds.length > 0) {
    const { data, error } = await supabase
      .from("usage")
      .select("user_id,memorials_used")
      .eq("month", currentMonth())
      .in("user_id", userIds)
    if (error) throw new Error("Falha ao carregar o uso dos usuários.")
    for (const usage of data ?? []) usageByUser.set(usage.user_id, Number(usage.memorials_used ?? 0))
  }

  const canManageUsers = access.permissions.includes(ADMIN_PERMISSIONS.usersManage)
  const canManagePlan = access.permissions.includes(ADMIN_PERMISSIONS.plansManage)
  const canSync = access.orgRole === "org:admin"

  function pageUrl(nextPage: number) {
    const query = new URLSearchParams()
    if (emailSearch) query.set("email", emailSearch)
    if (selectedPlan !== "all") query.set("plan", selectedPlan)
    query.set("page", String(nextPage))
    return `/admin/usuarios?${query.toString()}`
  }

  return (
    <AdminPage title="Usuários" description="Contas do Clerk, plano, uso mensal e permissões individuais.">
      {canSync && <ClerkSyncButton />}

      <form action="/admin/usuarios" method="get" className="flex flex-wrap items-end gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
        <label className="flex min-w-56 flex-col gap-2 text-sm text-zinc-400">
          Buscar por e-mail
          <input
            type="search"
            name="email"
            defaultValue={emailSearch}
            maxLength={120}
            placeholder="nome@dominio.com"
            className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600"
          />
        </label>
        <label className="flex flex-col gap-2 text-sm text-zinc-400">
          Plano
          <select name="plan" defaultValue={selectedPlan} className="min-w-36 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100">
            <option value="all">Todos os planos</option>
            <option value="free">Grátis</option>
            <option value="pro">Pro</option>
          </select>
        </label>
        <button type="submit" className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-200">Filtrar</button>
      </form>

      <div className="overflow-x-auto rounded-xl border border-zinc-800">
        <table className="w-full min-w-[1100px] text-left text-sm">
          <caption className="sr-only">Usuários do Clerk e seus dados do Vertix</caption>
          <thead className="border-b border-zinc-800 text-zinc-500">
            <tr>{["Nome", "E-mail", "Plano", "Perfil", "Uso no mês", "Permissões", "Cadastro"].map((header) => <th key={header} className="px-4 py-3 font-medium">{header}</th>)}</tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const profile = profiles.get(user.id)
              const email = profile?.email ?? user.primaryEmailAddress?.emailAddress ?? user.emailAddresses[0]?.emailAddress ?? null
              const fullName = profile?.full_name || user.fullName || [user.firstName, user.lastName].filter(Boolean).join(" ")

              return (
                <tr key={user.id} className="border-b border-zinc-800/70 last:border-0">
                  <td className="px-4 py-4 text-zinc-200">
                    <Link href={`/admin/usuarios/${user.id}`} className="hover:text-white hover:underline">{fullName || "Sem nome"}</Link>
                  </td>
                  <td className="px-4 py-4 text-zinc-400">{email ?? "—"}</td>
                  <td className="px-4 py-4 text-zinc-400">{profile?.plan === "pro" ? "Pro" : "Grátis"}</td>
                  <td className="px-4 py-4 text-zinc-400">
                    <span>{profile?.role === "admin" ? "Admin" : "Usuário"}</span>
                    {user.banned && <Badge variant="destructive" className="ml-2">Suspenso</Badge>}
                  </td>
                  <td className="px-4 py-4 text-zinc-400">{usageByUser.get(user.id) ?? 0}</td>
                  <td className="px-4 py-4">
                    <UserPermissionControls
                      user={{
                        user_id: user.id,
                        email,
                        plan: profile?.plan ?? "free",
                        role: profile?.role ?? "user",
                        can_create_memorials: profile?.can_create_memorials ?? true,
                        can_delete_memorials: profile?.can_delete_memorials ?? true,
                      }}
                      canManageUsers={canManageUsers}
                      canManagePlan={canManagePlan}
                    />
                  </td>
                  <td className="px-4 py-4 text-zinc-500">{formatDate(new Date(user.createdAt).toISOString())}</td>
                </tr>
              )
            })}
            {users.length === 0 && <tr><td colSpan={7} className="px-4 py-10 text-center text-zinc-500">Nenhum usuário encontrado.</td></tr>}
          </tbody>
        </table>
      </div>

      <nav aria-label="Paginação de usuários" className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <p className="text-zinc-500">Página {page} de {totalPages} · {totalCount} usuário(s)</p>
        <div className="flex items-center gap-2">
          {page > 1 ? (
            <Link href={pageUrl(page - 1)} className="rounded-lg border border-zinc-800 px-3 py-2 text-zinc-300 hover:bg-zinc-900">Anterior</Link>
          ) : (
            <span aria-disabled="true" className="rounded-lg border border-zinc-900 px-3 py-2 text-zinc-600">Anterior</span>
          )}
          {page < totalPages ? (
            <Link href={pageUrl(page + 1)} className="rounded-lg border border-zinc-800 px-3 py-2 text-zinc-300 hover:bg-zinc-900">Próxima</Link>
          ) : (
            <span aria-disabled="true" className="rounded-lg border border-zinc-900 px-3 py-2 text-zinc-600">Próxima</span>
          )}
        </div>
      </nav>
    </AdminPage>
  )
}
