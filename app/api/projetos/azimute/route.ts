import { revalidatePath } from "next/cache"
import { z } from "zod"
import { erroApi, identidadeApi } from "@/lib/api/projetos"
import { canUseFeature } from "@/lib/features"
import { MAX_PDF_SIZE, sanitizePdfFileName, validatePdfBlob } from "@/lib/pdf-validation"
import { limparProjetoAposFalhaDeCriacao } from "@/lib/projects/delete-project"
import { createAdminClient } from "@/lib/supabase/server"
import { getUsageStatus } from "@/lib/usage"

export const runtime = "nodejs"

const projectNameSchema = z.string().trim().min(1).max(120)
const memorialTypeSchema = z.enum(["coordenadas", "azimute"])
const fileMetadataSchema = z.object({
  name: z.string().max(512),
  type: z.string().max(128),
  size: z.number().int().positive(),
})
const prepareSchema = z.object({
  action: z.literal("prepare"),
  memorial_type: memorialTypeSchema,
  name: projectNameSchema,
  memorial: fileMetadataSchema,
  planta: fileMetadataSchema,
})
const finalizeSchema = z.object({
  action: z.literal("finalize"),
  memorial_type: memorialTypeSchema,
  projectId: z.string().uuid(),
  name: projectNameSchema,
  memorialFileName: z.string().max(512),
  plantaFileName: z.string().max(512),
})
const cancelSchema = z.object({ projectId: z.string().uuid() })

async function checkAzimuteAccess(userId: string) {
  let usage: Awaited<ReturnType<typeof getUsageStatus>>
  try {
    usage = await getUsageStatus(userId)
  } catch {
    return erroApi(500, "ERRO_PERMISSAO", "Não foi possível verificar as permissões da conta.")
  }

  if (!usage.canCreateMemorials) {
    return erroApi(403, "PERMISSAO_NEGADA", "A criação de memoriais está bloqueada para esta conta.")
  }
  if (!(await canUseFeature(userId, "memorial_azimute"))) {
    return erroApi(403, "FEATURE_BLOQUEADA", "O envio por azimute não está habilitado para este plano.")
  }

  return null
}

function removePendingFiles(userId: string, projectId: string) {
  return createAdminClient().storage.from("memoriais").remove([
    `${userId}/${projectId}/arquivo.pdf`,
    `${userId}/${projectId}/planta.pdf`,
  ])
}

export async function POST(request: Request) {
  const userId = await identidadeApi()
  if (!userId) return erroApi(401, "NAO_AUTORIZADO", "Entre na sua conta.")

  const body = prepareSchema.safeParse(await request.json().catch(() => null))
  if (!body.success) return erroApi(400, "ENTRADA_INVALIDA", "Confira o nome, tipo e arquivos do projeto.")
  if (body.data.memorial_type !== "azimute") {
    return erroApi(400, "TIPO_INCOMPATIVEL", "Este endpoint recebe memoriais por azimute.")
  }

  const accessError = await checkAzimuteAccess(userId)
  if (accessError) return accessError

  const memorialFileName = sanitizePdfFileName(body.data.memorial.name)
  const plantaFileName = sanitizePdfFileName(body.data.planta.name)
  if (!memorialFileName) return erroApi(400, "MEMORIAL_INVALIDO", "O nome do memorial precisa identificar um PDF válido.")
  if (!plantaFileName) return erroApi(400, "PLANTA_INVALIDA", "O nome da planta precisa identificar um PDF válido.")
  if (body.data.memorial.type !== "application/pdf" || body.data.memorial.size > MAX_PDF_SIZE) {
    return erroApi(400, "MEMORIAL_INVALIDO", "O memorial precisa ser um PDF válido de até 10 MB.")
  }
  if (body.data.planta.type !== "application/pdf" || body.data.planta.size > MAX_PDF_SIZE) {
    return erroApi(400, "PLANTA_INVALIDA", "A planta precisa ser um PDF válido de até 10 MB.")
  }

  const supabase = createAdminClient()
  const projectId = crypto.randomUUID()
  const memorialPath = `${userId}/${projectId}/arquivo.pdf`
  const plantaPath = `${userId}/${projectId}/planta.pdf`
  const storage = supabase.storage.from("memoriais")
  const [memorialUpload, plantaUpload] = await Promise.all([
    storage.createSignedUploadUrl(memorialPath),
    storage.createSignedUploadUrl(plantaPath),
  ])

  if (memorialUpload.error || !memorialUpload.data || plantaUpload.error || !plantaUpload.data) {
    return erroApi(500, "UPLOAD_INDISPONIVEL", "Não foi possível preparar o envio dos arquivos.")
  }

  return Response.json({
    ok: true,
    projectId,
    memorial: { path: memorialPath, token: memorialUpload.data.token, fileName: memorialFileName },
    planta: { path: plantaPath, token: plantaUpload.data.token, fileName: plantaFileName },
  }, { status: 201, headers: { "Cache-Control": "no-store" } })
}

