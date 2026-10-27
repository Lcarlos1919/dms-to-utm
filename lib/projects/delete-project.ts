import "server-only"

import { getMemorialPermissions } from "@/lib/profiles"
import { createAdminClient } from "@/lib/supabase/server"

export const MEMORIAL_DELETE_BLOCKED_MESSAGE = "A exclusão de memoriais está bloqueada para esta conta."

export class ProjectDeletionPermissionError extends Error {
  constructor() {
    super(MEMORIAL_DELETE_BLOCKED_MESSAGE)
    this.name = "ProjectDeletionPermissionError"
  }
}

/** Remove os arquivos do Storage e, em seguida, os dados do projeto pertencente ao usuário. */
async function removerProjetoCompleto(projectId: string, userId: string) {
  const supabase = createAdminClient()
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id,source_pdf_path")
    .eq("id", projectId)
    .eq("user_id", userId)
    .maybeSingle()

  if (projectError) throw new Error("Não foi possível localizar o projeto.")
  if (!project) return { ok: false as const, error: "Projeto não encontrado." }

  const { data: projectFiles, error: filesError } = await supabase
    .from("project_files")
    .select("storage_path")
    .eq("project_id", projectId)

  if (filesError) throw new Error("Não foi possível localizar os arquivos do projeto.")

  const storagePaths = new Set<string>()
  if (project.source_pdf_path) storagePaths.add(project.source_pdf_path)
  for (const file of projectFiles ?? []) {
    if (file.storage_path) storagePaths.add(file.storage_path)
  }

  if (storagePaths.size > 0) {
    const { error: storageError } = await supabase.storage
      .from("memoriais")
      .remove([...storagePaths])
    if (storageError) throw new Error("Não foi possível remover os arquivos do Storage.")
  }

  const { error: filesDeleteError } = await supabase
    .from("project_files")
    .delete()
    .eq("project_id", projectId)
  if (filesDeleteError) throw new Error("Não foi possível remover os arquivos do projeto.")

  const { error: verticesDeleteError } = await supabase
    .from("project_vertices")
    .delete()
    .eq("project_id", projectId)
  if (verticesDeleteError) throw new Error("Não foi possível remover os vértices do projeto.")

  const { error: jobsDeleteError } = await supabase
    .from("processing_jobs")
    .delete()
    .eq("project_id", projectId)
  if (jobsDeleteError) throw new Error("Não foi possível remover o processamento do projeto.")

  const { data: deletedProject, error: deleteError } = await supabase
    .from("projects")
    .delete()
    .eq("id", projectId)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle()

  if (deleteError) throw new Error("Não foi possível excluir o projeto.")
  if (!deletedProject) return { ok: false as const, error: "Projeto não encontrado." }

  return { ok: true as const }
}

export async function excluirProjetoCompleto(projectId: string, userId: string) {
  const permissions = await getMemorialPermissions(userId)
  if (!permissions.canDeleteMemorials) throw new ProjectDeletionPermissionError()
  return removerProjetoCompleto(projectId, userId)
}

export async function excluirProjetoCompletoComoAdmin(projectId: string, userId: string) {
  return removerProjetoCompleto(projectId, userId)
}

export async function limparProjetoAposFalhaDeCriacao(projectId: string, userId: string) {
  return removerProjetoCompleto(projectId, userId)
}

export async function excluirProjetoSemFalhar(projectId: string, userId: string) {
  try {
    await removerProjetoCompleto(projectId, userId)
  } catch {
    // O erro original do processamento continua sendo a mensagem exibida ao usuário.
  }
}
