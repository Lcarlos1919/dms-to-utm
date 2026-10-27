import Link from "next/link"
import { clerkClient } from "@clerk/nextjs/server"
import { AdminPage } from "@/components/admin/admin-page"
import { AdminProjectDeleteButton } from "@/components/admin/project-delete-button"
import { AdminProjectReprocessButton } from "@/components/admin/project-reprocess-button"
import { Badge } from "@/components/ui/badge"
import { Forbidden } from "@/components/admin/forbidden"
import { ADMIN_PERMISSIONS, ForbiddenError, requirePermission } from "@/lib/admin-auth"
import { resolveAdminUserDirectory } from "@/lib/admin-user-directory"
import { formatArea, formatDate, statusLabels, type ProjectStatus } from "@/lib/format"
import { createAdminClient } from "@/lib/supabase/server"

type SearchParams = Promise<{ status?: string | string[]; user?: string | string[] }>
type AdminProjectRow = {
  id: string
  user_id: string
  name: string
  status: string
  area_m2: number | null
  error_code: string | null
  error_message: string | null
  created_at: string
}

const projectStatuses: ProjectStatus[] = ["draft", "processing", "ready", "error"]

export default async function AdminProjectsPage({ searchParams }: { searchParams: SearchParams }) {
  let access
  try {
    access = await requirePermission(ADMIN_PERMISSIONS.projectsRead)
  } catch (error) {
    if (error instanceof ForbiddenError) return <Forbidden />
    throw error
  }

  const params = await searchParams
  const rawStatus = Array.isArray(params.status) ? params.status[0] : params.status
  const rawUser = Array.isArray(params.user) ? params.user[0] : params.user
  const status = projectStatuses.includes(rawStatus as ProjectStatus) ? rawStatus as ProjectStatus : "all"
  const userSearch = rawUser?.trim().slice(0, 120) ?? ""
  const supabase = createAdminClient()
  let userIds: string[] | undefined

  if (userSearch) {
    if (/^user_[a-zA-Z0-9]+$/.test(userSearch)) {
      userIds = [userSearch]
    } else {
      const clerk = await clerkClient()
      const [clerkResult, profileResult] = await Promise.all([
        clerk.users.getUserList({ query: userSearch, limit: 100 }),
        userSearch.includes("@")
          ? supabase
              .from("profiles")
              .select("user_id")
              .ilike("email", `%${userSearch.replace(/[\\%_]/g, (character) => `\\${character}`)}%`)
              .limit(100)
          : Promise.resolve({ data: [], error: null }),
      ])
      if (profileResult.error) throw new Error("Falha ao localizar usuários dos projetos.")
      userIds = [...new Set([
        ...clerkResult.data.map((user) => user.id),
        ...(profileResult.data ?? []).map((profile) => profile.user_id),
      ])]
    }
  }

  let query = supabase
    .from("projects")
    .select("id,user_id,name,status,area_m2,error_code,error_message,created_at")
    .order("created_at", { ascending: false })
    .limit(100)

  if (status !== "all") query = query.eq("status", status)
  if (userIds?.length) query = query.in("user_id", userIds)

  let rows: AdminProjectRow[] = []
  if (userIds?.length !== 0) {
    const { data, error } = await query
    if (error) throw new Error("Falha ao carregar projetos.")
    rows = (data ?? []) as AdminProjectRow[]
  }
  const users = await resolveAdminUserDirectory(rows.map((project) => project.user_id))
  const canManage = access.permissions.includes(ADMIN_PERMISSIONS.projectsManage)
  const canDelete = access.permissions.includes(ADMIN_PERMISSIONS.projectsDelete)
  const showActions = canManage || canDelete

  return (
    <AdminPage title="Projetos" description="Memoriais enviados à plataforma, erros e ações de suporte.">
      <form action="/admin/projetos" method="get" className="flex flex-wrap items-end gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
        <label className="flex flex-col gap-2 text-sm text-zinc-400">
          Status
          <select name="status" defaultValue={status} className="min-w-48 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100">
            <option value="all">Todos os status</option>
            {projectStatuses.map((projectStatus) => <option key={projectStatus} value={projectStatus}>{statusLabels[projectStatus]}</option>)}
          </select>
        </label>
        <label className="flex min-w-56 flex-col gap-2 text-sm text-zinc-400">
          Usuário (e-mail ou ID)
          <input
            type="search"
            name="user"
            defaultValue={userSearch}
            maxLength={120}
            placeholder="nome@dominio.com"
            className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-600"
          />
        </label>
        <button type="submit" className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400">Filtrar</button>
      </form>

      <div className="overflow-x-auto rounded-xl border border-zinc-800">
        <table className="w-full min-w-[1150px] text-left text-sm">
          <caption className="sr-only">Projetos enviados à plataforma</caption>
          <thead className="border-b border-zinc-800 text-zinc-500">
            <tr>{["Projeto", "Usuário", "Status", "Área", "Erro", "Criado em", ...(showActions ? ["Ações"] : [])].map((header) => <th key={header} className="px-4 py-3 font-medium">{header}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((project) => {
              const identity = users.get(project.user_id)
              const projectStatus = project.status as ProjectStatus
              const badgeVariant = projectStatus === "error" ? "destructive" : projectStatus === "ready" ? "secondary" : "outline"

              return (
                <tr key={project.id} className="border-b border-zinc-800/70 last:border-0">
                  <td className="px-4 py-4 text-zinc-200">
                    <Link href={`/admin/projetos/${project.id}`} className="font-medium hover:text-white hover:underline">{project.name}</Link>
                  </td>
                  <td className="px-4 py-4">
                    <p className="text-zinc-200">{identity?.fullName ?? "Sem nome"}</p>
                    <p className="text-xs text-zinc-500">{identity?.email ?? "E-mail indisponível"}</p>
                  </td>
                  <td className="px-4 py-4"><Badge variant={badgeVariant}>{statusLabels[projectStatus] ?? "Desconhecido"}</Badge></td>
                  <td className="px-4 py-4 text-zinc-400">{formatArea(project.area_m2)}</td>
                  <td className="max-w-72 px-4 py-4">
                    {project.error_code || project.error_message ? (
                      <div title={project.error_message ?? undefined}>
                        <p className="font-mono text-xs text-red-300">{project.error_code ?? "ERRO"}</p>
                        <p className="mt-1 line-clamp-2 text-xs text-zinc-400">{project.error_message ?? "Mensagem indisponível."}</p>
                      </div>
                    ) : <span className="text-zinc-600">—</span>}
                  </td>
                  <td className="px-4 py-4 text-zinc-500">{formatDate(project.created_at)}</td>
                  {showActions && (
                    <td className="px-4 py-4">
                      <div className="flex flex-col items-start gap-2">
                        {canManage && projectStatus === "error" && <AdminProjectReprocessButton projectId={project.id} projectName={project.name} />}
                        {canDelete && <AdminProjectDeleteButton projectId={project.id} projectName={project.name} />}
                      </div>
                    </td>
                  )}
                </tr>
              )
            })}
            {rows.length === 0 && <tr><td colSpan={showActions ? 7 : 6} className="px-4 py-10 text-center text-zinc-500">Nenhum projeto encontrado.</td></tr>}
          </tbody>
        </table>
      </div>
    </AdminPage>
  )
}
