import { AdminPage } from "@/components/admin/admin-page"
import { AdminProjectDeleteButton } from "@/components/admin/project-delete-button"
import { Badge } from "@/components/ui/badge"
import { Forbidden } from "@/components/admin/forbidden"
import { ADMIN_PERMISSIONS, ForbiddenError, requirePermission } from "@/lib/admin-auth"
import { resolveAdminUserDirectory } from "@/lib/admin-user-directory"
import { formatArea, formatDate, statusLabels, type ProjectStatus } from "@/lib/format"
import { createAdminClient } from "@/lib/supabase/server"

type SearchParams = Promise<{ status?: string | string[] }>

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
  const status = projectStatuses.includes(rawStatus as ProjectStatus) ? rawStatus as ProjectStatus : "all"
  let query = createAdminClient()
    .from("projects")
    .select("id,user_id,name,status,area_m2,created_at")
    .order("created_at", { ascending: false })
    .limit(100)

  if (status !== "all") query = query.eq("status", status)

  const { data, error } = await query
  if (error) throw new Error("Falha ao carregar projetos.")

  const projects = data ?? []
  const users = await resolveAdminUserDirectory(projects.map((project) => project.user_id))
  const canDelete = access.orgRole === "org:admin"

  return (
    <AdminPage title="Projetos" description="Todos os memoriais enviados à plataforma.">
      <form action="/admin/projetos" method="get" className="flex flex-wrap items-end gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
        <div className="flex flex-col gap-2">
          <label htmlFor="project-status" className="text-sm text-zinc-400">Filtrar por status</label>
          <select id="project-status" name="status" defaultValue={status} className="min-w-48 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100">
            <option value="all">Todos os status</option>
            {projectStatuses.map((projectStatus) => <option key={projectStatus} value={projectStatus}>{statusLabels[projectStatus]}</option>)}
          </select>
        </div>
        <button type="submit" className="rounded-lg bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400">Filtrar</button>
      </form>

      <div className="overflow-x-auto rounded-xl border border-zinc-800">
        <table className="w-full min-w-[900px] text-left text-sm">
          <caption className="sr-only">Projetos enviados à plataforma</caption>
          <thead className="border-b border-zinc-800 text-zinc-500">
            <tr>{["Projeto", "Usuário", "Status", "Área", "Criado em", ...(canDelete ? ["Ações"] : [])].map((header) => <th key={header} className="px-4 py-3 font-medium">{header}</th>)}</tr>
          </thead>
          <tbody>
            {projects.map((project) => {
              const identity = users.get(project.user_id)
              const projectStatus = project.status as ProjectStatus
              const badgeVariant = projectStatus === "error" ? "destructive" : projectStatus === "ready" ? "secondary" : "outline"

              return (
                <tr key={project.id} className="border-b border-zinc-800/70 last:border-0">
                  <td className="px-4 py-4 text-zinc-200">{project.name}</td>
                  <td className="px-4 py-4">
                    <p className="text-zinc-200">{identity?.fullName ?? "Sem nome"}</p>
                    <p className="text-xs text-zinc-500">{identity?.email ?? "E-mail indisponível"}</p>
                  </td>
                  <td className="px-4 py-4"><Badge variant={badgeVariant}>{statusLabels[projectStatus] ?? "Desconhecido"}</Badge></td>
                  <td className="px-4 py-4 text-zinc-400">{formatArea(project.area_m2)}</td>
                  <td className="px-4 py-4 text-zinc-500">{formatDate(project.created_at)}</td>
                  {canDelete && <td className="px-4 py-4"><AdminProjectDeleteButton projectId={project.id} projectName={project.name} /></td>}
                </tr>
              )
            })}
            {projects.length === 0 && <tr><td colSpan={canDelete ? 6 : 5} className="px-4 py-10 text-center text-zinc-500">Nenhum projeto encontrado.</td></tr>}
          </tbody>
        </table>
      </div>
    </AdminPage>
  )
}
