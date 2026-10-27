import { revalidatePath } from "next/cache"
import { z } from "zod"
import { ADMIN_PERMISSIONS, requireStaffApiPermission } from "@/lib/admin-auth"
import { jsonError } from "@/lib/admin"
import { writeAdminAuditLog } from "@/lib/audit"
import { processMemorial } from "@/lib/engine"
import { excluirProjetoCompleto } from "@/lib/projects/delete-project"
import { createAdminClient } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const maxDuration = 60

const projectIdSchema = z.object({ id: z.string().uuid() })

export async function GET() {
  const authorization = await requireStaffApiPermission(ADMIN_PERMISSIONS.projectsRead)
  if (!authorization.ok) return authorization.response

  const { data, error } = await createAdminClient()
    .from("projects")
    .select("id,user_id,name,status,area_m2,error_code,error_message,created_at,updated_at")
    .order("created_at", { ascending: false })

  if (error) return jsonError("Não foi possível carregar projetos", 500)
  return Response.json({ ok: true, data })
}

export async function POST(request: Request) {
  const authorization = await requireStaffApiPermission(ADMIN_PERMISSIONS.projectsManage)
  if (!authorization.ok) return authorization.response
  const access = authorization.context

  const parsed = projectIdSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return jsonError("ID de projeto inválido")

  const supabase = createAdminClient()
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id,user_id,status")
    .eq("id", parsed.data.id)
    .maybeSingle()

  if (projectError) return jsonError("Não foi possível carregar projeto", 500)
  if (!project) return jsonError("Projeto não encontrado", 404)
  if (project.status !== "error") return jsonError("Somente projetos com erro podem ser reprocessados", 409)

  await writeAdminAuditLog({
    actorId: access.userId,
    targetUserId: project.user_id,
    action: "project.reprocess_started",
    metadata: { projectId: project.id },
  })

  const result = await processMemorial(project.id, project.user_id)
  if (!result.ok) {
    await writeAdminAuditLog({
      actorId: access.userId,
      targetUserId: project.user_id,
      action: "project.reprocess_failed",
      metadata: { projectId: project.id, errorCode: result.error },
    })
    return jsonError(result.message, result.status)
  }

  await writeAdminAuditLog({
    actorId: access.userId,
    targetUserId: project.user_id,
    action: "project.reprocessed",
    metadata: { projectId: project.id },
  })
  revalidatePath("/admin/projetos")
  revalidatePath(`/admin/projetos/${project.id}`)

  return Response.json({ ok: true })
}

export async function DELETE(request: Request) {
  const authorization = await requireStaffApiPermission(ADMIN_PERMISSIONS.projectsDelete)
  if (!authorization.ok) return authorization.response
  const access = authorization.context

  const parsed = projectIdSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return jsonError("ID de projeto inválido")

  const supabase = createAdminClient()
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id,user_id")
    .eq("id", parsed.data.id)
    .maybeSingle()

  if (projectError) return jsonError("Não foi possível carregar projeto", 500)
  if (!project) return jsonError("Projeto não encontrado", 404)

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
  revalidatePath("/admin/projetos")
  revalidatePath(`/admin/projetos/${project.id}`)

  return Response.json({ ok: true })
}
