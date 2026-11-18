"use client"

import { useRouter } from "next/navigation"
import { useTransition, type MouseEvent } from "react"
import { Compass, FileText, FolderOpen, Trash2 } from "lucide-react"
import AnimatedList from "@/components/AnimatedList"
import { excluirProjeto } from "@/app/dashboard/novo/actions"
import { DashboardCard } from "@/components/dashboard/dashboard-card"
import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { formatArea, formatDate, statusLabels, type ProjectStatus } from "@/lib/format"
import { cn } from "@/lib/utils"

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
        "relative z-20 shrink-0 rounded-lg p-2 text-zinc-500 transition-colors",
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
  const router = useRouter()

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

  // Lista com rolagem animada (React Bits AnimatedList): clique, Enter ou setas ↑/↓ para navegar.
  return (
    <AnimatedList
      items={projects.map((project) => ({ id: project.id, title: project.name }))}
      onItemSelect={(_item, index) => router.push(`/dashboard/projeto/${projects[index].id}`)}
      animation="pop"
      theme="dark"
      width="100%"
      maxHeight="min(70vh, 720px)"
      renderItem={(_item, index) => {
        const project = projects[index]
        const Icone = project.memorial_type === "azimute" ? Compass : FileText
        return (
          <>
            <span className="flex size-10 flex-none items-center justify-center rounded-[10px] bg-white/[0.06] text-zinc-300">
              <Icone className="size-[18px]" aria-hidden="true" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate text-[14.5px] font-semibold leading-[1.3] tracking-[-0.01em]">{project.name}</span>
                {project.memorial_type === "azimute" && <Badge variant="outline" className="shrink-0">Azimute</Badge>}
              </span>
              <span className="truncate text-[13px] leading-[1.35] text-[color:var(--al-muted)]">
                {rotuloStatus(project)} · {formatArea(project.area_m2)}
              </span>
            </span>
            <span className="hidden flex-none text-[12.5px] tabular-nums text-[color:var(--al-muted)] sm:block">
              {formatDate(project.created_at)}
            </span>
            <DeleteProjectButton
              projectId={project.id}
              projectName={project.name}
              canDeleteMemorials={canDeleteMemorials}
            />
          </>
        )
      }}
    />
  )
}
