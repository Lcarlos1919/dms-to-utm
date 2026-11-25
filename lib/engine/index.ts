import "server-only"

import { isStaleProcessing } from "@/lib/project-status"
import { createAdminClient } from "@/lib/supabase/server"
import { getUsageStatus, incrementUsage } from "@/lib/usage"
import { ErroApp, extrairItensComOcr } from "@/lib/pdf/extrair-itens"
import { processarPaginas, reconstruirLinhas, type ResultadoMotor } from "@/lib/topocad"
import { canUseFeature } from "@/lib/features"
import { processarAzimute, type EtapaAzimute } from "@/lib/azimute/processar"
import { lerMemorial } from "@/lib/vertix-core/memorial"
import { projetoDoResultado, verticeParaLinha } from "@/lib/topocad-db/mapeamento"
import { contarPistas, criarDiagnostico, gravarDiagnostico, registrar, resumirPilha } from "@/lib/engine/diagnostico"

export type ProcessResult =
  | { ok: true; result: Extract<ResultadoMotor, { ok: true }> }
  | { ok: true; azimute: true; etapa: EtapaAzimute; message: string }
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
  let { data: project, error: projectError } = await db
    .from("projects")
    .select("id,source_pdf_path,status,updated_at,memorial_type")
    .eq("id", projectId)
    .eq("user_id", userId)
    .maybeSingle()

  // Banco sem a coluna memorial_type (SQL 005b ainda não aplicado): segue como coordenadas.
  if (projectError?.message.toLowerCase().includes("memorial_type")) {
    const legado = await db
      .from("projects")
      .select("id,source_pdf_path,status,updated_at")
      .eq("id", projectId)
      .eq("user_id", userId)
      .maybeSingle()
    project = legado.data ? { ...legado.data, memorial_type: "coordenadas" } : null
    projectError = legado.error
  }

  if (projectError) {
    return { ok: false, error: "ERRO_BANCO", message: "Não foi possível carregar o projeto.", status: 500 }
  }

  if (!project) {
    return { ok: false, error: "PROJETO_NAO_ENCONTRADO", message: "Projeto não encontrado.", status: 404 }
  }

  // Memorial por azimute tem pipeline próprio (leitura, validação e posicionamento).
  if (project.memorial_type === "azimute") {
    if (!(await canUseFeature(userId, "memorial_azimute"))) {
      return { ok: false, error: "FEATURE_BLOQUEADA", message: "O memorial por azimute não está habilitado para este plano.", status: 403 }
    }
    const r = await processarAzimute(projectId, userId, { reler: true })
    return r.ok
      ? { ok: true, azimute: true, etapa: r.etapa, message: r.mensagem }
      : { ok: false, error: r.codigo, message: r.mensagem, status: r.status }
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
  const diagnostico = criarDiagnostico(projectId)
  registrar(diagnostico, "inicio", "info", "Processamento iniciado.", {
    statusAnterior: project.status,
    memorialType: project.memorial_type ?? null,
  })

  try {
    const { data: file, error: downloadError } = await db.storage
      .from("memoriais")
      .download(project.source_pdf_path)

    if (downloadError || !file) {
      registrar(diagnostico, "download", "erro", "Não foi possível baixar o PDF do armazenamento.", {
        caminho: project.source_pdf_path,
        erroStorage: downloadError?.message ?? "arquivo vazio",
      })
      throw new MemorialProcessingError("PDF_INVALIDO", "Não foi possível abrir o PDF enviado.")
    }
    registrar(diagnostico, "download", "info", "PDF baixado.", { bytes: file.size })

    const { paginas: pages, avisos: avisosOcr } = await extrairItensComOcr(new Uint8Array(await file.arrayBuffer()))
    registrar(diagnostico, "ocr", "info", "Texto extraído (nativo e OCR).", {
      paginas: pages.length,
      paginasComTexto: pages.filter((p) => p.length > 0).length,
      itensPorPagina: pages.map((p) => p.length),
      avisosOcr,
      // Texto como o motor recebeu (para diagnosticar o que o OCR leu). Limitado em tamanho.
      textoPorPagina: pages.map((p) => reconstruirLinhas(p).slice(0, 120).map((linha) => linha.slice(0, 240))),
    })
    const result = processarPaginas(pages, {}, 2, avisosOcr.map((mensagem) => ({ codigo: "OCR_APLICADO" as const, mensagem })))
    registrar(
      diagnostico,
      "motor",
      result.ok ? "info" : "erro",
      result.ok ? "Vértices calculados." : result.erro.mensagem,
      result.ok
        ? { vertices: result.vertices.length, avisos: result.avisos }
        : {
            codigo: result.erro.codigo,
            avisos: result.avisos,
            contagens: contarPistas(pages.map((p) => reconstruirLinhas(p).join("\n")).join("\n")),
          },
    )

    // Sem coordenadas, mas com azimutes e distâncias: é um memorial por azimute.
    if (!result.ok && result.erro.codigo === "NENHUM_VERTICE") {
      const texto = pages.map((p) => reconstruirLinhas(p).join("\n")).join("\n")
      const segmentosLidos = lerMemorial(texto).segmentos.length
      const permitidoPeloPlano = segmentosLidos >= 3 ? await canUseFeature(userId, "memorial_azimute") : false
      registrar(
        diagnostico,
        "azimute_deteccao",
        segmentosLidos >= 3 && permitidoPeloPlano ? "info" : "aviso",
        segmentosLidos < 3
          ? "Sem coordenadas e menos de 3 segmentos de azimute: não é convertido."
          : permitidoPeloPlano
            ? "Sem coordenadas e com azimutes: convertendo para o fluxo por azimute."
            : "Sem coordenadas e com azimutes, mas o plano do usuário não tem o fluxo por azimute.",
        { segmentosLidos, minimoSegmentos: 3, permitidoPeloPlano },
      )
      if (segmentosLidos >= 3 && permitidoPeloPlano) {
        const { data: convertido } = await db
          .from("projects")
          .update({ memorial_type: "azimute", status: "draft", error_code: null, error_message: null })
          .eq("id", projectId)
          .eq("user_id", userId)
          .eq("status", "processing")
          .select("id")
          .maybeSingle()
        if (convertido) {
          const r = await processarAzimute(projectId, userId, { reler: true })
          registrar(diagnostico, "azimute", r.ok ? "info" : "erro", r.mensagem, r.ok ? { etapa: r.etapa } : { codigo: r.codigo, status: r.status })
          await gravarDiagnostico(projectId, userId, diagnostico)
          return r.ok
            ? { ok: true, azimute: true, etapa: r.etapa, message: r.mensagem }
            : { ok: false, error: r.codigo, message: r.mensagem, status: r.status }
        }
      }
    }

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

    registrar(diagnostico, "concluido", "info", "Memorial processado com sucesso.", { vertices: result.vertices.length })
    await gravarDiagnostico(projectId, userId, diagnostico)
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

    const pilha = resumirPilha(error)
    registrar(diagnostico, "erro", "erro", message, {
      codigo: code,
      status,
      tipo: error instanceof Error ? error.name : typeof error,
      pilha,
    })
    // Log do servidor (Vercel): uma linha JSON por falha, com o mesmo conteúdo do diagnóstico.
    console.error("[memorial] falha no processamento", JSON.stringify({ projectId, codigo: code, status, mensagem: message, pilha }))
    // Separado do update de status: se a coluna diagnostico faltar, o erro ainda fica registrado.
    await gravarDiagnostico(projectId, userId, diagnostico)

    return { ok: false, error: code, message, status }
  }
}

export async function processMemorialForUser(projectId: string, userId: string) {
  return processMemorial(projectId, userId)
}

export const memorialEngineMessage = "O memorial será processado após o upload."
