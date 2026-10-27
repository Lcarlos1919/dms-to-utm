import { clerkClient } from "@clerk/nextjs/server"
import { AdminPage, AdminStatGrid, AdminTable } from "@/components/admin/admin-page"
import { ADMIN_PERMISSIONS, requireStaff } from "@/lib/admin-auth"
import { currentMonth, getMonthlyUsageTotal } from "@/lib/usage"
import { formatDate, statusLabels, type ProjectStatus } from "@/lib/format"
import { createAdminClient } from "@/lib/supabase/server"

const projectStatuses: ProjectStatus[] = ["draft", "processing", "ready", "error"]
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

function startOfUtcWeek(date: Date) {
  const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const weekday = start.getUTCDay() || 7
  start.setUTCDate(start.getUTCDate() - weekday + 1)
  return start
}

async function getUserMetrics() {
  const clerk = await clerkClient()
  const firstWeek = startOfUtcWeek(new Date())
  firstWeek.setUTCDate(firstWeek.getUTCDate() - 7 * 7)
  const weekStarts = Array.from({ length: 8 }, (_, index) => new Date(firstWeek.getTime() + index * WEEK_MS))
  const weeklyCounts = new Map(weekStarts.map((week) => [week.toISOString().slice(0, 10), 0]))
  const firstPage = await clerk.users.getUserList({ limit: 100, offset: 0, orderBy: "-created_at" })
  const totalUsers = firstPage.totalCount ?? 0
  let users = firstPage.data
  let offset = 0

  while (users.length > 0) {
    for (const user of users) {
      const createdAt = new Date(user.createdAt)
      if (createdAt >= firstWeek) {
        const key = startOfUtcWeek(createdAt).toISOString().slice(0, 10)
        weeklyCounts.set(key, (weeklyCounts.get(key) ?? 0) + 1)
      }
    }

    offset += users.length
    const oldest = users[users.length - 1]
    if (!oldest || new Date(oldest.createdAt) < firstWeek || offset >= totalUsers) break
    const nextPage = await clerk.users.getUserList({ limit: 100, offset, orderBy: "-created_at" })
    users = nextPage.data
  }

  const weeklyRows = weekStarts.map((week) => {
    const end = new Date(week.getTime() + WEEK_MS - 1)
    return [
      `${formatDate(week.toISOString())} – ${formatDate(end.toISOString())}`,
      String(weeklyCounts.get(week.toISOString().slice(0, 10)) ?? 0),
    ]
  })

  return { totalUsers, weeklyRows }
}

export default async function AdminPageRoute() {
  const access = await requireStaff()
  const supabase = createAdminClient()
  const stats: { label: string; value: string; detail?: string }[] = []
  let statusRows: string[][] = []
  let weeklyRows: string[][] = []

  if (access.permissions.includes(ADMIN_PERMISSIONS.usersRead)) {
    const users = await getUserMetrics()
    stats.push({ label: "Usuários", value: String(users.totalUsers) })
    weeklyRows = users.weeklyRows
  }

  if (access.permissions.includes(ADMIN_PERMISSIONS.projectsRead)) {
    const [totalResult, statusResults, errorsResult] = await Promise.all([
      supabase.from("projects").select("id", { count: "exact", head: true }),
      Promise.all(projectStatuses.map((status) =>
        supabase.from("projects").select("id", { count: "exact", head: true }).eq("status", status),
      )),
      supabase.from("projects")
        .select("id", { count: "exact", head: true })
        .eq("status", "error")
        .gte("updated_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
    ])

    if (totalResult.error || errorsResult.error || statusResults.some((result) => result.error)) {
      throw new Error("Falha ao carregar as métricas de projetos.")
    }

    stats.push(
      { label: "Projetos", value: String(totalResult.count ?? 0) },
      { label: "Erros nos últimos 7 dias", value: String(errorsResult.count ?? 0) },
    )
    statusRows = projectStatuses.map((status, index) => [statusLabels[status], String(statusResults[index]?.count ?? 0)])
  }

  if (access.permissions.includes(ADMIN_PERMISSIONS.usageRead)) {
    const memorials = await getMonthlyUsageTotal(currentMonth())
    stats.push({ label: "Memoriais no mês", value: String(memorials), detail: currentMonth() })
  }

  if (access.permissions.includes(ADMIN_PERMISSIONS.billingRead)) {
    const { count, error } = await supabase
      .from("subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("status", "active")
    if (error) throw new Error("Falha ao carregar as métricas de assinaturas.")
    stats.push({ label: "Assinaturas ativas", value: String(count ?? 0) })
  }

  return (
    <AdminPage title="Visão geral" description="Acompanhe a operação do Vertix.">
      <AdminStatGrid stats={stats} />
      {statusRows.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-display text-lg font-semibold text-zinc-100">Projetos por status</h2>
          <AdminTable headers={["Status", "Projetos"]} rows={statusRows} />
        </section>
      )}
      {weeklyRows.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-display text-lg font-semibold text-zinc-100">Novos usuários por semana</h2>
          <AdminTable headers={["Semana", "Novos usuários"]} rows={weeklyRows} />
        </section>
      )}
    </AdminPage>
  )
}
