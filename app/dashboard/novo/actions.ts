"use server"

import { requireUser } from "@/lib/auth"
import { createAdminClient } from "@/lib/supabase/server"
import { getUsageStatus } from "@/lib/usage"
import { processMemorial } from "@/lib/engine"
import { recalcularGeometria, type Vertice } from "@/lib/topocad"
import { verticeParaLinha } from "@/lib/topocad-db/mapeamento"
import { excluirProjetoCompleto } from "@/lib/projects/delete-project"
import { z } from "zod"

const MAX_SIZE = 10 * 1024 * 1024
const projectInput = z.object({ name: z.string().trim().min(1).max(120) })

type CreateProjectResult =
  | { ok: true; projectId: string; storagePath: string }
  | { ok: false; error: string; limitReached?: boolean }

type CreateProjectInput = FormData | { name: string; fileName: string }

export async function createProject(input: CreateProjectInput): Promise<CreateProjectResult> {
  const userId = await requireUser()
  const isFormData = input instanceof FormData
  const parsed = projectInput.safeParse({ name: isFormData ? input.get("name") : input.name })
  const file = isFormData ? input.get("file") : null
  if (!parsed.success) return { ok: false, error: "Informe um nome para o projeto." }
  if (isFormData && !(file instanceof File)) return { ok: false, error: "Selecione um arquivo PDF." }
  const fileName = isFormData && file instanceof File ? file.name : (input as { name: string; fileName: string }).fileName
  if (!fileName.toLowerCase().endsWith(".pdf")) return { ok: false, error: "O arquivo precisa ser um PDF válido." }
  if (isFormData && file instanceof File) {
    if (file.type !== "application/pdf" || file.size > MAX_SIZE) return { ok: false, error: "O arquivo precisa ser um PDF válido de até 10 MB." }
    const magic = new Uint8Array(await file.slice(0, 4).arrayBuffer())
    if (String.fromCharCode(...magic) !== "%PDF") return { ok: false, error: "O conteúdo do arquivo não é um PDF válido." }
  }
  const usage = await getUsageStatus(userId)
  if (!usage.canCreate) return { ok: false, error: "Você atingiu o limite do plano Grátis neste mês.", limitReached: true }
  const supabase = createAdminClient()
  const projectId = crypto.randomUUID()
  const storagePath = `${userId}/${projectId}.pdf`
  if (isFormData && file instanceof File) {
    const { error } = await supabase.storage.from("memoriais").upload(storagePath, file, { contentType: "application/pdf", upsert: false })
    if (error) return { ok: false, error: "Não foi possível enviar o PDF. Tente novamente." }
  }
  const { error: insertError } = await supabase.from("projects").insert({ id: projectId, user_id: userId, name: parsed.data.name, status: "draft", source_pdf_path: storagePath, original_filename: fileName })
  if (insertError) { if (isFormData) await supabase.storage.from("memoriais").remove([storagePath]); return { ok: false, error: "Não foi possível criar o projeto. Tente novamente." } }
  const { error: fileRecordError } = await supabase.from("project_files").insert({ project_id: projectId, kind: "memorial_pdf", storage_path: storagePath, original_filename: fileName, mime_type: "application/pdf", size_bytes: isFormData && file instanceof File ? file.size : null })
  if (fileRecordError) { await supabase.from("projects").delete().eq("id", projectId).eq("user_id", userId); if (isFormData) await supabase.storage.from("memoriais").remove([storagePath]); return { ok: false, error: "Não foi possível registrar o memorial. Tente novamente." } }
  await processMemorial(projectId, userId)
  return { ok: true, projectId, storagePath }
}

export async function attachSourcePdf(projectId: string, storagePath: string) {
  const userId = await requireUser()
  if (!storagePath.startsWith(`${userId}/`)) return { ok: false as const, error: "Caminho de arquivo inválido." }
  const { error } = await createAdminClient().from("projects").update({ source_pdf_path: storagePath }).eq("id", projectId).eq("user_id", userId)
  return error ? { ok: false as const, error: "Não foi possível anexar o PDF." } : { ok: true as const }
}

export async function excluirProjeto(projectId: string) {
  const userId = await requireUser()
  try {
    return await excluirProjetoCompleto(projectId, userId)
  } catch {
    return { ok: false as const, error: "Não foi possível excluir o projeto." }
  }
}

export async function retryProject(projectId: string) {
  const userId = await requireUser()
  const supabase = createAdminClient()
  const { data } = await supabase.from("projects").select("id").eq("id", projectId).eq("user_id", userId).maybeSingle()
  if (!data) return { ok: false as const, error: "Projeto não encontrado." }
  return processMemorial(projectId, userId)
}

const vertexSchema = z.object({
  seq: z.number().int().positive(),
  codigo: z.string().trim().min(1).max(80),
  lonDms: z.string().max(80),
  latDms: z.string().max(80),
  lon: z.number().finite(),
  lat: z.number().finite(),
  altitude: z.number().finite().nullable(),
  vante: z.string().trim().min(1).max(80),
  azimuteDms: z.string().max(80),
  distancia: z.number().finite().nonnegative(),
  confrontacao: z.string().max(1000),
  este: z.number().finite(),
  norte: z.number().finite(),
  editado: z.boolean(),
})

const saveVerticesSchema = z.object({
  projectId: z.string().uuid(),
  vertices: z.array(vertexSchema).max(500),
}).superRefine(({ vertices }, context) => {
  const codes = new Set(vertices.map((vertex) => vertex.codigo))
  if (codes.size !== vertices.length) {
    context.addIssue({ code: "custom", path: ["vertices"], message: "Os códigos dos vértices precisam ser únicos." })
  }
})

export async function saveProjectVertices(input: unknown) {
  const userId = await requireUser()
  const parsed = saveVerticesSchema.safeParse(input)
  if (!parsed.success) return { ok: false as const, error: "Confira os dados dos vértices e tente novamente." }

  const supabase = createAdminClient()
  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", parsed.data.projectId)
    .eq("user_id", userId)
    .maybeSingle()

  if (!project) return { ok: false as const, error: "Projeto não encontrado." }

  const vertices: Vertice[] = parsed.data.vertices.map((vertex, index) => ({ ...vertex, seq: index + 1 }))
  const rows = vertices.map((vertex) => verticeParaLinha(parsed.data.projectId, vertex))
  const { geometria } = recalcularGeometria(vertices)

  const { error: deleteError } = await supabase
    .from("project_vertices")
    .delete()
    .eq("project_id", parsed.data.projectId)

  if (deleteError) return { ok: false as const, error: "Não foi possível atualizar os vértices." }

  if (rows.length > 0) {
    const { error: insertError } = await supabase.from("project_vertices").insert(rows)
    if (insertError) return { ok: false as const, error: "Não foi possível atualizar os vértices." }
  }

  const { error: updateError } = await supabase
    .from("projects")
    .update({
      vertices: vertices.map((vertex) => ({
        id: vertex.codigo,
        e: vertex.este,
        n: vertex.norte,
        azimuth: vertex.azimuteDms,
        distance: vertex.distancia,
      })),
      area_m2: geometria.areaM2,
      perimeter_m: geometria.perimetroGradeM,
      closure_error_m: geometria.divergenciaMaxDistanciaM,
      is_closed: geometria.poligonoFechado,
      status: vertices.length >= 3 ? "ready" : "draft",
      error_code: null,
      error_message: null,
    })
    .eq("id", parsed.data.projectId)
    .eq("user_id", userId)

  if (updateError) return { ok: false as const, error: "Não foi possível salvar as alterações do projeto." }
  return { ok: true as const }
}
