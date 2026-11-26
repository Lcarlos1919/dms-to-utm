"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { FolderOpen, Search } from "lucide-react"
import { DashboardCard } from "@/components/dashboard/dashboard-card"
import { Badge } from "@/components/ui/badge"
import { formatArea, formatDate, statusLabels, type ProjectStatus } from "@/lib/format"

export type ProjectRow = {
  id: string
  name: string
  status: ProjectStatus
  area_m2: number | null
  created_at: string
  memorial_type?: string | null
  azimute_status?: string | null
}

/** Status mostrado na lista: memoriais por azimute dizem o que falta para ficarem prontos. */
function rotuloStatus(project: ProjectRow): string {
  if (project.memorial_type === "azimute" && project.status !== "ready" && project.status !== "processing") {
    if (project.azimute_status === "revisado") return "Falta o ponto de partida"
    if (project.azimute_status === "lido" || project.azimute_status === "erro_leitura") return "Revisar tabela"
    if (project.azimute_status === "pendente") return "Aguardando leitura"
  }
  return statusLabels[project.status] ?? project.status
}

const projectGrid = "sm:grid-cols-[minmax(0,2fr)_minmax(110px,1fr)_minmax(110px,1fr)_minmax(130px,1fr)]"

/** Busca sem acento e sem diferença de maiúsculas, pelo nome e pelo status. */
const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim()

export function ProjectsTable({ projects }: { projects: ProjectRow[] }) {
  const [busca, setBusca] = useState("")
  const filtrados = useMemo(() => {
    const termo = normalizar(busca)
    if (!termo) return projects
    return projects.filter((p) => normalizar(`${p.name} ${rotuloStatus(p)}`).includes(termo))
  }, [projects, busca])

  if (projects.length === 0) {
    return (
      <DashboardCard>
        <div className="p-12 text-center">
          <FolderOpen className="mx-auto h-8 w-8 text-zinc-600" aria-hidden="true" />
          <p className="mt-3 font-medium text-zinc-300">Nenhum projeto ainda</p>
          <p className="mt-1 text-sm text-zinc-500">Envie seu primeiro memorial descritivo para começar.</p>
        </div>
      </DashboardCard>
    )
  }

  return (
    <div className="space-y-3">
      <label className="relative block">
        <span className="sr-only">Pesquisar memoriais</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" aria-hidden="true" />
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Pesquisar memoriais pelo nome ou status"
          className="w-full rounded-xl border border-zinc-800 bg-zinc-900/60 py-2.5 pl-9 pr-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-zinc-600 focus:outline-none focus:ring-2 focus:ring-zinc-700"
        />
      </label>

      {filtrados.length === 0 ? (
        <p className="px-1 py-6 text-center text-sm text-zinc-500">Nenhum memorial encontrado para “{busca}”.</p>
      ) : (
        <>
          <div className={`hidden grid-cols-4 gap-4 px-5 text-xs font-medium text-zinc-500 ${projectGrid} sm:grid`} aria-hidden="true">
            <span>Nome</span>
            <span>Status</span>
            <span>Área</span>
            <span>Criado em</span>
          </div>
          {filtrados.map((project) => (
            <div key={project.id}>
              <DashboardCard>
                <div className="group relative">
                  <Link
                    href={`/dashboard/projeto/${project.id}`}
                    aria-label={`Abrir projeto ${project.name}`}
                    className="absolute inset-0 z-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-zinc-400"
                  />
                  <div className={`pointer-events-none relative z-10 grid grid-cols-2 gap-x-4 gap-y-3 p-4 sm:grid-cols-4 sm:items-center sm:gap-4 ${projectGrid}`}>
                    <div className="col-span-2 min-w-0 sm:col-span-1">
                      <span className="mb-1 block text-xs text-zinc-500 sm:hidden">Nome</span>
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-medium text-zinc-100 transition-colors group-hover:underline">{project.name}</span>
                        {project.memorial_type === "azimute" && <Badge variant="outline" className="shrink-0">Azimute</Badge>}
                      </div>
                    </div>
                    <div>
                      <span className="mb-1 block text-xs text-zinc-500 sm:hidden">Status</span>
                      <p className="text-sm text-zinc-400">{rotuloStatus(project)}</p>
                    </div>
                    <div>
                      <span className="mb-1 block text-xs text-zinc-500 sm:hidden">Área</span>
                      <p className="text-sm text-zinc-400">{formatArea(project.area_m2)}</p>
                    </div>
                    <div>
                      <span className="mb-1 block text-xs text-zinc-500 sm:hidden">Criado em</span>
                      <p className="text-sm text-zinc-400">{formatDate(project.created_at)}</p>
                    </div>
                  </div>
                </div>
              </DashboardCard>
            </div>
          ))}
        </>
      )}
    </div>
  )
}
