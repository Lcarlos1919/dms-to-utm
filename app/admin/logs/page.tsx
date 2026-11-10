import Link from "next/link"
import { AdminPage, AdminTable } from "@/components/admin/admin-page"
import { Forbidden } from "@/components/admin/forbidden"
import { ADMIN_PERMISSIONS, ForbiddenError, requirePermission } from "@/lib/admin-auth"
import { createAdminClient } from "@/lib/supabase/server"
import { formatDateTime } from "@/lib/format"

type SearchParams = Promise<{ actor?: string | string[]; action?: string | string[] }>

export default async function AdminLogsPage({ searchParams }: { searchParams: SearchParams }) {
  try {
    await requirePermission(ADMIN_PERMISSIONS.auditRead)
  } catch (error) {
    if (error instanceof ForbiddenError) return <Forbidden />
    throw error
  }

  const params = await searchParams
  const rawActor = Array.isArray(params.actor) ? params.actor[0] : params.actor
  const rawAction = Array.isArray(params.action) ? params.action[0] : params.action
  const actor = rawActor?.trim().slice(0, 120) ?? ""
  const action = rawAction?.trim().slice(0, 120) ?? ""
  let query = createAdminClient()
    .from("admin_audit_log")
    .select("actor_id,target_user_id,action,created_at")
    .order("created_at", { ascending: false })
    .limit(100)

  if (actor) query = query.ilike("actor_id", `%${actor}%`)
  if (action) query = query.ilike("action", `%${action}%`)

  const { data, error } = await query
  if (error) throw new Error("Falha ao carregar auditoria administrativa")

  const exportParams = new URLSearchParams()
  if (actor) exportParams.set("actor", actor)
  if (action) exportParams.set("action", action)
  const exportQuery = exportParams.toString()

  return (
    <AdminPage title="Logs de auditoria" description="Ações administrativas, com filtros e exportação CSV.">
      <form action="/admin/logs" method="get" className="flex flex-wrap items-end gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
        <label className="flex min-w-48 flex-col gap-2 text-sm text-zinc-400">
          Ator (ID)
          <input name="actor" defaultValue={actor} maxLength={120} className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100" />
        </label>
        <label className="flex min-w-48 flex-col gap-2 text-sm text-zinc-400">
          Ação
          <input name="action" defaultValue={action} maxLength={120} className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100" />
        </label>
        <button type="submit" className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-200">Filtrar</button>
        <Link href={`/api/admin/logs${exportQuery ? `?${exportQuery}` : ""}`} className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-200 hover:bg-zinc-900">
          Exportar CSV
        </Link>
      </form>

      <AdminTable
        headers={["Ator", "Alvo", "Ação", "Data"]}
        rows={(data ?? []).map((log) => [
          log.actor_id,
          log.target_user_id ?? "—",
          log.action,
          formatDateTime(log.created_at),
        ])}
      />
    </AdminPage>
  )
}
