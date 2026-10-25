import "server-only"

import { isStaleProcessing } from "@/lib/project-status"
import { createAdminClient } from "@/lib/supabase/server"
import { getUsageStatus, incrementUsage } from "@/lib/usage"
import { ErroApp, extrairItensDoPdf } from "@/lib/pdf/extrair-itens"
import { processarPaginas, type ResultadoMotor } from "@/lib/topocad"
import { projetoDoResultado, verticeParaLinha } from "@/lib/topocad-db/mapeamento"
import { excluirProjetoSemFalhar } from "@/lib/projects/delete-project"

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

  const usage = await getUsageStatus(userId)
  if (!usage.canCreate) {
    return {
      ok: false,
      error: "COTA_EXCEDIDA",
      message: "Você atingiu o limite de memoriais do plano Grátis neste mês.",
      status: 403,
    }
  }

  const { error: processingError } = await db
    .from("projects")
    .update({ status: "processing", error_code: null, error_message: null })
    .eq("id", projectId)
    .eq("user_id", userId)

  if (processingError) {
    return {
      ok: false,
      error: "STATUS_UPDATE_FAILED",
      message: "Não foi possível iniciar o processamento.",
      status: 500,
    }
  }

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

    const { error: updateError } = await db
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

    if (updateError) {
      throw new MemorialProcessingError("PROJECT_UPDATE_FAILED", "Não foi possível atualizar o projeto processado.", 500)
    }

    await incrementUsage(userId).catch(() => undefined)

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

    await excluirProjetoSemFalhar(projectId, userId)
    return { ok: false, error: code, message, status }
  }
}

export async function processMemorialForUser(projectId: string, userId: string) {
  return processMemorial(projectId, userId)
}

export const memorialEngineMessage = "O memorial será processado após o upload."
