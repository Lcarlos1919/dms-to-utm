import Link from "next/link"
import { notFound } from "next/navigation"
import { AdminPage } from "@/components/admin/admin-page"
import { AdminProjectDownloads } from "@/components/admin/project-downloads"
import { Forbidden } from "@/components/admin/forbidden"
import { Badge } from "@/components/ui/badge"
import { ADMIN_PERMISSIONS, ForbiddenError, requirePermission } from "@/lib/admin-auth"
import { resolveAdminUserDirectory } from "@/lib/admin-user-directory"
import { formatArea, formatDate, statusLabels, type ProjectStatus } from "@/lib/format"
import { createAdminClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

export default async function AdminProjectDetail({ params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission(ADMIN_PERMISSIONS.projectsRead)
  } catch (error) {
    if (error instanceof ForbiddenError) return <Forbidden />
    throw error
  }

  const { id } = await params
  const { data: project, error } = await createAdminClient()
    .from("projects")
    .select("id,user_id,name,status,original_filename,source_pdf_path,area_m2,perimeter_m,utm_zone,datum,error_code,error_message,created_at,updated_at")
    .eq("id", id)
    .maybeSingle()

  if (error) throw new Error("Falha ao carregar projeto.")
  if (!project) notFound()

  const users = await resolveAdminUserDirectory([project.user_id])
  const user = users.get(project.user_id)
  const status = project.status as ProjectStatus

  return (
    <AdminPage title={project.name} description="Detalhes, processamento e arquivos do memorial.">
      <Link href="/admin/projetos" className="w-fit text-sm text-zinc-400 hover:text-zinc-100">Voltar aos projetos</Link>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Resumo do projeto">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 text-sm text-zinc-500">
          Status<strong className="mt-2 block"><Badge variant={status === "error" ? "destructive" : status === "ready" ? "secondary" : "outline"}>{statusLabels[status] ?? "Desconhecido"}</Badge></strong>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 text-sm text-zinc-500">
          Usuário<strong className="mt-1 block text-zinc-100">{user?.fullName ?? "Sem nome"}</strong>
          <span className="mt-1 block text-xs text-zinc-500">{user?.email ?? project.user_id}</span>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 text-sm text-zinc-500">
          Área<strong className="mt-1 block text-zinc-100">{formatArea(project.area_m2)}</strong>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 text-sm text-zinc-500">
          Criado em<strong className="mt-1 block text-zinc-100">{formatDate(project.created_at)}</strong>
          <span className="mt-1 block text-xs text-zinc-500">Atualizado em {formatDate(project.updated_at)}</span>
        </div>
      </section>

      {project.error_code || project.error_message ? (
        <section className="rounded-xl border border-red-900/60 bg-red-950/20 p-4" aria-label="Erro de processamento">
          <h2 className="font-medium text-red-200">Erro de processamento</h2>
          {project.error_code && <p className="mt-2 font-mono text-xs text-red-300">{project.error_code}</p>}
          {project.error_message && <p className="mt-1 text-sm text-red-200/80">{project.error_message}</p>}
        </section>
      ) : null}

      <dl className="grid gap-4 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 sm:grid-cols-2">
        <div>
          <dt className="text-xs text-zinc-500">Arquivo PDF original</dt>
          <dd className="mt-1 break-all text-sm text-zinc-200">{project.original_filename ?? "Não informado"}</dd>
        </div>
        <div>
          <dt className="text-xs text-zinc-500">Sistema de coordenadas</dt>
          <dd className="mt-1 text-sm text-zinc-200">{project.datum ?? "—"} · UTM {project.utm_zone ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-zinc-500">Perímetro</dt>
          <dd className="mt-1 text-sm text-zinc-200">{project.perimeter_m == null ? "—" : `${Number(project.perimeter_m).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} m`}</dd>
        </div>
      </dl>

      <AdminProjectDownloads
        projectId={project.id}
        hasPdf={Boolean(project.source_pdf_path)}
        canExport={project.status === "ready"}
      />
    </AdminPage>
  )
}
