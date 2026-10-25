import { z } from "zod"
import { ADMIN_PERMISSIONS, ForbiddenError, requirePermission } from "@/lib/admin-auth"
import { jsonError } from "@/lib/admin"
import { writeAdminAuditLog } from "@/lib/audit"
import { excluirProjetoCompleto } from "@/lib/projects/delete-project"
import { createAdminClient } from "@/lib/supabase/server"

export async function GET() {
  try {
    await requirePermission(ADMIN_PERMISSIONS.projectsRead)
  } catch (error) {
    if (error instanceof ForbiddenError) return jsonError("Permissão insuficiente", 403)
    throw error
  }

  const { data, error } = await createAdminClient()
    .from("projects")
    .select("id,user_id,name,status,area_m2,created_at")
    .order("created_at", { ascending: false })

  if (error) return jsonError("Não foi possível carregar projetos", 500)
  return Response.json({ ok: true, data })
}

const deleteSchema = z.object({ id: z.string().uuid() })

export async function DELETE(request: Request) {
  let access
  try {
    access = await requirePermission(ADMIN_PERMISSIONS.projectsManage)
  } catch (error) {
    if (error instanceof ForbiddenError) return jsonError("Permissão insuficiente", 403)
    throw error
  }

  const parsed = deleteSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return jsonError("ID de projeto inválido")

  const supabase = createAdminClient()
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id,user_id")
    .eq("id", parsed.data.id)
    .maybeSingle()

  if (projectError) return jsonError("Não foi possível carregar projeto", 500)
  if (!project) return jsonError("Projeto não encontrado", 404)
  if (project.user_id === access.userId) return jsonError("Você não pode excluir seu próprio projeto", 403)

  try {
    const result = await excluirProjetoCompleto(project.id, project.user_id)
    if (!result.ok) return jsonError("Projeto não encontrado", 404)
  } catch {
    return jsonError("Não foi possível excluir projeto e arquivos associados", 500)
  }

  await writeAdminAuditLog({
    actorId: access.userId,
    targetUserId: project.user_id,
    action: "project.deleted",
    metadata: { projectId: project.id },
  })

  return Response.json({ ok: true })
}