export async function PUT(request: Request) {
  const userId = await identidadeApi()
  if (!userId) return erroApi(401, "NAO_AUTORIZADO", "Entre na sua conta.")

  const body = finalizeSchema.safeParse(await request.json().catch(() => null))
  if (!body.success) return erroApi(400, "ENTRADA_INVALIDA", "Confira os dados do envio e tente novamente.")
  if (body.data.memorial_type !== "azimute") {
    return erroApi(400, "TIPO_INCOMPATIVEL", "Este endpoint recebe memoriais por azimute.")
  }

  const supabase = createAdminClient()
  const { data: existingProject, error: existingProjectError } = await supabase
    .from("projects")
    .select("id")
    .eq("id", body.data.projectId)
    .eq("user_id", userId)
    .maybeSingle()
  if (existingProjectError) return erroApi(500, "ERRO_BANCO", "Não foi possível verificar o projeto.")
  if (existingProject) return Response.json({ ok: true, projectId: body.data.projectId })

  const accessError = await checkAzimuteAccess(userId)
  if (accessError) {
    const { error: cleanupError } = await removePendingFiles(userId, body.data.projectId)
    if (cleanupError) return erroApi(500, "LIMPEZA_FALHOU", "Não foi possível limpar os arquivos enviados.")
    return accessError
  }

  const memorialPath = `${userId}/${body.data.projectId}/arquivo.pdf`
  const plantaPath = `${userId}/${body.data.projectId}/planta.pdf`
  const storage = supabase.storage.from("memoriais")
  const [memorialDownload, plantaDownload] = await Promise.all([
    storage.download(memorialPath),
    storage.download(plantaPath),
  ])

  if (memorialDownload.error || !memorialDownload.data || plantaDownload.error || !plantaDownload.data) {
    const { error: cleanupError } = await removePendingFiles(userId, body.data.projectId)
    if (cleanupError) return erroApi(500, "LIMPEZA_FALHOU", "Não foi possível localizar e limpar os arquivos enviados.")
    return erroApi(400, "ARQUIVOS_AUSENTES", "Envie os dois arquivos novamente.")
  }

  const [memorial, planta] = await Promise.all([
    validatePdfBlob(memorialDownload.data, body.data.memorialFileName),
    validatePdfBlob(plantaDownload.data, body.data.plantaFileName),
  ])
  if (!memorial.ok) {
    const { error: cleanupError } = await removePendingFiles(userId, body.data.projectId)
    if (cleanupError) return erroApi(500, "LIMPEZA_FALHOU", "Não foi possível limpar os arquivos inválidos.")
    return erroApi(400, "MEMORIAL_INVALIDO", `Memorial descritivo: ${memorial.error}`)
  }
  if (!planta.ok) {
    const { error: cleanupError } = await removePendingFiles(userId, body.data.projectId)
    if (cleanupError) return erroApi(500, "LIMPEZA_FALHOU", "Não foi possível limpar os arquivos inválidos.")
    return erroApi(400, "PLANTA_INVALIDA", `Planta do lote: ${planta.error}`)
  }

  const { error: projectError } = await supabase.from("projects").insert({
    id: body.data.projectId,
    user_id: userId,
    name: body.data.name,
    status: "draft",
    source_pdf_path: memorialPath,
    original_filename: memorial.sanitizedFileName,
    memorial_type: body.data.memorial_type,
    planta_path: plantaPath,
  })
  if (projectError) {
    const { error: cleanupError } = await removePendingFiles(userId, body.data.projectId)
    if (cleanupError) return erroApi(500, "LIMPEZA_FALHOU", "Não foi possível criar o projeto nem limpar os arquivos enviados.")
    return erroApi(500, "ERRO_BANCO", "Não foi possível criar o projeto.")
  }

  const { error: fileRecordError } = await supabase.from("project_files").insert({
    project_id: body.data.projectId,
    kind: "memorial_pdf",
    storage_path: memorialPath,
    original_filename: memorial.sanitizedFileName,
    mime_type: "application/pdf",
    size_bytes: memorial.size,
  })
  if (fileRecordError) {
    try {
      const cleanup = await limparProjetoAposFalhaDeCriacao(body.data.projectId, userId)
      if (!cleanup.ok) return erroApi(500, "LIMPEZA_FALHOU", "Não foi possível registrar os arquivos nem limpar o projeto.")
    } catch {
      return erroApi(500, "LIMPEZA_FALHOU", "Não foi possível registrar os arquivos nem limpar o projeto.")
    }
    return erroApi(500, "ERRO_BANCO", "Não foi possível registrar o memorial enviado.")
  }

  revalidatePath("/dashboard")
  return Response.json({ ok: true, projectId: body.data.projectId }, { status: 201 })
}

export async function DELETE(request: Request) {
  const userId = await identidadeApi()
  if (!userId) return erroApi(401, "NAO_AUTORIZADO", "Entre na sua conta.")

  const body = cancelSchema.safeParse(await request.json().catch(() => null))
  if (!body.success) return erroApi(400, "ENTRADA_INVALIDA", "Projeto inválido.")

  const supabase = createAdminClient()
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id")
    .eq("id", body.data.projectId)
    .eq("user_id", userId)
    .maybeSingle()
  if (projectError) return erroApi(500, "ERRO_BANCO", "Não foi possível cancelar o envio.")
  if (project) return Response.json({ ok: true })

  const { error: cleanupError } = await removePendingFiles(userId, body.data.projectId)
  if (cleanupError) return erroApi(500, "LIMPEZA_FALHOU", "Não foi possível limpar os arquivos enviados.")
  return Response.json({ ok: true })
}
