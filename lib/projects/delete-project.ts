import "server-only"

import { createAdminClient } from "@/lib/supabase/server"

/** Remove todos os dados e o PDF de um projeto pertencente ao usuário. */
export async function excluirProjetoCompleto(projectId: string, userId: string) {
  const supabase = createAdminClient()
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, source_pdf_path")
    .eq("id", projectId)
    .eq("user_id", userId)
    .maybeSingle()

  if (projectError) throw new Error("Não foi possível localizar o projeto.")
  if (!project) return { ok: false as const, error: "Projeto não encontrado." }

  const projectIds = [projectId]
  await supabase.from("project_vertices").delete().in("project_id", projectIds)
  await supabase.from("project_files").delete().in("project_id", projectIds)
  await supabase.from("processing_jobs").delete().in("project_id", projectIds)
  await supabase.from("audit_logs").delete().in("project_id", projectIds)

  if (project.source_pdf_path) {
    await supabase.storage.from("memoriais").remove([project.source_pdf_path])
  }

  const { error: deleteError } = await supabase
    .from("projects")
    .delete()
    .eq("id", projectId)
    .eq("user_id", userId)

  if (deleteError) throw new Error("Não foi possível excluir o projeto.")
  return { ok: true as const }
}

export async function excluirProjetoSemFalhar(projectId: string, userId: string) {
  try {
    await excluirProjetoCompleto(projectId, userId)
  } catch {
    // O erro original do processamento continua sendo a mensagem exibida ao usuário.
  }
}
