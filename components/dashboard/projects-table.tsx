"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTransition, type MouseEvent } from "react"
import { FolderOpen, Trash2 } from "lucide-react"
import { excluirProjeto } from "@/app/dashboard/novo/actions"
import { DashboardCard } from "@/components/dashboard/dashboard-card"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { formatArea, formatDate, statusLabels, type ProjectStatus } from "@/lib/format"
import { cn } from "@/lib/utils"

export type ProjectRow = {
  id: string
  name: string
  status: ProjectStatus
  area_m2: number | null
  created_at: string
}

const projectGrid = "sm:grid-cols-[minmax(0,2fr)_minmax(110px,1fr)_minmax(110px,1fr)_minmax(130px,1fr)]"

function DeleteProjectButton({ projectId, projectName, canDeleteMemorials }: { projectId: string; projectName: string; canDeleteMemorials: boolean }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const disabledReason = "Excluir disponível no plano Pro"

  function handleDelete(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault()
    event.stopPropagation()
    if (!canDeleteMemorials || isPending) return
    if (!window.confirm(`Excluir o projeto “${projectName}” e seus arquivos definitivamente? Essa ação não pode ser desfeita.`)) return
    startTransition(async () => {
      const result = await excluirProjeto(projectId)
      if (!result.ok) window.alert(result.error)
      else router.refresh()
    })
  }

  const deleteButton = (
    <button
      type="button"
      onClick={handleDelete}
      disabled={isPending}
      aria-disabled={!canDeleteMemorials || isPending}
      aria-label={`Excluir memorial ${projectName}`}
      className={cn(
        "pointer-events-auto relative z-20 rounded-lg p-2 text-zinc-500 transition-colors",
        canDeleteMemorials
          ? "hover:bg-red-950/40 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-50"
          : "cursor-not-allowed opacity-50",
      )}
    >
      <Trash2 className="h-4 w-4" aria-hidden="true" />
    </button>
  )

  if (!canDeleteMemorials) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{deleteButton}</TooltipTrigger>
        <TooltipContent side="top">{disabledReason}</TooltipContent>
      </Tooltip>
    )
  }

  return deleteButton
}

export function ProjectsTable({ projects, canDeleteMemorials = false }: { projects: ProjectRow[]; canDeleteMemorials?: boolean }) {
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
      <div className={`hidden grid-cols-4 gap-4 px-5 text-xs font-medium text-zinc-500 ${projectGrid} sm:grid`} aria-hidden="true">
        <span>Nome</span>
        <span>Status</span>
        <span>Área</span>
        <span>Criado em</span>
      </div>
      {projects.map((project) => (
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
                    <span className="truncate font-medium text-zinc-100 transition-colors group-hover:underline">
                      {project.name}
                    </span>
                    <DeleteProjectButton
                      projectId={project.id}
                      projectName={project.name}
                      canDeleteMemorials={canDeleteMemorials}
                    />
                  </div>
                </div>
                <div>
                  <span className="mb-1 block text-xs text-zinc-500 sm:hidden">Status</span>
                  <p className="text-sm text-zinc-400">{statusLabels[project.status] ?? project.status}</p>
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
    </div>
  )
}
