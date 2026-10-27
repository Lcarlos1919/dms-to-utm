import "server-only"

import { isStaleProcessing } from "@/lib/project-status"
import { createAdminClient } from "@/lib/supabase/server"
import { getUsageStatus, incrementUsage } from "@/lib/usage"
import { ErroApp, extrairItensDoPdf } from "@/lib/pdf/extrair-itens"
import { processarPaginas, type ResultadoMotor } from "@/lib/topocad"
import { projetoDoResultado, verticeParaLinha } from "@/lib/topocad-db/mapeamento"

export type ProcessResult =
  | { ok: true; result: Extract<ResultadoMotor, { ok: true }> }
  | { ok: false; error: string; message: string; status: number }

class MemorialProcessingError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status = 422,
  ) {
    super(message)
    this.name = "MemorialProcessingError"
  }
}

export async function processMemorial(projectId: string, userId: string): Promise<ProcessResult> {
  const db = createAdminClient()
  const { data: project, error: projectError } = await db
    .from("projects")
    .select("id,source_pdf_path,status,updated_at")
    .eq("id", projectId)
    .eq("user_id", userId)
    .maybeSingle()

  if (projectError) {
    return { ok: false, error: "ERRO_BANCO", message: "Não foi possível carregar o projeto.", status: 500 }
  }

  if (!project) {
    return { ok: false, error: "PROJETO_NAO_ENCONTRADO", message: "Projeto não encontrado.", status: 404 }
  }

  const isStale = isStaleProcessing(project.status, project.updated_at)
  if (!isStale && !["draft", "error"].includes(project.status)) {
    return {
      ok: false,
      error: "PROJETO_EM_PROCESSAMENTO",
      message: "O memorial não pode ser processado neste estado.",
      status: 409,
    }
  }

  if (!project.source_pdf_path) {
    return {
      ok: false,
      error: "PDF_NAO_ENCONTRADO",
      message: "O arquivo PDF deste memorial não foi encontrado.",
      status: 400,
    }
  }

  const usage = await getUsageStatus(userId, {
    excludeProcessingProjectId: project.status === "processing" && isStale ? projectId : undefined,
  })
  if (!usage.canCreate) {
    return {
      ok: false,
      error: "COTA_EXCEDIDA",
      message: "Você atingiu o limite de memoriais do plano Grátis neste mês.",
      status: 403,
    }
  }

  const { data: claimedProject, error: processingError } = await db
    .from("projects")
    .update({ status: "processing", error_code: null, error_message: null })
    .eq("id", projectId)
    .eq("user_id", userId)
    .eq("status", project.status)
    .eq("updated_at", project.updated_at)
    .select("id,updated_at")
    .maybeSingle()

  if (processingError || !claimedProject) {
    return {
      ok: false,
      error: "PROJETO_EM_PROCESSAMENTO",
      message: "O memorial já está sendo processado. Atualize a página e tente novamente.",
      status: processingError ? 500 : 409,
    }
  }

  let terminalUpdatedAt = claimedProject.updated_at

  try {
    const { data: file, error: downloadError } = await db.storage
      .from("memoriais")
      .download(project.source_pdf_path)

    if (downloadError || !file) {
      throw new MemorialProcessingError("PDF_INVALIDO", "Não foi possível abrir o PDF enviado.")
    }

    const pages = await extrairItensDoPdf(new Uint8Array(await file.arrayBuffer()))
    const result = processarPaginas(pages)

    if (!result.ok) {
      throw new MemorialProcessingError(result.erro.codigo, result.erro.mensagem)
    }

    const vertexRows = result.vertices.map((vertex) => verticeParaLinha(projectId, vertex))
    const { error: deleteError } = await db
      .from("project_vertices")
      .delete()
      .eq("project_id", projectId)

    if (deleteError) {
      throw new MemorialProcessingError("VERTEX_PERSISTENCE_FAILED", "Não foi possível salvar os vértices do memorial.", 500)
    }

    const { error: insertError } = await db.from("project_vertices").insert(vertexRows)
    if (insertError) {
      throw new MemorialProcessingError("VERTEX_PERSISTENCE_FAILED", "Não foi possível salvar os vértices do memorial.", 500)
    }

    const { data: completedProject, error: updateError } = await db
      .from("projects")
      .update({
        ...projetoDoResultado(result),
        vertices: result.vertices.map((vertex) => ({
          id: String(vertex.seq),
          code: vertex.codigo,
          e: vertex.este,
          n: vertex.norte,
          azimuth: vertex.azimuteDms,
          distance: vertex.distancia,
        })),
      })
      .eq("id", projectId)
      .eq("user_id", userId)
      .eq("status", "processing")
      .eq("updated_at", claimedProject.updated_at)
      .select("id,updated_at")
      .maybeSingle()

    if (updateError || !completedProject) {
      throw new MemorialProcessingError("PROJECT_UPDATE_FAILED", "Não foi possível atualizar o projeto processado.", 500)
    }

    terminalUpdatedAt = completedProject.updated_at
    try {
      await incrementUsage(userId)
    } catch {
      throw new MemorialProcessingError("USAGE_UPDATE_FAILED", "Não foi possível registrar o uso do memorial.", 500)
    }

    return { ok: true, result }
  } catch (error) {
    const code = error instanceof MemorialProcessingError
      ? error.code
      : error instanceof ErroApp
        ? error.codigo
        : "PROCESSAMENTO_FALHOU"
    const message = error instanceof MemorialProcessingError || error instanceof ErroApp
      ? error.message
      : "Não foi possível processar o memorial. Confira o PDF e tente novamente."
    const status = error instanceof MemorialProcessingError ? error.status : error instanceof ErroApp ? 422 : 500

    await db
      .from("projects")
      .update({ status: "error", error_code: code, error_message: message })
      .eq("id", projectId)
      .eq("user_id", userId)
      .eq("updated_at", terminalUpdatedAt)

    return { ok: false, error: code, message, status }
  }
}

export async function processMemorialForUser(projectId: string, userId: string) {
  return processMemorial(projectId, userId)
}

export const memorialEngineMessage = "O memorial será processado após o upload."
