import "server-only"

import { auth } from "@clerk/nextjs/server"
import { redirect } from "next/navigation"
import { getStaffContext, isStaffAdmin, requireStaff } from "@/lib/admin-auth"

export async function requireUser() {
  const { userId } = await auth()
  if (!userId) redirect("/sign-in")
  return userId
}

export async function hasStaffAccess() {
  return Boolean(await getStaffContext())
}

export async function requireAdmin() {
  const context = await requireStaff()
  if (!isStaffAdmin(context)) redirect("/dashboard")
  return context.userId
}

type AdminApiResult = { ok: true; userId: string } | { ok: false; response: Response }

export async function requireAdminApi(): Promise<AdminApiResult> {
  const context = await getStaffContext()
  if (!context) return { ok: false, response: Response.json({ error: "Não autorizado" }, { status: 401 }) }
  if (!isStaffAdmin(context)) return { ok: false, response: Response.json({ error: "Permissão insuficiente" }, { status: 403 }) }
  return { ok: true, userId: context.userId }
}
