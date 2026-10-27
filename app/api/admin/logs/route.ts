import { ADMIN_PERMISSIONS, requireStaffApiPermission } from "@/lib/admin-auth"
import { jsonError } from "@/lib/admin"
import { createAdminClient } from "@/lib/supabase/server"

const PAGE_SIZE = 500
const MAX_ROWS = 10000

function csvCell(value: string | number | null) {
  let text = String(value ?? "")
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return `"${text.replace(/"/g, '""')}"`
}

export async function GET(request: Request) {
  const authorization = await requireStaffApiPermission(ADMIN_PERMISSIONS.auditRead)
  if (!authorization.ok) return authorization.response

  const searchParams = new URL(request.url).searchParams
  const actor = searchParams.get("actor")?.trim().slice(0, 120) ?? ""
  const action = searchParams.get("action")?.trim().slice(0, 120) ?? ""
  const supabase = createAdminClient()
  const logs: { actor_id: string; target_user_id: string | null; action: string; created_at: string }[] = []

  for (let offset = 0; offset < MAX_ROWS; offset += PAGE_SIZE) {
    let query = supabase
      .from("admin_audit_log")
      .select("actor_id,target_user_id,action,created_at")
      .order("created_at", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1)

    if (actor) query = query.ilike("actor_id", `%${actor}%`)
    if (action) query = query.ilike("action", `%${action}%`)

    const { data, error } = await query
    if (error) return jsonError("Não foi possível exportar os logs", 500)

    logs.push(...(data ?? []))
    if (!data || data.length < PAGE_SIZE) break
  }

  const rows = [
    ["ator_id", "alvo_id", "ação", "data"],
    ...logs.map((log) => [log.actor_id, log.target_user_id, log.action, log.created_at]),
  ]
  const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`

  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="vertix-admin-logs.csv"',
      "cache-control": "no-store",
    },
  })
}
