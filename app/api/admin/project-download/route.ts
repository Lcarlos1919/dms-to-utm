import { Buffer } from "node:buffer"
import { z } from "zod"
import { ADMIN_PERMISSIONS, requireStaffApiPermission } from "@/lib/admin-auth"
import { jsonError } from "@/lib/admin"
import { writeAdminAuditLog } from "@/lib/audit"
import { nomeArquivo } from "@/lib/api/projetos"
import { crsDoProjeto, linhaParaVertice } from "@/lib/topocad-db/mapeamento"
import { gerarDxf, gerarXlsx } from "@/lib/topocad"
import { createAdminClient } from "@/lib/supabase/server"

export const runtime = "nodejs"

const requestSchema = z.object({
  projectId: z.string().uuid(),
  format: z.enum(["pdf", "xlsx", "dxf"]),
})
const SIGNED_URL_TTL_SECONDS = 60

export async function POST(request: Request) {
  const authorization = await requireStaffApiPermission(ADMIN_PERMISSIONS.projectsRead)
  if (!authorization.ok) return authorization.response

  const parsed = requestSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return jsonError("Projeto ou formato de arquivo inválido")

  const { projectId, format } = parsed.data
  const supabase = createAdminClient()
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id,user_id,name,status,original_filename,source_pdf_path,datum,epsg,utm_zone,utm_hemisphere,area_m2,perimeter_m")
    .eq("id", projectId)
    .maybeSingle()

  if (projectError) return jsonError("Não foi possível carregar o projeto", 500)
  if (!project) return jsonError("Projeto não encontrado", 404)

  if (format === "pdf") {
    if (!project.source_pdf_path) return jsonError("O PDF original não está disponível", 404)
    const baseName = project.original_filename?.replace(/\.pdf$/i, "") || project.name
    const fileName = nomeArquivo(baseName, "pdf")
    const { data, error } = await supabase.storage
      .from("memoriais")
      .createSignedUrl(project.source_pdf_path, SIGNED_URL_TTL_SECONDS, { download: fileName })

    if (error || !data?.signedUrl) return jsonError("Não foi possível preparar o download do PDF", 500)
    return Response.json({ url: data.signedUrl, expiresIn: SIGNED_URL_TTL_SECONDS })
  }

  if (project.status !== "ready") return jsonError("Processe o projeto antes de exportar", 409)

  const { data: rows, error: verticesError } = await supabase
    .from("project_vertices")
    .select("project_id,seq,code,lon_dms,lat_dms,lon_dec,lat_dec,altitude_m,vante_code,azimuth_dms,distance_m,confrontacao,easting,northing,edited")
    .eq("project_id", projectId)
    .order("seq", { ascending: true })

  if (verticesError) return jsonError("Não foi possível carregar os vértices", 500)
  if (!rows?.length) return jsonError("O projeto não possui vértices para exportar", 409)

  const vertices = rows.map(linhaParaVertice)
  const crs = crsDoProjeto(project as Parameters<typeof crsDoProjeto>[0])
  const fileName = nomeArquivo(project.name, format)
  const storagePath = `${project.user_id}/${project.id}/exports/${fileName}`
  const kind = format === "xlsx" ? "export_xlsx" : "export_dxf"
  let body: Buffer | string
  let contentType: string
  let sizeBytes: number

  if (format === "xlsx") {
    const workbook = gerarXlsx(vertices, crs, [
      ["Projeto", project.name],
      ["Área (m²)", Number(project.area_m2 ?? 0)],
      ["Perímetro (m)", Number(project.perimeter_m ?? 0)],
    ])
    body = Buffer.from(workbook)
    contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    sizeBytes = body.byteLength
  } else {
    body = gerarDxf(vertices)
    contentType = "application/dxf"
    sizeBytes = Buffer.byteLength(body, "utf8")
  }

  const { error: uploadError } = await supabase.storage
    .from("memoriais")
    .upload(storagePath, body, { upsert: true, contentType })
  if (uploadError) return jsonError("Não foi possível preparar o arquivo de exportação", 500)

  const { error: fileRecordError } = await supabase
    .from("project_files")
    .upsert({
      project_id: project.id,
      kind,
      storage_path: storagePath,
      original_filename: fileName,
      mime_type: contentType,
      size_bytes: sizeBytes,
    }, { onConflict: "project_id,kind" })

  if (fileRecordError) {
    await supabase.storage.from("memoriais").remove([storagePath])
    return jsonError("Não foi possível registrar o arquivo de exportação", 500)
  }

  await writeAdminAuditLog({
    actorId: authorization.context.userId,
    targetUserId: project.user_id,
    action: "project.export_prepared",
    metadata: { format },
  })

  const { data, error } = await supabase.storage
    .from("memoriais")
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS, { download: fileName })

  if (error || !data?.signedUrl) return jsonError("Não foi possível criar o link temporário", 500)
  return Response.json({ url: data.signedUrl, expiresIn: SIGNED_URL_TTL_SECONDS })
}
